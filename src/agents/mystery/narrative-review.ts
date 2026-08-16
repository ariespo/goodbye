import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { completeParsedStructured, extractJson } from './structured';
import {
  buildNarrativeFactCriticUserPrompt,
  buildNarrativeFormatRepairPrompt,
  buildNarrativeRepairPrompt,
  FACT_CRITIC_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from './prompts';
import { FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import type { FactReview, FactReviewViolation, WriterPacket } from './types';
import type { ValidationError } from '../../sillytavern/output-protocol';

const STYLE_VIOLATION_CODES = new Set([
  'repeated-prose',
  'repeated-imagery',
  'style-template-repetition',
]);

export function isStyleOnlyNarrativeReview(review: FactReview): boolean {
  return review.violations.length > 0
    && review.violations.every(item => STYLE_VIOLATION_CODES.has(item.code));
}

const UNAUTHORIZED_CASE_HISTORY = /(?:文穗|穿校服的女孩|那个女孩|她)[^。！？\n]{0,100}(?:今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2}|买了|付钱|付款|离开(?:了)?|好像往|似乎往|往[^。！？\n]{1,16}(?:走了|去了))|(?:今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2})[^。！？\n]{0,80}(?:文穗|女孩|她)/;
const HISTORICAL_HABIT = /(?:以前|平时|经常|总是|每次|向来)[^。！？\n]{0,80}(?:来|一起|同行|买|照顾|打招呼|见)/;

export function reviewNarrativeDeterministically(
  packet: Pick<WriterPacket, 'authorizedFacts' | 'playerKnownFacts'>
    & Partial<Pick<WriterPacket, 'authorizedBackgroundFacts'>>,
  narrative: string,
): FactReviewViolation[] {
  const habitMatch = narrative.match(HISTORICAL_HABIT);
  if (habitMatch && (packet.authorizedBackgroundFacts?.length ?? 0) === 0) {
    return [{
      code: 'ungrounded-past-claim',
      message: `正文出现了无固定生活史或已接受软设定来源的习惯性旧经历：“${habitMatch[0]}”。`,
    }];
  }
  const match = narrative.match(UNAUTHORIZED_CASE_HISTORY);
  if (!match) return [];
  const caseAuthorization = [...packet.authorizedFacts, ...packet.playerKnownFacts]
    .some(fact => /今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2}|买|付款|离开|去往|行踪/.test(fact.text));
  if (caseAuthorization) return [];
  return [{
    code: 'ungrounded-past-claim',
    message: `正文补写了未获授权的既往来访、购买或去向：“${match[0]}”。请删除该信息，只保留当下普通互动。`,
  }];
}

export function removeUngroundedNarrativeLines(
  packet: Parameters<typeof reviewNarrativeDeterministically>[0],
  narrative: string,
): string {
  return narrative
    .split(/\r?\n/)
    .filter(line => reviewNarrativeDeterministically(packet, line).length === 0)
    .join('\n');
}

export async function reviewNarrativeAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  narrative: string;
  abortSignal?: AbortSignal;
}): Promise<FactReview> {
  const deterministicViolations = reviewNarrativeDeterministically(options.packet, options.narrative);
  if (deterministicViolations.length > 0) {
    return {
      approved: false,
      violations: deterministicViolations,
      corrections: ['删除所有关于文穗此前来过、买过、付过钱、离开或去向的补写，改为当下服务互动。'],
    };
  }
  const messages = [
    { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
    { role: 'user', content: buildNarrativeFactCriticUserPrompt(options.packet, options.narrative) },
  ] as const;
  const value = await completeParsedStructured(
    (requestMessages, requestOptions) => callSecondaryApi(options.api, requestMessages, options.preset, requestOptions),
    `${options.api.baseUrl}|${options.api.model}`,
    [...messages],
    { temperature: 0, maxTokens: 2500, abortSignal: options.abortSignal },
    FACT_REVIEW_RESPONSE_FORMAT,
    raw => {
      const parsed = extractJson(raw) as Partial<FactReview> | null;
      if (!parsed || typeof parsed.approved !== 'boolean'
        || !Array.isArray(parsed.violations) || !Array.isArray(parsed.corrections)) {
        throw new Error('正文事实复核返回了不可解析的结果。');
      }
      return parsed as FactReview;
    },
  );
  const violations = value.violations.filter(item => !(
    /不构成违规|并非违规|无需修正|(?:未发现|没有发现|不存在|无)(?:任何|潜在)?违规|故不违规|已获授权.*(?:符合|不违规)/
      .test(item.message)
  ));
  return {
    approved: violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : value.corrections,
  } as FactReview;
}

export async function repairNarrativeAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  rejectedNarrative: string;
  review: FactReview;
  formatPrompt?: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const systemPrompt = options.formatPrompt
    ? `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${options.formatPrompt}`
    : WRITER_SYSTEM_PROMPT;
  return callSecondaryApi(options.api, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildNarrativeRepairPrompt(options.packet, options.rejectedNarrative, options.review) },
  ], options.preset, { temperature: 0, maxTokens: 4000, abortSignal: options.abortSignal });
}

export async function repairNarrativeFormatAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  rejectedNarrative: string;
  errors: ValidationError[];
  formatPrompt?: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const systemPrompt = options.formatPrompt
    ? `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${options.formatPrompt}`
    : WRITER_SYSTEM_PROMPT;
  return callSecondaryApi(options.api, [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildNarrativeFormatRepairPrompt(options.packet, options.rejectedNarrative, options.errors),
    },
  ], options.preset, { temperature: 0, maxTokens: 4000, abortSignal: options.abortSignal });
}
