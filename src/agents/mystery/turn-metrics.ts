/** Complete foreground narrative turns; preparation logs remain a separate diagnostic. */
export const TURN_METRICS_STORAGE_KEY = 'farewell.turn-metrics.v1';
export const TURN_METRICS_CAPACITY = 20;
const MAX_STAGES = 100;
const STAGES = ['preparation', 'writer', 'fact-review', 'style-review', 'repair', 'state', 'persistence', 'commit', 'protocol'] as const;
export type TurnMetricStage = typeof STAGES[number];
export type TurnMetricsOutcome = 'success' | 'failed' | 'cancelled';
export interface TurnMetricsEntry {
  readonly id: string;
  readonly startedAt: number;
  readonly outcome: TurnMetricsOutcome;
  readonly totalMs: number;
  readonly firstTokenMs: number | null;
  readonly playableMs: number | null;
  readonly stages: readonly { readonly name: TurnMetricStage; readonly durationMs: number }[];
}
export interface TurnMetricsTracker {
  startStage(name: TurnMetricStage): () => void;
  stage<T>(name: TurnMetricStage, run: () => Promise<T> | T): Promise<T>;
  markFirstToken(): void;
  markPlayable(): void;
  finish(outcome: TurnMetricsOutcome): TurnMetricsEntry;
}

let entries: readonly TurnMetricsEntry[] = [];
let loaded = false;
let sequence = 0;
const listeners = new Set<() => void>();
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function freezeEntry(entry: TurnMetricsEntry): TurnMetricsEntry {
  return Object.freeze({ ...entry, stages: Object.freeze(entry.stages.map(stage => Object.freeze({ ...stage }))) });
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
    playableMs: row.playableMs as number | null, stages });
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
export function clearTurnMetrics(): void { loaded = true; entries = []; persist(); emit(); }

export function beginTurnMetrics(): TurnMetricsTracker {
  ensureLoaded();
  const startedAt = Date.now();
  const started = performance.now();
  const id = `${startedAt}-${++sequence}-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`;
  const elapsed = () => Math.max(0, Math.round(performance.now() - started));
  let firstTokenMs: number | null = null;
  let playableMs: number | null = null;
  let finished: TurnMetricsEntry | null = null;
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
      finished = freezeEntry({ id, startedAt, outcome, totalMs: elapsed(), firstTokenMs, playableMs, stages });
      entries = [...entries.slice(-(TURN_METRICS_CAPACITY - 1)), finished];
      persist();
      emit();
      return finished;
    },
  };
}
