import type { DirectorPlan, FactReview } from './types';

export interface OrchestrationStageTiming {
  stage: 'director' | 'hard-review' | 'director-repair' | 'hard-review-retry' | 'semantic-review';
  durationMs: number;
}

export type OrchestrationOutcome = 'success' | 'blocked' | 'error';

export interface OrchestrationLogEntry {
  id: string;
  timestamp: number;
  mode: 'standard' | 'strict';
  model: string;
  baseUrl: string;
  playerInput: string | null;
  directorPlan: DirectorPlan | null;
  hardReview: FactReview | null;
  semanticReview: FactReview | null;
  directorAttempts: number;
  stages: OrchestrationStageTiming[];
  totalDurationMs: number;
  structuredOutput: boolean;
  speculative: boolean;
  outcome: OrchestrationOutcome;
  error: string | null;
}

const CAPACITY = 20;

let entries: readonly OrchestrationLogEntry[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function recordOrchestrationEntry(entry: OrchestrationLogEntry): void {
  entries = [...entries.slice(-(CAPACITY - 1)), entry];
  emit();
}

export function getOrchestrationLog(): readonly OrchestrationLogEntry[] {
  return entries;
}

export function clearOrchestrationLog(): void {
  entries = [];
  emit();
}

export function subscribeOrchestrationLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOrchestrationLogCapacity(): number {
  return CAPACITY;
}
