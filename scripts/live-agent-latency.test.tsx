// @vitest-environment jsdom
// Opt in: LIVE_AGENT_BENCHMARK=1 DEEPSEEK_API_KEY=... npx vitest run scripts/live-agent-latency.test.tsx
// Runs real preparation, Writer, reviews, State and deterministic commit. Browser disk I/O is stubbed.
import { writeFileSync, mkdirSync } from 'node:fs';
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
const modes = (process.env.BENCH_MODES ?? 'standard,strict').split(',') as ('standard' | 'strict')[];
const cases = modes.flatMap(mode => Array.from({ length: repeats }, (_, index) => ({ mode, index })));

afterEach(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe.skipIf(!enabled)('live foreground latency (opt-in paid API calls)', () => {
  it.each(cases)('$mode sample $index', async ({ mode, index }) => {
    // Node fetch requires Node signals, while jsdom replaces AbortController.
    vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for the opt-in benchmark');
    const api = { baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', apiKey,
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash' };
    const calls: Record<string, unknown>[] = [];
    const usageReads: Promise<void>[] = [];
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const body = JSON.parse(String(init?.body ?? '{}'));
      const row: Record<string, unknown> = { stream: !!body.stream, inputChars: JSON.stringify(body.messages ?? []).length,
        maxTokens: body.max_tokens, responseFormat: body.response_format?.type };
      calls.push(row);
      try {
        const response = await nativeFetch(url, init);
        row.headersMs = performance.now() - started;
        row.status = response.status;
        if (!body.stream) usageReads.push(response.clone().json().then(result => {
          row.completeMs = performance.now() - started;
          row.usage = result.usage;
          row.content = result.choices?.[0]?.message?.content;
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
      agentNarrativeMode: mode, formatPromptTemplate: DEFAULT_FORMAT_PROMPT } as AppSettings;
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
      rows.push({ mode, index, model: api.model, metrics: metric, calls,
        orchestration: getOrchestrationLog(), committed: state.game.history.length, error });
      mkdirSync('.codex-test-tmp', { recursive: true });
      const label = (process.env.BENCH_LABEL ?? 'baseline').replace(/[^a-z0-9-]/gi, '_');
      writeFileSync(`.codex-test-tmp/live-latency-${label}.json`, JSON.stringify(rows, null, 2));
      console.log(JSON.stringify({ mode, index, calls: calls.length, metric, error }));
      expect(metric?.outcome, error).toBe('success');
      expect(state.game.history).toHaveLength(1);
    } finally {
      clearTimeout(timeout);
      unmount();
    }
  }, 270_000);
});
