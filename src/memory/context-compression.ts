import { normalizeContextCompressionThreshold, type ChatMessage } from '../sillytavern/types';
import { estimateTokens } from '../sillytavern/token-budget';
import { formatNarrativeSummary } from './narrative-summary';

export interface ContextCompressionProjection {
  messages: ChatMessage[];
  compressedMessageIds: string[];
  originalTokens: number;
  projectedTokens: number;
  thresholdTokens: number;
  /** Actual request capacity required compression, independently of the saved preference. */
  budgetTriggered: boolean;
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
  /** Accounts for the caller's complete serialized request, including mandatory content. */
  fitsBudget?: (messages: readonly ChatMessage[]) => boolean;
}): ContextCompressionProjection {
  const messages = historyForCurrentVersion(options.history, options.variables ?? {});
  const thresholdTokens = normalizeContextCompressionThreshold(options.thresholdTokens);
  const originalTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  let projectedTokens = originalTokens;
  const compressedMessageIds: string[] = [];
  const protectedIds = new Set(messages.filter(message => message.role === 'assistant').slice(-2).map(message => message.id));
  let fitsBudget = options.fitsBudget?.(messages) ?? true;
  const budgetTriggered = !fitsBudget;

  function compress(index: number) {
    const message = messages[index];
    if (message.role !== 'assistant') return;
    const summary = formatNarrativeSummary(message);
    if (!summary) return;
    const savedTokens = estimateTokens(message.content) - estimateTokens(summary);
    if (savedTokens <= 0) return;
    // Do not carry parsed.maintext or rollback snapshots into a summary-only
    // record; even an accidental serialization must not duplicate its raw prose.
    messages[index] = { id: message.id, role: message.role, content: summary,
      timestamp: message.timestamp, variables: message.variables };
    projectedTokens -= savedTokens;
    compressedMessageIds.push(message.id);
    fitsBudget = options.fitsBudget?.(messages) ?? true;
  }

  for (let index = 0; index < messages.length && (projectedTokens > thresholdTokens || !fitsBudget); index++) {
    if (!protectedIds.has(messages[index].id)) compress(index);
  }
  // Prefer the last two narratives verbatim. Under a hard limit, their existing
  // summaries are still better than evicting the entire record.
  for (let index = 0; index < messages.length && !fitsBudget; index++) {
    if (protectedIds.has(messages[index].id)) compress(index);
  }
  return { messages, compressedMessageIds, originalTokens, projectedTokens, thresholdTokens, budgetTriggered };
}

/** Final agent envelopes add schemas, plans and sometimes duplicate continuity.
 * Recheck that actual envelope without modifying the accepted archive or its IDs.
 * Only whole optional history can be omitted after all useful summaries are tried.
 */
export function compressRequestHistory(
  context: Record<string, unknown>,
  fitsBudget: (context: Record<string, unknown>) => boolean,
  requiredMemoryIds: readonly string[] = [],
): Record<string, unknown> {
  if (fitsBudget(context) || !Array.isArray(context.recentHistory)) return context;
  const history: ChatMessage[] = [];
  for (const [index, record] of context.recentHistory.entries()) {
    if (!record || typeof record !== 'object' || typeof record.content !== 'string'
      || !['user', 'assistant'].includes(record.role)) return context;
    history.push({ id: `request-history-${index}`, role: record.role, content: record.content,
      timestamp: 0, variables: {} });
  }
  const selectionIds = Array.isArray(context.contextSelectionIds) ? context.contextSelectionIds : [];
  const historyIds = selectionIds.filter((id): id is string => typeof id === 'string' && id.startsWith('message:'));
  const canMapIds = historyIds.length === history.length && new Set(historyIds).size === historyIds.length;
  const pinned = new Set(requiredMemoryIds);
  const project = (messages: readonly ChatMessage[], omitted = new Set<string>()) => ({
    ...omitRequestHistoryIds(context, omitted),
    recentHistory: messages.map(({ role, content }) => ({ role, content })),
  });
  const compressed = projectContextHistory({ history, thresholdTokens: 100000,
    fitsBudget: messages => fitsBudget(project(messages)) });
  const projected = compressed.compressedMessageIds.length ? project(compressed.messages) : context;
  if (fitsBudget(projected)) return projected;
  // Unknown ID mappings cannot safely remove references that a plan may depend on.
  if (selectionIds.length && !canMapIds) return projected;
  if (requiredMemoryIds.some(id => id.startsWith('message:')) && !canMapIds) return projected;
  const optionalIndexes = history.map((_, index) => index).filter(index => !pinned.has(historyIds[index]));
  const omitFirst = (count: number) => {
    const omittedIndexes = new Set(optionalIndexes.slice(0, count));
    return project(compressed.messages.filter((_, index) => !omittedIndexes.has(index)),
      new Set(optionalIndexes.slice(0, count).flatMap(index => historyIds[index] ? [historyIds[index]] : [])));
  };
  // Serialized size decreases monotonically; avoid an O(n²) scan on long saves.
  let low = 0;
  let high = optionalIndexes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (fitsBudget(omitFirst(middle))) high = middle;
    else low = middle + 1;
  }
  return omitFirst(low);
}

function omitRequestHistoryIds(context: Record<string, unknown>, omitted: ReadonlySet<string>): Record<string, unknown> {
  if (!omitted.size) return context;
  const result = { ...context };
  if (Array.isArray(context.contextSelectionIds)) result.contextSelectionIds = context.contextSelectionIds.filter(id => !omitted.has(id));
  const memory = context.memoryContext;
  if (memory && typeof memory === 'object' && !Array.isArray(memory)) {
    const selectedIds = (memory as Record<string, unknown>).selectedIds;
    if (Array.isArray(selectedIds)) result.memoryContext = { ...memory, selectedIds: selectedIds.filter(id => !omitted.has(id)) };
  }
  return result;
}

/** Director and Writer have different authority projections but share selected history. */
export function alignRequestHistory(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const retained = new Set(Array.isArray(source.contextSelectionIds) ? source.contextSelectionIds : []);
  const omitted = new Set<string>((Array.isArray(target.contextSelectionIds) ? target.contextSelectionIds : [])
    .filter(id => typeof id === 'string' && id.startsWith('message:') && !retained.has(id)));
  return { ...omitRequestHistoryIds(target, omitted), recentHistory: source.recentHistory };
}
