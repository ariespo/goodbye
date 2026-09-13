// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import type { PreparedMysteryTurn } from '../agents/mystery/orchestrator';
import { prepareMysteryTurn, invalidatePreplans } from '../agents/mystery';
import { callSecondaryApi, streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';

vi.mock('../agents/mystery', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery')>(), prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(),
}));
vi.mock('../agents/mystery/scene-list', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery/scene-list')>(),
  generateSceneChecklist: vi.fn().mockResolvedValue({ observe: '房间', investigateItems: [], actionItems: [] }),
}));
vi.mock('../sillytavern/api-router', async importOriginal => ({
  ...await importOriginal<typeof import('../sillytavern/api-router')>(),
  streamChatCompletion: vi.fn(), callSecondaryApi: vi.fn(),
}));
vi.mock('../agents/state/state-agent', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/state/state-agent')>(), runStateAgent: vi.fn(),
}));
vi.mock('../sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../sillytavern/database')>(), saveChat: vi.fn(),
}));

const baseline = useGameStore.getState();
let prepared: PreparedMysteryTurn;
let draft: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected live HTTP in day-contract fixture'); });
  invalidatePreplans();
  const variables = { ...createDefaultVariables(), time: '2024-09-09T08:00:00' };
  const preset = { ...createDefaultPreset(), id: 'preset', createdAt: 0, updatedAt: 0 } as ChatPreset;
  const settings = { api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
    activePresetId: 'preset', userName: '玩家', characterName: '文穗', agentNarrativeMode: 'strict' } as AppSettings;
  const chat: ChatSession = { id: 'day-contract-chat', name: 'test', messages: [], variables,
    characterName: '文穗', userName: '玩家', presetId: 'preset', lorebookIds: [], createdAt: 0, updatedAt: 0 };
  useGameStore.setState({ ...baseline,
    tavern: { ...baseline.tavern, settings, presets: [preset], activeChatId: chat.id, variables, chats: [chat] },
    api: { ...baseline.api, abortController: null },
    game: { ...baseline.game, history: [], currentScene: null,
      currentState: { ...baseline.game.currentState, background: 'home-day' },
      gameStatus: { time: new Date(2024, 8, 9, 8, 0), stamina: 100, sanity: 70, items: [] },
      endingCheckContext: variablesToEndingContext(variables) as typeof baseline.game.endingCheckContext },
  }, true);
  prepared = await prepareActual({ mode: 'strict', api: settings.api, preset,
    truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [] },
    turnContext: {}, presentationContext: {},
    complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
      ? JSON.stringify({ approved: true, violations: [], corrections: [] })
      : JSON.stringify({ turnGoal: '在家休息', tone: '克制', beats: [{ id: 'beat-1', purpose: '休息', description: '在家坐下休息' }],
        revelations: [], optionIntents: [{ id: 'option-1', intent: '继续休息', tone: '谨慎', expectedPressure: 'low' }], assetRequests: [] }),
  });
  // These tests isolate mandatory program gates even if optional model critics are off.
  prepared.reviewPolicy.narrative = false;
  prepared.reviewPolicy.style = false;
  vi.mocked(prepareMysteryTurn).mockResolvedValue(prepared);
  vi.mocked(saveChat).mockResolvedValue(undefined);
  vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
  vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
    callbacks.onToken(draft);
    await callbacks.onComplete();
  });
  // Keep the real format-repair prompt/parser path; only replace its network response.
  vi.mocked(callSecondaryApi).mockImplementation(async () => draft);
});

afterEach(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe('narrative day contract at the playable commit boundary', () => {
  it('does not let an unreviewed State summary replace the accepted narrative summary', async () => {
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: '确认文穗今早未到校。', rejected: [], clamped: [] });
    draft = '<maintext>场景|home-day\n对话|旁白|calm|你坐下整理思绪，还不能确认她是否到过学校。</maintext><option>继续观察\n起身走走</option><sum>尚未核实文穗是否到校。</sum><vars>{}</vars>';
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('在家整理思绪'); });
    expect(runStateAgent).toHaveBeenCalled();
    const state = useGameStore.getState();
    expect(JSON.stringify(state.game.history)).not.toContain('确认文穗今早未到校');
    expect(JSON.stringify(state.tavern.variables)).not.toContain('确认文穗今早未到校');
    expect(state.tavern.chats[0].messages.at(-1)?.parsed?.summary).toBe('尚未核实文穗是否到校。');
    unmount();
  });
  it('does not play or charge a scene whose prose remains hidden in observe after both format repairs', async () => {
    draft = '<maintext>场景|home-day\n音乐|peace</maintext><observe>你坐在椅子上，喝完了杯里的水。</observe><option>继续休息\n起身观察</option><sum>在家休息。</sum><vars>{}</vars>';
    const before = useGameStore.getState().game.gameStatus;
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('坐下休息'); });
    const state = useGameStore.getState();
    expect(state.game.currentScene).toBeNull();
    expect(state.game.history).toHaveLength(0);
    expect(state.game.gameStatus).toEqual(before);
    expect(state.tavern.chats[0].messages.filter(message => message.role === 'assistant')).toHaveLength(0);
    expect(state.api.turnRecovery.repairable).toBe(true);
    // Two failed repair outputs must be exhausted, not silently accepted on retry.
    expect(vi.mocked(callSecondaryApi).mock.calls).toHaveLength(2);
    unmount();
  });

  it('keeps pending death news and the prior scene when repairs only repeat a suspense phone call', async () => {
    draft = '<maintext>场景|home-day\n对话|旁白|calm|派出所打来电话，说文穗的事需要当面说，让你带上证件去一趟。</maintext><option>拿起证件\n继续询问</option><sum>接到警方电话。</sum><vars>{}</vars>';
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, deathNews: 'pending', time: '2024-09-09T16:10:00' } },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date(2024, 8, 9, 16, 10) } },
    }));
    const before = useGameStore.getState().game.gameStatus;
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('接听电话'); });
    const state = useGameStore.getState();
    expect(state.tavern.variables.deathNews).toBe('pending');
    expect(state.game.currentScene).toBeNull();
    expect(state.game.history).toHaveLength(0);
    expect(state.game.gameStatus).toEqual(before);
    expect(state.tavern.chats[0].messages.filter(message => message.role === 'assistant')).toHaveLength(0);
    expect(state.api.turnRecovery.repairable).toBe(true);
    expect(vi.mocked(callSecondaryApi).mock.calls).toHaveLength(2);
    unmount();
  });

  it('advances a successfully played same-location rest even when the plan reports zero travel minutes', async () => {
    prepared.writerPacket.plan.timeCostMinutes = 0;
    draft = '<maintext>场景|home-day\n对话|旁白|calm|你在椅子上坐了一会儿，等呼吸慢慢平复，再把杯子放回桌面。</maintext><option>继续观察\n起身走走</option><sum>在家休息。</sum><vars>{}</vars>';
    const before = useGameStore.getState().game.gameStatus.time.getTime();
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('在家坐下休息'); });
    const state = useGameStore.getState();
    expect(state.game.history).toHaveLength(1);
    expect(state.game.currentScene?.lines.some(line => line.text.includes('呼吸慢慢平复'))).toBe(true);
    expect(state.tavern.variables.location).toBe('home');
    expect(state.game.gameStatus.time.getTime()).toBeGreaterThan(before);
    unmount();
  });

  it('delivers pending death news when the accepted playable dialogue explicitly announces Fumi died', async () => {
    draft = '<maintext>场景|home-day\n对话|旁白|calm|电话里的警员明确告诉你：文穗已经死亡。你握着手机，坐回椅子上。</maintext><option>询问情况\n留在原地</option><sum>收到文穗死亡的消息。</sum><vars>{}</vars>';
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, deathNews: 'pending', time: '2024-09-09T16:10:00' } },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date(2024, 8, 9, 16, 10) } },
    }));
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('接听电话'); });
    const state = useGameStore.getState();
    expect(state.game.history).toHaveLength(1);
    expect(state.game.currentScene?.lines.some(line => line.text.includes('文穗已经死亡'))).toBe(true);
    expect(state.tavern.variables.deathNews).toBe('delivered');
    unmount();
  });
});
