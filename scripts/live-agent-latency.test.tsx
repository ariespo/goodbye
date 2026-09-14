// @vitest-environment jsdom
// Opt in: LIVE_AGENT_BENCHMARK=1 DEEPSEEK_API_KEY=... npx vitest run scripts/live-agent-latency.test.tsx
// Runs real preparation, Writer, reviews, State and deterministic commit. Browser disk I/O is stubbed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { transferableAbortController } from 'node:util';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from '../src/hooks/useGameLoop';
import { useGameStore } from '../src/stores/gameStore';
import { invalidatePreplans } from '../src/agents/mystery';
import { clearOrchestrationLog, getOrchestrationLog } from '../src/agents/mystery/orchestration-log';
import { clearTurnMetrics, getTurnMetrics } from '../src/agents/mystery/turn-metrics';
import { createDefaultVariables, variablesToEndingContext } from '../src/sillytavern/vars-merger';
import { createDefaultPreset, DEFAULT_FORMAT_PROMPT, type AppSettings, type ChatPreset, type ChatSession } from '../src/sillytavern/types';
import {
  buildEvaluationProvenance,
  parseDayMode,
  serializeScrubbed,
  summarizeAuditRows,
} from './live-day-evaluation-harness';

vi.mock('../src/agents/mystery', async importOriginal => ({
  ...await importOriginal<typeof import('../src/agents/mystery')>(), startPreplan: vi.fn(),
}));
vi.mock('../src/agents/mystery/scene-list', async importOriginal => ({
  ...await importOriginal<typeof import('../src/agents/mystery/scene-list')>(),
  generateSceneChecklist: vi.fn().mockResolvedValue({ observe: '房间', investigateItems: [], actionItems: [] }),
}));
vi.mock('../src/sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../src/sillytavern/database')>(), saveChat: vi.fn().mockResolvedValue(undefined),
}));

const enabled = process.env.LIVE_AGENT_BENCHMARK === '1';
const baseline = useGameStore.getState();
const nativeFetch = globalThis.fetch;
const rows: unknown[] = [];
const repeats = Math.max(1, Math.min(5, Number(process.env.BENCH_REPEATS) || 1));
const modes = (process.env.BENCH_MODES ?? 'standard,strict').split(',').filter(Boolean).map(parseDayMode);
const cases = modes.flatMap(mode => Array.from({ length: repeats }, (_, index) => ({
  mode, index, label: mode.requestedMode,
})));

afterEach(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe.skipIf(!enabled)('live foreground latency (opt-in paid API calls)', () => {
  it.each(cases)('$label sample $index', async ({ mode, index }) => {
    // Node fetch requires Node signals, while jsdom replaces AbortController.
    vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for the opt-in benchmark');
    const api = { baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', apiKey,
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash' };
    const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const benchmarkLabel = (process.env.BENCH_LABEL ?? 'baseline').replace(/[^a-z0-9-]/gi, '_');
    const provenance = buildEvaluationProvenance({ testedCommit, profile: 'latency', mode,
      model: api.model, baseUrl: api.baseUrl, maxTurns: repeats, runTag: benchmarkLabel, baselineCycle: 1 });
    const calls: Record<string, unknown>[] = [];
    const usageReads: Promise<void>[] = [];
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const body = JSON.parse(String(init?.body ?? '{}'));
      const row: Record<string, unknown> = { requestIndex: calls.length + 1, stream: !!body.stream,
        inputChars: JSON.stringify(body.messages ?? []).length, maxTokens: body.max_tokens,
        requestedModel: body.model, responseFormat: body.response_format?.type };
      calls.push(row);
      try {
        const response = await nativeFetch(url, init);
        row.headersMs = performance.now() - started;
        row.status = response.status;
        if (!body.stream) usageReads.push(response.clone().json().then(result => {
          row.completeMs = performance.now() - started;
          row.usage = result.usage;
          row.content = result.choices?.[0]?.message?.content;
          row.responseModel = result.model;
          row.finishReason = result.choices?.[0]?.finish_reason;
          row.providerError = result.error?.message;
        }).catch(() => {}));
        else usageReads.push(response.clone().text().then(content => { row.content = content; }).catch(() => {}));
        return response;
      } catch (error) {
        row.headersMs = performance.now() - started;
        row.error = error instanceof Error ? error.name : 'request error';
        throw error;
      }
    });
    const variables = createDefaultVariables();
    variables.time = '2024-09-09T08:00:00';
    const preset = { ...createDefaultPreset(), id: 'benchmark', createdAt: 0, updatedAt: 0 } as ChatPreset;
    const settings = { api, activePresetId: preset.id, userName: '玩家', characterName: '文穗',
      agentNarrativeMode: mode.settingsValue, formatPromptTemplate: DEFAULT_FORMAT_PROMPT } as unknown as AppSettings;
    const chat = { id: 'benchmark', name: 'isolated benchmark', messages: [], variables, createdAt: 0, updatedAt: 0 } as ChatSession;
    useGameStore.setState({ ...baseline,
      tavern: { ...baseline.tavern, settings, presets: [preset], activeChatId: chat.id, variables, chats: [chat] },
      api: { ...baseline.api, abortController: null },
      game: { ...baseline.game, history: [], currentScene: null,
        gameStatus: { ...baseline.game.gameStatus, time: new Date(String(variables.time)) },
        endingCheckContext: variablesToEndingContext(variables) as typeof baseline.game.endingCheckContext },
    }, true);
    clearTurnMetrics();
    clearOrchestrationLog();
    const { result, unmount } = renderHook(() => useGameLoop());
    const timeout = setTimeout(() => useGameStore.getState().api.abortController?.abort(), 240_000);
    try {
      await act(async () => { await result.current.sendMessage('我在房间里坐下，整理思绪，暂时不调查新线索。'); });
      await Promise.allSettled(usageReads);
      const state = useGameStore.getState();
      const metric = getTurnMetrics().at(-1);
      const error = String(state.api.error ?? state.api.turnRecovery.errorMessage ?? '').replaceAll(apiKey, '[redacted]');
      const row = { mode, index, model: api.model, provenance, metrics: metric, calls,
        orchestration: getOrchestrationLog(), committed: state.game.history.length,
        success: metric?.outcome === 'success' && state.game.history.length === 1, error };
      rows.push(row);
      mkdirSync('.codex-test-tmp', { recursive: true });
      writeFileSync(`.codex-test-tmp/live-latency-${benchmarkLabel}.json`, serializeScrubbed({
        testedCommit, rows, audit: summarizeAuditRows(rows),
        scope: 'foreground latency samples; not full-day or browser persistence acceptance',
      }, [apiKey]));
      console.log(JSON.stringify({ mode: mode.requestedMode, index, calls: calls.length, metric, error }));
      expect(metric?.outcome, error).toBe('success');
      expect(state.game.history).toHaveLength(1);
    } finally {
      clearTimeout(timeout);
      unmount();
    }
  }, 270_000);
});
