// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import { invalidatePreplans, prepareMysteryTurn, reviewNarrativeAgainstWriterPacket, type FactReview } from '../agents/mystery';
import { generateSceneChecklist } from '../agents/mystery/scene-list';
import { streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';

vi.mock('../agents/mystery', async original => ({
  ...await original<typeof import('../agents/mystery')>(),
  prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(), reviewNarrativeAgainstWriterPacket: vi.fn(),
}));
vi.mock('../agents/mystery/scene-list', async original => ({
  ...await original<typeof import('../agents/mystery/scene-list')>(), generateSceneChecklist: vi.fn(),
}));
vi.mock('../sillytavern/api-router', async original => ({
  ...await original<typeof import('../sillytavern/api-router')>(), streamChatCompletion: vi.fn(),
}));
vi.mock('../agents/state/state-agent', async original => ({
  ...await original<typeof import('../agents/state/state-agent')>(), runStateAgent: vi.fn(),
}));
vi.mock('../sillytavern/database', async original => ({
  ...await original<typeof import('../sillytavern/database')>(), saveChat: vi.fn(),
}));

const baseline = useGameStore.getState();
const prose = '<maintext>场景|home-day\n对话|旁白|calm|你在房间里坐下。</maintext><option>观察房间\n继续休息</option><sum>在家坐下。</sum><vars>{}</vars>';
const approved: FactReview = { approved: true, violations: [], corrections: [] };
const injectedDetail = '记录证明六点半白色配送车到过便利店';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected live request in checklist fixture'); });
  invalidatePreplans();
  const variables = { ...createDefaultVariables(), time: '2024-09-09T08:00:00' };
  const preset = { ...createDefaultPreset(), id: 'preset', createdAt: 0, updatedAt: 0 } as ChatPreset;
  const settings = { api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
    activePresetId: preset.id, userName: '玩家', characterName: '文穗', agentNarrativeMode: 'strict' } as AppSettings;
  const chat = { id: 'checklist-chat', name: 'test', messages: [], variables, createdAt: 0, updatedAt: 0 } as ChatSession;
  useGameStore.setState({ ...baseline,
    tavern: { ...baseline.tavern, settings, presets: [preset], variables, chats: [chat], activeChatId: chat.id },
    api: { ...baseline.api, abortController: null },
    game: { ...baseline.game, history: [], currentScene: null,
      currentState: { ...baseline.game.currentState, background: 'home-day' },
      gameStatus: { time: new Date(2024, 8, 9, 8, 0), stamina: 100, sanity: 70, items: [] },
      endingCheckContext: variablesToEndingContext(variables) as typeof baseline.game.endingCheckContext },
  }, true);
  const prepared = await prepareActual({ mode: 'strict', api: settings.api, preset,
    truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [] },
    turnContext: {}, presentationContext: {},
    complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
      ? JSON.stringify(approved)
      : JSON.stringify({ turnGoal: '在家休息', tone: '克制',
        beats: [{ id: 'b1', purpose: '休息', description: '在家坐下' }], revelations: [],
        optionIntents: [{ id: 'o1', intent: '观察房间', tone: '谨慎', expectedPressure: 'low' }], assetRequests: [] }),
  });
  // Isolate the mandatory async checklist gate from the foreground model reviews.
  prepared.reviewPolicy.narrative = false;
  prepared.reviewPolicy.style = false;
  vi.mocked(prepareMysteryTurn).mockResolvedValue(prepared);
  vi.mocked(saveChat).mockResolvedValue(undefined);
  vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
  vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
    callbacks.onToken(prose);
    await callbacks.onComplete();
  });
  vi.mocked(generateSceneChecklist).mockResolvedValue({ observe: injectedDetail, investigateItems: [], actionItems: [] });
  vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue(approved);
});

afterEach(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe('asynchronous checklist authority', () => {
  it('rejects unsupported checklist text without undoing the accepted foreground scene', async () => {
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ approved: false,
      violations: [{ code: 'ungrounded-evidence-detail', message: '无配送记录授权' }], corrections: ['移除未授权断言'] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('坐下休息'); });
    await waitFor(() => expect(reviewNarrativeAgainstWriterPacket).toHaveBeenCalledTimes(1));
    const state = useGameStore.getState();
    expect(state.game.history).toHaveLength(1);
    expect(state.game.currentScene?.lines[0].text).toBe('你在房间里坐下。');
    expect(JSON.stringify(state.game.currentScene)).not.toContain(injectedDetail);
    expect(JSON.stringify(state.tavern.chats[0].messages)).not.toContain(injectedDetail);
    expect(vi.mocked(saveChat).mock.calls.every(([chat]) => !JSON.stringify(chat).includes(injectedDetail))).toBe(true);
    unmount();
  });

  it('attaches an approved checklist only after its review resolves', async () => {
    let finishReview!: (review: FactReview) => void;
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockImplementation(() => new Promise(resolve => { finishReview = resolve; }));
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('坐下休息'); });
    await waitFor(() => expect(reviewNarrativeAgainstWriterPacket).toHaveBeenCalledTimes(1));
    expect(useGameStore.getState().game.currentScene?.observe).not.toBe(injectedDetail);
    await act(async () => { finishReview(approved); });
    await waitFor(() => expect(useGameStore.getState().game.currentScene?.observe).toBe(injectedDetail));
    expect(vi.mocked(reviewNarrativeAgainstWriterPacket).mock.calls[0][0].narrative).toContain(injectedDetail);
    expect(useGameStore.getState().game.history).toHaveLength(1);
    unmount();
  });

  it('discards a checklist whose review finishes after switching chats', async () => {
    let finishReview!: (review: FactReview) => void;
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockImplementation(() => new Promise(resolve => { finishReview = resolve; }));
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('坐下休息'); });
    await waitFor(() => expect(reviewNarrativeAgainstWriterPacket).toHaveBeenCalledTimes(1));
    const writesBeforeSwitch = vi.mocked(saveChat).mock.calls.length;
    useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'other-chat' } }));
    await act(async () => { finishReview(approved); });
    expect(JSON.stringify(useGameStore.getState().game.currentScene)).not.toContain(injectedDetail);
    expect(JSON.stringify(useGameStore.getState().tavern.chats)).not.toContain(injectedDetail);
    expect(saveChat).toHaveBeenCalledTimes(writesBeforeSwitch);
    unmount();
  });

  it('does not replace chat state when a delayed checklist save finishes after switching chats', async () => {
    let finishSave!: () => void;
    vi.mocked(saveChat).mockImplementation(async chat => {
      if (JSON.stringify(chat).includes(injectedDetail)) await new Promise<void>(resolve => { finishSave = resolve; });
    });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('坐下休息'); });
    await waitFor(() => expect(finishSave).toBeTypeOf('function'));
    useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'other-chat' } }));
    await act(async () => { finishSave(); });
    expect(JSON.stringify(useGameStore.getState().tavern.chats)).not.toContain(injectedDetail);
    unmount();
  });
});
