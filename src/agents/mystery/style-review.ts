import { maintextToScene } from '../../engine/scene-parser';
import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatMessage, ChatPreset } from '../../sillytavern/types';
import { buildStyleCriticUserPrompt, STYLE_CRITIC_SYSTEM_PROMPT } from './prompts';
import { FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import { completeParsedStructured, extractJson, type AgentCompletion } from './structured';
import type { FactReview, FactReviewViolation } from './types';

const MIN_EXACT_LENGTH = 10;
const MIN_NEAR_LENGTH = 16;
const NEAR_DUPLICATE_THRESHOLD = 0.75;

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

function duplicateViolation(current: string, previous: string, exact: boolean): FactReviewViolation {
  return {
    code: 'repeated-prose',
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

/** Exact repeats add no new plot information; drop their whole dialogue line before model review. */
export function removeExactRepeatedLines(
  narrative: string,
  recentNarratives: string[],
  exemptTexts: string[] = [],
): string {
  const previous = new Set(recentNarratives.flatMap(sentenceList).map(item => item.normalized));
  const duplicates = sentenceList(narrative)
    .filter(item => previous.has(item.normalized) && !isAuthorizedEvidenceSentence(item.normalized, exemptTexts))
    .map(item => item.raw);
  if (duplicates.length === 0) return narrative;
  return narrative.split(/\r?\n/).filter(line => !duplicates.some(sentence => line.includes(sentence))).join('\n');
}

export function recentAcceptedNarratives(messages: ChatMessage[], limit = 3): string[] {
  return messages
    .filter(message => message.role === 'assistant')
    .map(message => message.parsed?.maintext
      || message.content.match(/<maintext>([\s\S]*?)<\/maintext>/i)?.[1]?.trim()
      || '')
    .filter(Boolean)
    .slice(-limit);
}

export async function reviewNarrativeStyle(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  narrative: string;
  recentNarratives: string[];
  exemptTexts?: string[];
  abortSignal?: AbortSignal;
  complete?: AgentCompletion;
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

  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  const value = await completeParsedStructured(
    complete,
    `${options.api.baseUrl}|${options.api.model}`,
    [
      { role: 'system', content: STYLE_CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: buildStyleCriticUserPrompt(options.recentNarratives, options.narrative) },
    ],
    { temperature: 0, maxTokens: 1200, abortSignal: options.abortSignal },
    FACT_REVIEW_RESPONSE_FORMAT,
    raw => {
      const parsed = extractJson(raw) as Partial<FactReview> | null;
      if (!parsed || typeof parsed.approved !== 'boolean'
        || !Array.isArray(parsed.violations) || !Array.isArray(parsed.corrections)) {
        throw new Error('文风连续性审查返回了不可解析的结果。');
      }
      return parsed as FactReview;
    },
  );
  const violations = value.violations.filter(item => item && typeof item.message === 'string');
  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : value.corrections.filter(item => typeof item === 'string'),
  };
}
