import type { ApiCallPurpose, ApiCurrency, ApiRepairKind, ApiRequestEvent, ApiTelemetryContext } from '../../sillytavern/api-telemetry';

/** Complete foreground narrative turns; preparation logs remain a separate diagnostic. */
export const TURN_METRICS_STORAGE_KEY = 'farewell.turn-metrics.v1';
export const TURN_METRICS_CAPACITY = 20;
const MAX_STAGES = 100;
const STAGES = ['preparation', 'writer', 'fact-review', 'style-review', 'repair', 'state', 'persistence', 'commit', 'protocol'] as const;
export type TurnMetricStage = typeof STAGES[number];
export type TurnMetricsOutcome = 'success' | 'failed' | 'cancelled';
const PURPOSES: ApiCallPurpose[] = ['foreground', 'checklist', 'preplan'];
const REPAIRS: ApiRepairKind[] = ['structured', 'director', 'narrative', 'protocol'];
export interface TurnUsageSummary {
  requests: number;
  pendingRequests: number;
  failedRequests: number;
  retries: number;
  formatFallbacks: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  inputUsageRequests: number;
  outputUsageRequests: number;
  usageCompleteRequests: number;
  cachedUsageRequests: number;
  costCompleteRequests: number;
  repairs: Record<ApiRepairKind, number>;
  costs: { currency: ApiCurrency; amount: number }[];
}
export interface TurnAccounting {
  measured: boolean;
  preparationReused: boolean;
  purposes: Record<ApiCallPurpose, TurnUsageSummary>;
}
export interface TurnMetricsEntry {
  readonly id: string;
  readonly startedAt: number;
  readonly outcome: TurnMetricsOutcome;
  readonly totalMs: number;
  readonly firstTokenMs: number | null;
  readonly playableMs: number | null;
  readonly stages: readonly { readonly name: TurnMetricStage; readonly durationMs: number }[];
  readonly accounting: TurnAccounting | null;
}
export interface TurnMetricsTracker {
  startStage(name: TurnMetricStage): () => void;
  stage<T>(name: TurnMetricStage, run: () => Promise<T> | T): Promise<T>;
  markFirstToken(): void;
  markPlayable(): void;
  telemetry(purpose?: ApiCallPurpose): ApiTelemetryContext;
  recordRepair(kind: ApiRepairKind, purpose?: ApiCallPurpose): void;
  markPreparationReused(): void;
  finish(outcome: TurnMetricsOutcome): TurnMetricsEntry;
}

let entries: readonly TurnMetricsEntry[] = [];
let loaded = false;
let sequence = 0;
let generation = 0;
const listeners = new Set<() => void>();
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function freezeEntry(entry: TurnMetricsEntry): TurnMetricsEntry {
  const accounting = parseAccounting(entry.accounting);
  if (accounting) {
    for (const purpose of PURPOSES) {
      const summary = accounting.purposes[purpose];
      Object.freeze(summary.repairs);
      summary.costs.forEach(Object.freeze);
      Object.freeze(summary.costs);
      Object.freeze(summary);
    }
    Object.freeze(accounting.purposes);
    Object.freeze(accounting);
  }
  return Object.freeze({ ...entry, accounting, stages: Object.freeze(entry.stages.map(stage => Object.freeze({ ...stage }))) });
}

const emptySummary = (): TurnUsageSummary => ({ requests: 0, pendingRequests: 0, failedRequests: 0, retries: 0, formatFallbacks: 0,
  durationMs: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, usageCompleteRequests: 0,
  inputUsageRequests: 0, outputUsageRequests: 0, cachedUsageRequests: 0, costCompleteRequests: 0,
  repairs: { structured: 0, director: 0, narrative: 0, protocol: 0 }, costs: [] });
const emptyAccounting = (): TurnAccounting => ({ measured: false, preparationReused: false,
  purposes: { foreground: emptySummary(), checklist: emptySummary(), preplan: emptySummary() } });

function parseAccounting(value: unknown): TurnAccounting | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.measured !== 'boolean' || typeof row.preparationReused !== 'boolean'
    || !row.purposes || typeof row.purposes !== 'object') return null;
  const result = emptyAccounting();
  result.measured = row.measured;
  result.preparationReused = row.preparationReused;
  const keys = ['requests', 'failedRequests', 'retries', 'formatFallbacks', 'durationMs', 'inputTokens', 'outputTokens',
    'cachedInputTokens', 'usageCompleteRequests', 'cachedUsageRequests', 'costCompleteRequests'] as const;
  for (const purpose of PURPOSES) {
    const source = (row.purposes as Record<string, unknown>)[purpose] as Record<string, unknown> | undefined;
    if (!source || typeof source !== 'object') return null;
    const target = result.purposes[purpose];
    if (source.pendingRequests !== undefined && (!nonnegative(source.pendingRequests) || !Number.isSafeInteger(source.pendingRequests))) return null;
    target.pendingRequests = (source.pendingRequests as number | undefined) ?? 0;
    for (const key of keys) {
      if (!nonnegative(source[key]) || !Number.isSafeInteger(source[key])) return null;
      target[key] = source[key];
    }
    for (const key of ['inputUsageRequests', 'outputUsageRequests'] as const) {
      const count = source[key] ?? target.usageCompleteRequests;
      if (!nonnegative(count) || !Number.isSafeInteger(count) || count > target.requests) return null;
      target[key] = count;
    }
    if (target.failedRequests > target.requests || target.usageCompleteRequests > target.requests
      || target.cachedUsageRequests > target.requests || target.costCompleteRequests > target.requests) return null;
    const repairs = source.repairs as Record<string, unknown> | undefined;
    if (!repairs || typeof repairs !== 'object') return null;
    for (const kind of REPAIRS) {
      if (!nonnegative(repairs[kind]) || !Number.isSafeInteger(repairs[kind])) return null;
      target.repairs[kind] = repairs[kind];
    }
    if (!Array.isArray(source.costs) || source.costs.length > 2) return null;
    for (const cost of source.costs) {
      if (!cost || !['USD', 'CNY'].includes(cost.currency) || !nonnegative(cost.amount)
        || target.costs.some(item => item.currency === cost.currency)) return null;
      target.costs.push({ currency: cost.currency, amount: cost.amount });
    }
  }
  return result;
}

export function summarizeTurnCosts(turns: readonly TurnMetricsEntry[]) {
  const successes = turns.filter(turn => turn.outcome === 'success').length;
  let complete = turns.length > 0;
  const amounts = new Map<ApiCurrency, number>();
  for (const turn of turns) {
    if (!turn.accounting?.measured) { complete = false; continue; }
    for (const purpose of PURPOSES) {
      const summary = turn.accounting.purposes[purpose];
      if (summary.pendingRequests > 0 || summary.costCompleteRequests !== summary.requests) complete = false;
      for (const cost of summary.costs) amounts.set(cost.currency, (amounts.get(cost.currency) ?? 0) + cost.amount);
    }
  }
  return { successes, complete, costs: [...amounts].map(([currency, amount]) => ({ currency, amount,
    perSuccess: successes ? amount / successes : null })) };
}

function parseEntry(value: unknown): TurnMetricsEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !/^\d+-\d+-[a-f0-9]{8}$/.test(row.id)
    || !nonnegative(row.startedAt) || !nonnegative(row.totalMs)
    || !['success', 'failed', 'cancelled'].includes(String(row.outcome))
    || !(row.firstTokenMs === null || (nonnegative(row.firstTokenMs) && row.firstTokenMs <= row.totalMs))
    || !(row.playableMs === null || (nonnegative(row.playableMs) && row.playableMs <= row.totalMs))
    || !Array.isArray(row.stages) || row.stages.length > MAX_STAGES) return null;
  const stages: { name: TurnMetricStage; durationMs: number }[] = [];
  for (const stage of row.stages) {
    if (!stage || !STAGES.includes(stage.name) || !nonnegative(stage.durationMs) || stage.durationMs > row.totalMs) return null;
    stages.push({ name: stage.name, durationMs: stage.durationMs });
  }
  // Explicit projection also removes any accidental prompt/credential fields on disk.
  return freezeEntry({ id: row.id, startedAt: row.startedAt, totalMs: row.totalMs,
    outcome: row.outcome as TurnMetricsOutcome, firstTokenMs: row.firstTokenMs as number | null,
    playableMs: row.playableMs as number | null, stages, accounting: parseAccounting(row.accounting) });
}

function persist(): void {
  try { globalThis.localStorage?.setItem(TURN_METRICS_STORAGE_KEY, JSON.stringify(entries)); }
  catch { /* Metrics remain usable when storage is disabled or full. */ }
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(TURN_METRICS_STORAGE_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : [];
    entries = Array.isArray(saved)
      ? saved.slice(-TURN_METRICS_CAPACITY).map(parseEntry).filter((entry): entry is TurnMetricsEntry => entry !== null)
      : [];
  } catch { entries = []; }
  persist();
}

function emit(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* Diagnostics must never break the turn. */ }
  }
}

export function getTurnMetrics(): readonly TurnMetricsEntry[] { ensureLoaded(); return entries; }
export function subscribeTurnMetrics(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function clearTurnMetrics(): void { loaded = true; generation++; entries = []; persist(); emit(); }

export function beginTurnMetrics(): TurnMetricsTracker {
  ensureLoaded();
  const startedAt = Date.now();
  const bornInGeneration = generation;
  const started = performance.now();
  const id = `${startedAt}-${++sequence}-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`;
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  let firstTokenMs: number | null = null;
  let playableMs: number | null = null;
  let finished: TurnMetricsEntry | null = null;
  const accounting = emptyAccounting();
  const updateAccounting = (update: () => void) => {
    if (bornInGeneration !== generation || (finished && !entries.some(entry => entry.id === id))) return;
    update();
    if (finished) {
      finished = freezeEntry({ ...finished, accounting });
      entries = entries.map(entry => entry.id === id ? finished! : entry);
      persist();
      emit();
    }
  };
  const recordRepair = (kind: ApiRepairKind, purpose: ApiCallPurpose = 'foreground') => updateAccounting(() => {
    if (REPAIRS.includes(kind) && PURPOSES.includes(purpose)) accounting.purposes[purpose].repairs[kind]++;
  });
  const stages: { name: TurnMetricStage; durationMs: number }[] = [];
  const active = new Set<() => void>();
  const startStage = (name: TurnMetricStage): (() => void) => {
    if (finished || !STAGES.includes(name) || stages.length + active.size >= MAX_STAGES) return () => {};
    const start = elapsed();
    const stop = () => {
      if (!active.delete(stop)) return;
      stages.push({ name, durationMs: Math.max(0, elapsed() - start) });
    };
    active.add(stop);
    return stop;
  };
  return {
    telemetry(purpose = 'foreground') {
      updateAccounting(() => { accounting.measured = true; });
      return {
        onRepair: kind => recordRepair(kind, purpose),
        onRequestStart: () => updateAccounting(() => { accounting.purposes[purpose].pendingRequests++; }),
        onRequest: (event: ApiRequestEvent) => updateAccounting(() => {
          const summary = accounting.purposes[purpose];
          summary.pendingRequests = Math.max(0, summary.pendingRequests - 1);
          summary.requests++;
          if (event.outcome !== 'success') summary.failedRequests++;
          if (event.kind === 'retry' || event.kind === 'auth-fallback') summary.retries++;
          if (event.kind === 'format-fallback' || event.kind === 'stream-options-fallback') summary.formatFallbacks++;
          if (nonnegative(event.durationMs)) summary.durationMs += Math.round(event.durationMs);
          const usage = event.usage;
          if (usage) {
            if (nonnegative(usage.inputTokens)) { summary.inputTokens += usage.inputTokens; summary.inputUsageRequests++; }
            if (nonnegative(usage.outputTokens)) { summary.outputTokens += usage.outputTokens; summary.outputUsageRequests++; }
            if (nonnegative(usage.cachedInputTokens)) { summary.cachedInputTokens += usage.cachedInputTokens; summary.cachedUsageRequests++; }
            if (nonnegative(usage.inputTokens) && nonnegative(usage.outputTokens)) summary.usageCompleteRequests++;
          }
          if (event.cost && ['USD', 'CNY'].includes(event.cost.currency) && nonnegative(event.cost.amount)) {
            const existing = summary.costs.find(cost => cost.currency === event.cost!.currency);
            if (existing) existing.amount += event.cost.amount;
            else summary.costs.push({ currency: event.cost.currency, amount: event.cost.amount });
            if (event.cost.complete) summary.costCompleteRequests++;
          }
        }),
      };
    },
    recordRepair,
    markPreparationReused() { updateAccounting(() => { accounting.preparationReused = true; }); },
    startStage,
    async stage<T>(name: TurnMetricStage, run: () => Promise<T> | T): Promise<T> {
      const stop = startStage(name);
      try { return await run(); } finally { stop(); }
    },
    markFirstToken() { if (!finished && firstTokenMs === null) firstTokenMs = elapsed(); },
    markPlayable() { if (!finished && playableMs === null) playableMs = elapsed(); },
    finish(outcome) {
      if (finished) return finished;
      for (const stop of active) stop();
      finished = freezeEntry({ id, startedAt, outcome, totalMs: elapsed(), firstTokenMs, playableMs, stages, accounting });
      if (bornInGeneration !== generation) return finished;
      entries = [...entries.slice(-(TURN_METRICS_CAPACITY - 1)), finished];
      persist();
      emit();
      return finished;
    },
  };
}
