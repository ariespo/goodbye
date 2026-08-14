import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { extractJson } from './structured';
import { buildNarrativeFactCriticUserPrompt, FACT_CRITIC_SYSTEM_PROMPT } from './prompts';
import type { FactReview, WriterPacket } from './types';

export async function reviewNarrativeAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  narrative: string;
  abortSignal?: AbortSignal;
}): Promise<FactReview> {
  const raw = await callSecondaryApi(options.api, [
    { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
    { role: 'user', content: buildNarrativeFactCriticUserPrompt(options.packet, options.narrative) },
  ], options.preset, { temperature: 0, maxTokens: 2500, abortSignal: options.abortSignal });
  const value = extractJson(raw) as Partial<FactReview> | null;
  if (!value || typeof value.approved !== 'boolean' || !Array.isArray(value.violations) || !Array.isArray(value.corrections)) {
    throw new Error('正文事实复核返回了不可解析的结果。');
  }
  const violations = value.violations.filter(item => !/不构成违规|故不违规|已获授权.*(?:符合|不违规)/.test(item.message));
  return { approved: violations.length === 0, violations, corrections: value.corrections } as FactReview;
}
