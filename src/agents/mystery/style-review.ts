import { getMaxOutputTokens } from '../../sillytavern/token-budget';
import { maintextToScene } from '../../engine/scene-parser';
import { callSecondaryApi, type ApiConfig, type ResponseFormat } from '../../sillytavern/api-router';
import type { ChatMessage, ChatPreset } from '../../sillytavern/types';
import { buildStyleCriticUserPrompt } from './prompts';
import { createParseState, parseChunk } from '../../sillytavern/stream-parser';
import { completeParsedStructured, extractJson, type AgentCompletion } from './structured';
import type { FactReview, FactReviewViolation } from './types';

type GroundedStyleViolation = FactReviewViolation & { oldQuote?: string; candidateQuote?: string };
type GroundedStyleReview = Omit<FactReview, 'violations'> & { violations: GroundedStyleViolation[] };

const STYLE_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'grounded_style_review', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['approved', 'violations', 'corrections'],
      properties: {
        approved: { type: 'boolean' },
        violations: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['code', 'message', 'oldQuote', 'candidateQuote'],
          properties: {
            code: { type: 'string', enum: ['repeated-prose', 'repeated-imagery', 'style-template-repetition'] },
            message: { type: 'string' }, oldQuote: { type: 'string' }, candidateQuote: { type: 'string' },
          },
        } },
        corrections: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

const GROUNDED_STYLE_PROMPT = `你是文风连续性审查员，只比较已接受旧正文和候选正文。
拒绝仅限完整长句、段落或具有同样叙事功能的具体表达明显重复，且没有递进或反转。
角色固定特点、职业身份、习惯及持续天气、相同地点不等于重复；不要以抽象段落模板、气氛或普通动作相似为理由阻断。
exemptTexts 是本回合授权且必须呈现的证据原文，允许重复。简短服务用语、姓名、必要承接和有推进的回环允许。
每项违规必须给出逐字可核验的 oldQuote（只能来自已接受旧正文）和 candidateQuote（只能来自候选正文），至少引用有意义的完整表达。
不得虚构旧文或把候选中的句子当旧文；找不到双方确切引句则通过。message 必须说明具体表达及叙事功能如何重复。
只输出 JSON：{"approved":boolean,"violations":[{"code":"repeated-prose|repeated-imagery|style-template-repetition","message":"string","oldQuote":"string","candidateQuote":"string"}],"corrections":["string"]}。`;

const MIN_EXACT_LENGTH = 10;
const MIN_NEAR_LENGTH = 16;
const NEAR_DUPLICATE_THRESHOLD = 0.75;
// Semantic judgement may catch longer rewrites below the automatic 0.75 cutoff,
// but topic/character similarity alone is not evidence of repeated prose.
const MIN_SEMANTIC_WORDING_OVERLAP = 0.6;

function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:'“”‘’（）()《》【】—…·]/gu, '');
}

function sentenceList(narrative: string): Array<{ raw: string; normalized: string }> {
  const scene = maintextToScene(narrative);
  return scene.lines
    .flatMap(line => line.text.split(/(?<=[。！？!?])|\n/gu))
    .map(raw => ({ raw: raw.trim(), normalized: normalizeSentence(raw) }))
    .filter(item => item.normalized.length >= MIN_EXACT_LENGTH);
}

function bigrams(value: string): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function diceSimilarity(left: string, right: string): number {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (leftPairs.size === 0 || rightPairs.size === 0) return 0;
  let overlap = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlap += 1;
  }
  return (2 * overlap) / (leftPairs.size + rightPairs.size);
}

function duplicateViolation(current: string, previous: string, exact: boolean): FactReviewViolation & { candidateQuote: string; oldQuote: string } {
  return {
    code: 'repeated-prose',
    candidateQuote: current,
    oldQuote: previous,
    message: exact
      ? `候选正文重复了近期完整语句：“${current}”。`
      : `候选正文与近期语句高度近似：“${current}” / “${previous}”。`,
  };
}

function isAuthorizedEvidenceSentence(sentence: string, exemptTexts: string[]): boolean {
  return exemptTexts.some(text => {
    const normalized = normalizeSentence(text);
    if (normalized.length < 8 || !sentence.includes(normalized)) return false;
    return normalized.length / sentence.length >= 0.55;
  });
}

/** Always-on, zero-cost guard for exact and near-exact sentence reuse. */
export function reviewProseDeterministically(
  narrative: string,
  recentNarratives: string[],
  exemptTexts: string[] = [],
): FactReviewViolation[] {
  const current = sentenceList(narrative);
  const previous = recentNarratives.flatMap(sentenceList);
  const seenCurrent: Array<{ raw: string; normalized: string }> = [];

  for (const sentence of current) {
    if (isAuthorizedEvidenceSentence(sentence.normalized, exemptTexts)) {
      seenCurrent.push(sentence);
      continue;
    }
    const candidates = [...previous, ...seenCurrent];
    for (const candidate of candidates) {
      if (sentence.normalized === candidate.normalized) {
        return [duplicateViolation(sentence.raw, candidate.raw, true)];
      }
      if (sentence.normalized.length >= MIN_NEAR_LENGTH
        && candidate.normalized.length >= MIN_NEAR_LENGTH) {
        const lengthRatio = Math.min(sentence.normalized.length, candidate.normalized.length)
          / Math.max(sentence.normalized.length, candidate.normalized.length);
        if (lengthRatio >= 0.72
          && diceSimilarity(sentence.normalized, candidate.normalized) >= NEAR_DUPLICATE_THRESHOLD) {
          return [duplicateViolation(sentence.raw, candidate.raw, false)];
        }
      }
    }
    seenCurrent.push(sentence);
  }
  return [];
}

/** Compatibility entry point: repetition requires whole-scene repair to preserve dialogue dependencies. */
export function removeExactRepeatedLines(
  narrative: string,
  recentNarratives: string[],
  exemptTexts: string[] = [],
): string {
  void recentNarratives;
  void exemptTexts;
  return narrative;
}

export function recentAcceptedNarratives(messages: ChatMessage[], limit = 3): string[] {
  return messages
    .filter(message => message.role === 'assistant')
    .map(message => message.parsed?.maintext
      ?? parseChunk(createParseState(), message.content).parsed.maintext)
    .filter(Boolean)
    .slice(-limit);
}

/** Cheap triage only: overlapping long wording still requires the grounded critic. */
export function hasSemanticStyleRisk(narrative: string, recentNarratives: string[], exemptTexts: string[] = []): boolean {
  const windows = (text: string) => {
    const sentences = sentenceList(text);
    return sentences.flatMap((_, index) => [1, 2, 3].filter(size => index + size <= sentences.length)
      .map(size => sentences.slice(index, index + size).map(item => item.normalized).join('')))
      .filter(sentence => sentence.length >= MIN_NEAR_LENGTH);
  };
  const previous = recentNarratives.flatMap(windows);
  return windows(narrative).filter(sentence => !isAuthorizedEvidenceSentence(sentence, exemptTexts)).some(sentence => (
    previous.some(old => Math.min(sentence.length, old.length) / Math.max(sentence.length, old.length) >= 0.72
      && diceSimilarity(sentence, old) >= MIN_SEMANTIC_WORDING_OVERLAP)
  ));
}

export async function reviewNarrativeStyle(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  narrative: string;
  recentNarratives: string[];
  exemptTexts?: string[];
  abortSignal?: AbortSignal;
  complete?: AgentCompletion;
  /** Older callers remain full; deterministic checks always run in either mode. */
  semanticMode?: 'adaptive' | 'full' | 'deterministic';
}): Promise<FactReview> {
  const deterministic = reviewProseDeterministically(
    options.narrative,
    options.recentNarratives,
    options.exemptTexts,
  );
  if (deterministic.length > 0) {
    return {
      approved: false,
      violations: deterministic,
      corrections: ['保留剧情事实与角色意图，彻底更换重复句、意象和段落组织。'],
    };
  }

  // With no accepted prose to compare against, a semantic continuity call cannot
  // find cross-turn repetition and would only add latency and cost.
  if (options.recentNarratives.length === 0) {
    return { approved: true, violations: [], corrections: [] };
  }
  if (options.semanticMode === 'deterministic') return { approved: true, violations: [], corrections: [] };
  if (options.semanticMode === 'adaptive' && !hasSemanticStyleRisk(options.narrative, options.recentNarratives, options.exemptTexts)) {
    return { approved: true, violations: [], corrections: [] };
  }

  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  const value = await completeParsedStructured(
    complete,
    `${options.api.baseUrl}|${options.api.model}`,
    [
      { role: 'system', content: GROUNDED_STYLE_PROMPT },
      { role: 'user', content: `${buildStyleCriticUserPrompt(options.recentNarratives, options.narrative)}\n\nexemptTexts（授权证据原文）：\n${JSON.stringify(options.exemptTexts ?? [])}` },
    ],
    { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal },
    STYLE_RESPONSE_FORMAT,
    raw => {
      const parsed = extractJson(raw) as Partial<GroundedStyleReview> | null;
      if (!parsed || typeof parsed.approved !== 'boolean'
        || !Array.isArray(parsed.violations) || !Array.isArray(parsed.corrections)) {
        throw new Error('文风连续性审查返回了不可解析的结果。');
      }
      return parsed as GroundedStyleReview;
    },
  );
  // Quotes are evidence, not authority: ungrounded model accusations cannot block a turn.
  const violations = value.violations.filter(item => {
    if (!item || typeof item.message !== 'string'
      || typeof item.oldQuote !== 'string' || typeof item.candidateQuote !== 'string') return false;
    const oldQuote = item.oldQuote.trim();
    const candidateQuote = item.candidateQuote.trim();
    const oldWording = normalizeSentence(oldQuote);
    const candidateWording = normalizeSentence(candidateQuote);
    if (oldWording.length < MIN_NEAR_LENGTH || candidateWording.length < MIN_NEAR_LENGTH) return false;
    const lengthRatio = Math.min(oldWording.length, candidateWording.length)
      / Math.max(oldWording.length, candidateWording.length);
    if (lengthRatio < 0.72 || diceSimilarity(oldWording, candidateWording) < MIN_SEMANTIC_WORDING_OVERLAP) return false;
    return options.recentNarratives.some(text => text.includes(oldQuote))
      && options.narrative.includes(candidateQuote)
      && !isAuthorizedEvidenceSentence(normalizeSentence(candidateQuote), options.exemptTexts ?? []);
  });
  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : value.corrections.filter(item => typeof item === 'string'),
  };
}
