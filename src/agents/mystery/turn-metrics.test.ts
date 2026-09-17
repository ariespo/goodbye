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
  it('keeps estimates incomplete until background requests settle', () => {
    const turn = metrics.beginTurnMetrics();
    const background = turn.telemetry('checklist');
    background.onRequestStart?.();
    turn.finish('success');
    expect(metrics.getTurnMetrics()[0].accounting?.purposes.checklist.pendingRequests).toBe(1);
    expect(metrics.summarizeTurnCosts(metrics.getTurnMetrics()).complete).toBe(false);
    background.onRequest({ durationMs: 10, status: 200, outcome: 'success', kind: 'request',
      usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }, cost: { currency: 'USD', amount: 0.01, complete: true } });
    expect(metrics.getTurnMetrics()[0].accounting?.purposes.checklist.pendingRequests).toBe(0);
    expect(metrics.summarizeTurnCosts(metrics.getTurnMetrics()).complete).toBe(true);
  });

  it('keeps failed work, unknown coverage, and mixed currencies in the window numerator', () => {
    const success = metrics.beginTurnMetrics();
    success.telemetry().onRequest({ durationMs: 1, status: 200, outcome: 'success', kind: 'request', usage: null,
      cost: { currency: 'USD', amount: 2, complete: false } });
    success.finish('success');
    const failed = metrics.beginTurnMetrics();
    failed.telemetry().onRequest({ durationMs: 1, status: 503, outcome: 'failed', kind: 'retry', usage: null,
      cost: { currency: 'CNY', amount: 3, complete: true } });
    failed.finish('failed');
    expect(metrics.summarizeTurnCosts(metrics.getTurnMetrics())).toEqual({ successes: 1, complete: false,
      costs: [{ currency: 'USD', amount: 2, perSuccess: 2 }, { currency: 'CNY', amount: 3, perSuccess: 3 }] });
  });
  it('keeps foreground and late auxiliary spending separate without changing finished timings', () => {
    const turn = metrics.beginTurnMetrics();
    const foreground = turn.telemetry();
    const background = turn.telemetry('preplan');
    const request = { durationMs: 9, status: 200, outcome: 'success' as const, kind: 'request' as const,
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 10 }, cost: { currency: 'USD' as const, amount: 0.01, complete: true } };
    foreground.onRequest(request);
    turn.recordRepair('structured');
    turn.markPreparationReused();
    vi.advanceTimersByTime(30);
    turn.finish('success');
    vi.advanceTimersByTime(100);
    background.onRequest(request);
    expect(metrics.getTurnMetrics()[0]).toMatchObject({ totalMs: 30, accounting: { preparationReused: true,
      purposes: { foreground: { requests: 1, repairs: { structured: 1 } }, preplan: { requests: 1 } } } });
    const summary = metrics.summarizeTurnCosts(metrics.getTurnMetrics());
    expect(summary).toMatchObject({ successes: 1, complete: true, costs: [{ currency: 'USD', amount: 0.02, perSuccess: 0.02 }] });
    metrics.clearTurnMetrics();
    background.onRequest(request);
    expect(metrics.getTurnMetrics()).toEqual([]);
  });

  it('never recreates evicted entries and reports old timing-only entries as unmeasured', async () => {
    const turn = metrics.beginTurnMetrics();
    const observer = turn.telemetry('checklist');
    const original = turn.finish('success');
    for (let i = 0; i < metrics.TURN_METRICS_CAPACITY; i++) metrics.beginTurnMetrics().finish('failed');
    observer.onRequest({ durationMs: 10, status: null, outcome: 'failed', kind: 'retry', usage: null, cost: null });
    expect(metrics.getTurnMetrics().some(entry => entry.id === original.id)).toBe(false);
    const old = { ...original, accounting: undefined };
    localStorage.setItem(metrics.TURN_METRICS_STORAGE_KEY, JSON.stringify([old]));
    vi.resetModules();
    const reloaded = await import('./turn-metrics');
    expect(reloaded.getTurnMetrics()[0].accounting).toBeNull();
    expect(reloaded.summarizeTurnCosts(reloaded.getTurnMetrics()).complete).toBe(false);
  });

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
    expect(html).toContain('每成功回合');
    expect(html).toContain('用量与费用：未计量');
    expect(html).toContain('统计不完整');
    const measured = current.beginTurnMetrics();
    measured.telemetry().onRequest({ durationMs: 1, status: 200, outcome: 'success', kind: 'format-fallback',
      usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: null }, cost: { currency: 'USD', amount: 0.01, complete: true } });
    measured.telemetry('preplan').onRequestStart?.();
    measured.recordRepair('narrative');
    measured.markPreparationReused();
    measured.finish('success');
    const measuredHtml = renderToStaticMarkup(createElement(OrchestrationLogPanel));
    expect(measuredHtml).toContain('格式兼容重试 1');
    expect(measuredHtml).toContain('输入 100');
    expect(measuredHtml).toContain('正文 1');
    expect(measuredHtml).toContain('USD 0.01');
    expect(measuredHtml).toContain('未结算 1 次');
    expect(measuredHtml).toContain('已复用准备结果');
    vi.doUnmock('../../stores/gameStore');
  }, 30_000);
});
