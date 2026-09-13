import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as metrics from './turn-metrics';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance'] });
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  });
  metrics.clearTurnMetrics();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('complete turn metrics', () => {
  it('measures wall time instead of summing concurrent stages and keeps first token separate from playable', async () => {
    const turn = metrics.beginTurnMetrics();
    const stopWriter = turn.startStage('writer');
    vi.advanceTimersByTime(100);
    turn.markFirstToken();
    vi.advanceTimersByTime(100);
    turn.markFirstToken();
    stopWriter();
    stopWriter();
    const stopFact = turn.startStage('fact-review');
    const stopStyle = turn.startStage('style-review');
    vi.advanceTimersByTime(50);
    stopFact();
    vi.advanceTimersByTime(25);
    stopStyle();
    await turn.stage('protocol', () => 'valid');
    vi.advanceTimersByTime(25);
    turn.markPlayable();
    vi.advanceTimersByTime(10);
    const entry = turn.finish('success');
    expect(entry).toMatchObject({ totalMs: 310, firstTokenMs: 100, playableMs: 300, outcome: 'success' });
    expect(entry.stages).toEqual([
      { name: 'writer', durationMs: 200 }, { name: 'fact-review', durationMs: 50 },
      { name: 'style-review', durationMs: 75 }, { name: 'protocol', durationMs: 0 },
    ]);
  });

  it.each(['failed', 'cancelled'] as const)('records %s work once and freezes in-flight stages at finish', async outcome => {
    const turn = metrics.beginTurnMetrics();
    let resolve!: () => void;
    const pending = turn.stage('state', () => new Promise<void>(r => { resolve = r; }));
    vi.advanceTimersByTime(75);
    const entry = turn.finish(outcome);
    vi.advanceTimersByTime(25);
    turn.markFirstToken();
    turn.markPlayable();
    resolve();
    await pending;
    expect(turn.finish('success')).toBe(entry);
    expect(metrics.getTurnMetrics()).toEqual([entry]);
    expect(entry).toMatchObject({ totalMs: 75, firstTokenMs: null, playableMs: null, outcome, stages: [{ name: 'state', durationMs: 75 }] });
  });

  it('times a rejected stage without swallowing its error', async () => {
    const turn = metrics.beginTurnMetrics();
    await expect(turn.stage('state', async () => {
      vi.advanceTimersByTime(80);
      throw new Error('private model response');
    })).rejects.toThrow('private model response');
    expect(turn.finish('failed').stages).toEqual([{ name: 'state', durationMs: 80 }]);
    expect(localStorage.getItem(metrics.TURN_METRICS_STORAGE_KEY)).not.toContain('private model response');
  });

  it('persists only bounded timing records and restores them after reload', async () => {
    for (let i = 0; i < metrics.TURN_METRICS_CAPACITY + 2; i++) {
      const turn = metrics.beginTurnMetrics();
      vi.advanceTimersByTime(i);
      turn.finish('success');
    }
    expect(metrics.getTurnMetrics()).toHaveLength(metrics.TURN_METRICS_CAPACITY);
    expect(metrics.getTurnMetrics()[0].totalMs).toBe(2);
    vi.resetModules();
    const reloaded = await import('./turn-metrics');
    expect(reloaded.getTurnMetrics()).toEqual(metrics.getTurnMetrics());
    reloaded.clearTurnMetrics();
    expect(JSON.parse(localStorage.getItem(metrics.TURN_METRICS_STORAGE_KEY)!)).toEqual([]);
  });

  it('rejects corrupt stored records and strips unrecognized fields from valid ones', async () => {
    const entry = metrics.beginTurnMetrics().finish('success');
    localStorage.setItem(metrics.TURN_METRICS_STORAGE_KEY, JSON.stringify([
      { ...entry, id: 'api-key-secret', totalMs: -1 },
      { ...entry, prompt: 'private prompt', stages: [{ name: 'secret prompt', durationMs: 2 }] },
      { ...entry, apiKey: 'secret' },
    ]));
    vi.resetModules();
    const reloaded = await import('./turn-metrics');
    expect(reloaded.getTurnMetrics()).toEqual([entry]);
    expect(localStorage.getItem(metrics.TURN_METRICS_STORAGE_KEY)).not.toContain('secret');
  });

  it('keeps working and notifies subscribers when storage is unavailable', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const snapshots: number[] = [];
    const unsubscribe = metrics.subscribeTurnMetrics(() => snapshots.push(metrics.getTurnMetrics().length));
    metrics.beginTurnMetrics().finish('cancelled');
    unsubscribe();
    metrics.beginTurnMetrics().finish('failed');
    expect(snapshots).toEqual([1]);
    expect(metrics.getTurnMetrics()).toHaveLength(2);
  });

  it.each(['malformed', 'denied'])('starts a usable history after %s storage reads', async mode => {
    localStorage.setItem(metrics.TURN_METRICS_STORAGE_KEY, '{broken');
    if (mode === 'denied') {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('storage denied'); });
    }
    vi.resetModules();
    const current = await import('./turn-metrics');
    expect(current.getTurnMetrics()).toEqual([]);
    const turn = current.beginTurnMetrics();
    vi.advanceTimersByTime(30);
    turn.finish('failed');
    expect(current.getTurnMetrics()).toMatchObject([{ outcome: 'failed', totalMs: 30 }]);
  });

  it('shows complete-turn timings when preparation logs are empty', async () => {
    vi.resetModules();
    vi.doMock('../../stores/gameStore', () => ({
      useGameStore: (selector: (state: unknown) => unknown) => selector({
        ui: { showOrchestrationLog: true }, actions: { setShowOrchestrationLog: () => {} },
      }),
    }));
    const current = await import('./turn-metrics');
    current.clearTurnMetrics();
    const turn = current.beginTurnMetrics();
    vi.advanceTimersByTime(100);
    turn.markFirstToken();
    vi.advanceTimersByTime(200);
    turn.markPlayable();
    turn.finish('success');
    const { clearOrchestrationLog } = await import('./orchestration-log');
    clearOrchestrationLog();
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { OrchestrationLogPanel } = await import('../../components/system/OrchestrationLogPanel');
    const html = renderToStaticMarkup(createElement(OrchestrationLogPanel));
    expect(html).toContain('完整回合');
    expect(html).toContain('总耗时: 300ms');
    expect(html).toContain('首 token: 100ms');
    expect(html).toContain('可游玩: 300ms');
    vi.doUnmock('../../stores/gameStore');
  }, 30_000);
});
