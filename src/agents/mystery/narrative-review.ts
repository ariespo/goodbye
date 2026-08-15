import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { completeStructured, extractJson } from './structured';
import {
  buildNarrativeFactCriticUserPrompt,
  buildNarrativeRepairPrompt,
  FACT_CRITIC_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from './prompts';
import { FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import type { FactReview, FactReviewViolation, WriterPacket } from './types';

const UNAUTHORIZED_PAST_ACTION = /(?:文穗|穿校服的女孩|那个女孩|她)[^。！？\n]{0,100}(?:今早|早上|来过|来买|买了|买过|付钱|付款|赶时间|离开(?:了)?|走了|好像往|似乎往|往[^。！？\n]{1,16}(?:走了|去了)|(?:经常|总是|每次|以前|平时|这几天)[^。！？\n]{0,40}(?:来|一起|见))|(?:今早|早上)[^。！？\n]{0,80}(?:文穗|女孩|她)/;

export function reviewNarrativeDeterministically(
  packet: Pick<WriterPacket, 'authorizedFacts' | 'playerKnownFacts'>,
  narrative: string,
): FactReviewViolation[] {
  if (packet.authorizedFacts.length > 0 || packet.playerKnownFacts.length > 0) return [];
  const match = narrative.match(UNAUTHORIZED_PAST_ACTION);
  if (!match) return [];
  return [{
    code: 'ungrounded-past-claim',
    message: `正文补写了未获授权的既往来访、购买或去向：“${match[0]}”。请删除该信息，只保留当下普通互动。`,
  }];
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
  const raw = await completeStructured(
    (requestMessages, requestOptions) => callSecondaryApi(options.api, requestMessages, options.preset, requestOptions),
    `${options.api.baseUrl}|${options.api.model}`,
    [...messages],
    { temperature: 0, maxTokens: 2500, abortSignal: options.abortSignal },
    FACT_REVIEW_RESPONSE_FORMAT,
  );
  const value = extractJson(raw) as Partial<FactReview> | null;
  if (!value || typeof value.approved !== 'boolean' || !Array.isArray(value.violations) || !Array.isArray(value.corrections)) {
    throw new Error('正文事实复核返回了不可解析的结果。');
  }
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
