// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import type { PreparedMysteryTurn } from '../agents/mystery/orchestrator';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { prepareMysteryTurn, invalidatePreplans } from '../agents/mystery';
import { streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';
import { clearTurnMetrics, getTurnMetrics } from '../agents/mystery/turn-metrics';

vi.mock('../agents/mystery', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery')>(), prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(),
}));
vi.mock('../agents/mystery/scene-list', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery/scene-list')>(),
  generateSceneChecklist: vi.fn().mockResolvedValue({ observe: '房间', investigateItems: [], actionItems: [] }),
}));
vi.mock('../sillytavern/api-router', async importOriginal => ({
  ...await importOriginal<typeof import('../sillytavern/api-router')>(), streamChatCompletion: vi.fn(),
}));
vi.mock('../agents/state/state-agent', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/state/state-agent')>(), runStateAgent: vi.fn(),
}));
vi.mock('../sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../sillytavern/database')>(), saveChat: vi.fn(),
}));

const prose = '<maintext>场景|home\n对话|旁白|calm|你在房间里停下脚步。</maintext><option>继续观察\n坐下休息</option><sum>停步观察。</sum><vars>{}</vars>';
const baseline = useGameStore.getState();
let preparedFixture: PreparedMysteryTurn;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected live HTTP in lifecycle fixture'); });
  invalidatePreplans();
  clearTurnMetrics();
  const variables = createDefaultVariables();
  variables.time = '2024-09-09T08:00:00';
  const preset = { ...createDefaultPreset(), id: 'preset', createdAt: 0, updatedAt: 0 } as ChatPreset;
  const settings = { api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
    activePresetId: 'preset', userName: '玩家', characterName: '文穗', agentNarrativeMode: 'strict' } as AppSettings;
  const chat = { id: 'chat', name: 'test', messages: [], variables, createdAt: 0, updatedAt: 0 } as ChatSession;
  useGameStore.setState({ ...baseline,
    tavern: { ...baseline.tavern, settings, presets: [preset], activeChatId: chat.id, variables, chats: [chat] },
    api: { ...baseline.api, abortController: null },
    game: { ...baseline.game, history: [], currentScene: null,
      gameStatus: { ...baseline.game.gameStatus, time: new Date(String(variables.time)) },
      endingCheckContext: variablesToEndingContext(variables) as typeof baseline.game.endingCheckContext },
  }, true);
  vi.mocked(saveChat).mockResolvedValue(undefined);
  const prepared = await prepareActual({ mode: 'strict', api: settings.api, preset,
    truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [] },
    turnContext: {}, presentationContext: {},
    complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
      ? JSON.stringify({ approved: true, violations: [], corrections: [] })
      : JSON.stringify({ turnGoal: '观察房间', tone: '克制', beats: [{ id: 'beat-1', purpose: '观察', description: '在房间停步' }],
        revelations: [], optionIntents: [{ id: 'option-1', intent: '继续观察', tone: '谨慎', expectedPressure: 'low' }], assetRequests: [] }),
  });
  prepared.reviewPolicy.narrative = false;
  preparedFixture = prepared;
  vi.mocked(prepareMysteryTurn).mockResolvedValue(prepared);
  vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
    callbacks.onToken(prose);
    await callbacks.onComplete();
  });
});

afterEach(() => { invalidatePreplans(); useGameStore.getState().api.abortController?.abort(); vi.unstubAllGlobals(); useGameStore.setState(baseline, true); });

describe('foreground State cancellation', () => {
  it('runs State for new authorized evidence even when the standard plan skipped State review', async () => {
    preparedFixture.reviewPolicy.state = false;
    const fact = MYSTERY_TRUTH_GRAPH.facts.find(item => item.suspicionTargets?.length && item.revelations.hint)!;
    preparedFixture.writerPacket.authorizedFacts = [{ id: preparedFixture.factAliases.factIdToAlias[fact.id],
      level: 'hint', text: fact.revelations.hint!, delivery: 'narration' }];
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    expect(runStateAgent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runStateAgent).mock.calls[0][0].evidenceAuthority?.newEvidence).toHaveLength(1);
    expect(useGameStore.getState().game.history).toHaveLength(1);
    unmount();
  });

  it('persists and settles an approved turn once, recording playable time after State', async () => {
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    expect(useGameStore.getState().game.history).toHaveLength(1);
    expect(useGameStore.getState().tavern.chats[0].messages.filter(message => message.role === 'assistant')).toHaveLength(1);
    const metric = getTurnMetrics().at(-1)!;
    expect(metric.outcome).toBe('success');
    expect(metric.firstTokenMs).not.toBeNull();
    expect(metric.playableMs).toBeGreaterThanOrEqual(metric.firstTokenMs!);
    expect(metric.stages.map(stage => stage.name)).toEqual(expect.arrayContaining(['writer', 'state', 'persistence', 'commit']));
    unmount();
  });

  it.each(['cancel', 'switch-session'] as const)('does not settle or persist an assistant after %s', async mode => {
    let rejectState!: (error: Error) => void;
    vi.mocked(runStateAgent).mockImplementation(() => new Promise((_resolve, reject) => { rejectState = reject; }));
    const { result, unmount } = renderHook(() => useGameLoop());
    let pending!: Promise<void>;
    act(() => { pending = result.current.sendMessage('观察房间'); });
    await waitFor(() => {
      const recovery = useGameStore.getState().api.turnRecovery;
      if (recovery.errorMessage) throw new Error(recovery.errorMessage);
      expect(runStateAgent, JSON.stringify({ error: useGameStore.getState().api.error,
        buffer: useGameStore.getState().api.streamBuffer, metrics: getTurnMetrics(),
        preparedCalls: vi.mocked(prepareMysteryTurn).mock.calls.length,
        streamCalls: vi.mocked(streamChatCompletion).mock.calls.length,
      })).toHaveBeenCalledTimes(1);
    });
    const before = useGameStore.getState().tavern.variables;
    act(() => {
      useGameStore.getState().api.abortController!.abort();
      if (mode === 'switch-session') useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'other' },
        api: { ...state.api, streamBuffer: 'new session marker' } }));
      rejectState(new Error('late State failure'));
    });
    await act(async () => { await pending; });
    expect(useGameStore.getState().game.history).toHaveLength(0);
    expect(useGameStore.getState().tavern.variables).toBe(before);
    expect(vi.mocked(saveChat).mock.calls.flatMap(([chat]) => chat.messages).filter(message => message.role === 'assistant')).toHaveLength(0);
    if (mode === 'switch-session') expect(useGameStore.getState().api.streamBuffer).toBe('new session marker');
    expect(getTurnMetrics().at(-1)?.outcome).toBe('cancelled');
    unmount();
  });
});
