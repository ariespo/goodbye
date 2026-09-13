import type { ChatPreset } from './types';

export const DEFAULT_CONTEXT_TOKENS = 100_000;
export const DEFAULT_OUTPUT_TOKENS = 40_000;

/** One request's output allowance, shared by generation, reviews and repairs. */
export function getMaxOutputTokens(preset: ChatPreset | null | undefined): number {
  return preset?.settings.openai_max_tokens ?? DEFAULT_OUTPUT_TOKENS;
}

export function getMaxContextTokens(preset: ChatPreset | null | undefined): number {
  return preset?.settings.openai_max_context ?? DEFAULT_CONTEXT_TOKENS;
}

/** Conservative approximation; deliberately independent of memory and API modules. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 1.15 + other / 3.6 + 4);
}

export class ContextBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextBudgetError';
  }
}

export function assertRequestTokenBudget(serializedRequest: string, maxContext: number, reservedOutput: number): void {
  const estimatedInput = estimateTokens(serializedRequest);
  if (!Number.isFinite(maxContext) || !Number.isFinite(reservedOutput) || maxContext <= 0 || reservedOutput < 0
    || estimatedInput + reservedOutput > maxContext) {
    throw new ContextBudgetError(`上下文预算不足：输入估算 ${estimatedInput} + 输出预留 ${reservedOutput} 超出上下文 ${maxContext}；请增加上下文或减少可选内容。权威指令未被截断。`);
  }
}
