import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumePreplan,
  hasPendingPreplan,
  invalidatePreplans,
  normalizePreplanInput,
  startPreplan,
  type PreplanRequest,
} from './preplan';
import type { PreparedMysteryTurn, PrepareMysteryTurnOptions } from './orchestrator';

const fakeResult = { directorAttempts: 1 } as unknown as PreparedMysteryTurn;

function makeRequest(input: string, contextKey = 'standard|1|home|none|chat-1'): PreplanRequest {
  return {
    input,
    contextKey,
    options: {
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext: {
        cycleCount: 1,
        currentLocation: 'home',
        lockedRoute: null,
        unlockedClueIds: [],
        playerKnowledge: {},
        suspicion: {},
        activeNpcIds: [],
      },
      turnContext: {},
      presentationContext: {},
    },
  };
}

describe('mystery preplan', () => {
  beforeEach(() => {
    invalidatePreplans();
  });

  it('reuses the prepared turn when input and context match', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('查看衣柜'), run);
    expect(hasPendingPreplan()).toBe(true);
    const result = await consumePreplan('  查看衣柜  ', 'standard|1|home|none|chat-1');
    expect(result).toBe(fakeResult);
    expect(run).toHaveBeenCalledTimes(1);
    expect(hasPendingPreplan()).toBe(false);
  });

  it('marks the speculative run and wires an abort signal', () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('查看衣柜'), run);
    const options = run.mock.calls[0]?.[0] as PrepareMysteryTurnOptions;
    expect(options.speculative).toBe(true);
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.abortSignal?.aborted).toBe(false);
  });

  it('discards mismatched input and aborts the stale run', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('查看衣柜'), run);
    const signal = (run.mock.calls[0]?.[0] as PrepareMysteryTurnOptions).abortSignal!;
    const result = await consumePreplan('去学校', 'standard|1|home|none|chat-1');
    expect(result).toBeNull();
    expect(signal.aborted).toBe(true);
    expect(hasPendingPreplan()).toBe(false);
  });

  it('discards results when the context key changed (cycle reset / route lock)', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('查看衣柜', 'standard|1|home|none|chat-1'), run);
    const result = await consumePreplan('查看衣柜', 'standard|2|home|none|chat-1');
    expect(result).toBeNull();
  });

  it('returns null when the speculative run failed, without throwing', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    startPreplan(makeRequest('查看衣柜'), run);
    const result = await consumePreplan('查看衣柜', 'standard|1|home|none|chat-1');
    expect(result).toBeNull();
  });

  it('awaits an in-flight run when consumed before completion', async () => {
    let resolve!: (value: PreparedMysteryTurn) => void;
    const run = vi.fn().mockReturnValue(new Promise<PreparedMysteryTurn>(r => { resolve = r; }));
    startPreplan(makeRequest('查看衣柜'), run);
    const pending = consumePreplan('查看衣柜', 'standard|1|home|none|chat-1');
    resolve(fakeResult);
    await expect(pending).resolves.toBe(fakeResult);
  });

  it('starting a new preplan aborts and replaces the previous one', async () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('旧输入'), run);
    const firstSignal = (run.mock.calls[0]?.[0] as PrepareMysteryTurnOptions).abortSignal!;
    startPreplan(makeRequest('新输入'), run);
    expect(firstSignal.aborted).toBe(true);
    await expect(consumePreplan('新输入', 'standard|1|home|none|chat-1')).resolves.toBe(fakeResult);
  });

  it('invalidatePreplans aborts and clears the slot', () => {
    const run = vi.fn().mockResolvedValue(fakeResult);
    startPreplan(makeRequest('查看衣柜'), run);
    const signal = (run.mock.calls[0]?.[0] as PrepareMysteryTurnOptions).abortSignal!;
    invalidatePreplans();
    expect(signal.aborted).toBe(true);
    expect(hasPendingPreplan()).toBe(false);
  });

  it('normalizes input by trimming whitespace only', () => {
    expect(normalizePreplanInput('  查看衣柜 ')).toBe('查看衣柜');
    expect(normalizePreplanInput('查看 衣柜')).toBe('查看 衣柜');
  });
});
