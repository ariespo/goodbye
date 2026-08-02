import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOrchestrationLog,
  getOrchestrationLog,
  getOrchestrationLogCapacity,
  recordOrchestrationEntry,
  subscribeOrchestrationLog,
  type OrchestrationLogEntry,
} from './orchestration-log';

function makeEntry(overrides: Partial<OrchestrationLogEntry> = {}): OrchestrationLogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    mode: 'standard',
    model: 'test-model',
    baseUrl: 'http://test',
    playerInput: '查看衣柜',
    directorPlan: null,
    hardReview: null,
    semanticReview: null,
    pacingReview: null,
    directorAttempts: 1,
    stages: [{ stage: 'director', durationMs: 100 }],
    totalDurationMs: 120,
    structuredOutput: true,
    speculative: false,
    outcome: 'success',
    error: null,
    ...overrides,
  };
}

describe('orchestration log', () => {
  beforeEach(() => {
    clearOrchestrationLog();
  });

  it('records entries in order', () => {
    recordOrchestrationEntry(makeEntry({ playerInput: 'a' }));
    recordOrchestrationEntry(makeEntry({ playerInput: 'b' }));
    const log = getOrchestrationLog();
    expect(log).toHaveLength(2);
    expect(log[0]?.playerInput).toBe('a');
    expect(log[1]?.playerInput).toBe('b');
  });

  it('drops oldest entries beyond capacity', () => {
    const capacity = getOrchestrationLogCapacity();
    for (let i = 0; i < capacity + 5; i += 1) {
      recordOrchestrationEntry(makeEntry({ playerInput: `turn-${i}` }));
    }
    const log = getOrchestrationLog();
    expect(log).toHaveLength(capacity);
    expect(log[0]?.playerInput).toBe('turn-5');
    expect(log[log.length - 1]?.playerInput).toBe(`turn-${capacity + 4}`);
  });

  it('notifies subscribers and returns fresh snapshot references', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOrchestrationLog(listener);
    const before = getOrchestrationLog();
    recordOrchestrationEntry(makeEntry());
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getOrchestrationLog()).not.toBe(before);
    unsubscribe();
    recordOrchestrationEntry(makeEntry());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears entries and notifies', () => {
    recordOrchestrationEntry(makeEntry());
    const listener = vi.fn();
    subscribeOrchestrationLog(listener)();
    clearOrchestrationLog();
    expect(getOrchestrationLog()).toHaveLength(0);
  });
});
