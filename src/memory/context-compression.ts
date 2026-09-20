import { normalizeContextCompressionThreshold, type ChatMessage } from '../sillytavern/types';
import { estimateTokens } from '../sillytavern/token-budget';
import { formatNarrativeSummary } from './narrative-summary';

export interface ContextCompressionProjection {
  messages: ChatMessage[];
  compressedMessageIds: string[];
  originalTokens: number;
  projectedTokens: number;
  thresholdTokens: number;
}

/** Route archives are retained in saves but cannot become current-version history. */
export function historyForCurrentVersion(history: readonly ChatMessage[], variables: Record<string, unknown>): ChatMessage[] {
  const currentCycle = Number.isSafeInteger(Number(variables.cycleCount))
    ? Math.max(1, Number(variables.cycleCount)) : 1;
  const requestedStart = Number((variables.storyProgress as { versionStartCycle?: unknown } | undefined)?.versionStartCycle);
  const versionStart = Number.isSafeInteger(requestedStart) && requestedStart > 1 && requestedStart <= currentCycle ? requestedStart : 1;
  return history.filter(message => message.role !== 'system' && (versionStart === 1
    || (Number.isSafeInteger(Number(message.variables?.cycleCount)) && Number(message.variables.cycleCount) >= versionStart)));
}

/**
 * Reversible prompt projection only. The full saved dialogue and evidence corpus
 * remain intact. A player threshold never overrides the model's hard budget.
 */
export function projectContextHistory(options: {
  history: readonly ChatMessage[];
  variables?: Record<string, unknown>;
  thresholdTokens?: unknown;
}): ContextCompressionProjection {
  const messages = historyForCurrentVersion(options.history, options.variables ?? {});
  const thresholdTokens = normalizeContextCompressionThreshold(options.thresholdTokens);
  const originalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  let projectedTokens = originalTokens;
  const compressedMessageIds: string[] = [];
  const protectedIds = new Set(messages.filter(message => message.role === 'assistant').slice(-2).map(message => message.id));

  for (let index = 0; index < messages.length && projectedTokens > thresholdTokens; index++) {
    const message = messages[index];
    if (message.role !== 'assistant' || protectedIds.has(message.id)) continue;
    const summary = formatNarrativeSummary(message);
    if (!summary) continue;
    const savedTokens = estimateTokens(message.content) - estimateTokens(summary);
    if (savedTokens <= 0) continue;
    // Do not carry parsed.maintext or rollback snapshots into a summary-only
    // record; even an accidental serialization must not duplicate its raw prose.
    messages[index] = { id: message.id, role: message.role, content: summary,
      timestamp: message.timestamp, variables: message.variables };
    projectedTokens -= savedTokens;
    compressedMessageIds.push(message.id);
  }
  return { messages, compressedMessageIds, originalTokens, projectedTokens, thresholdTokens };
}
