// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import { invalidatePreplans, prepareMysteryTurn, reviewNarrativeAgainstWriterPacket, reviewNarrativeStyle } from '../agents/mystery';
import { generateSceneChecklist } from '../agents/mystery/scene-list';
import { streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';

vi.mock('../agents/mystery', async original => ({ ...await original<typeof import('../agents/mystery')>(),
  prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(), reviewNarrativeAgainstWriterPacket: vi.fn(), reviewNarrativeStyle: vi.fn() }));
vi.mock('../agents/mystery/scene-list', async original => ({ ...await original<typeof import('../agents/mystery/scene-list')>(), generateSceneChecklist: vi.fn() }));
vi.mock('../sillytavern/api-router', async original => ({ ...await original<typeof import('../sillytavern/api-router')>(), streamChatCompletion: vi.fn() }));
vi.mock('../agents/state/state-agent', async original => ({ ...await original<typeof import('../agents/state/state-agent')>(), runStateAgent: vi.fn() }));
vi.mock('../sillytavern/database', async original => ({ ...await original<typeof import('../sillytavern/database')>(), saveChat: vi.fn() }));
const baseline = useGameStore.getState();
const prose = '<maintext>场景|home-day\n对话|旁白|calm|你在房间里查看四周。</maintext><option>继续调查\n休息一会儿</option><sum>查看房间。</sum><vars>{}</vars>';
const approved = { approved: true, violations: [], corrections: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected live request in resolved hook fixture'); });
  invalidatePreplans();
  const variables = { ...createDefaultVariables(), location: 'home', time: '2024-09-09T08:00:00', stamina: 100, sanity: 70 };
  const preset = { ...createDefaultPreset(), id: 'preset', createdAt: 0, updatedAt: 0 } as ChatPreset;
  const settings = { api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, activePresetId: preset.id,
    userName: '玩家', characterName: '文穗', agentNarrativeMode: 'standard' } as AppSettings;
  const chat: ChatSession = { id: 'resolved-chat', name: 'test', messages: [], variables,
    characterName: '文穗', userName: '玩家', presetId: preset.id, lorebookIds: [], createdAt: 0, updatedAt: 0 };
  useGameStore.setState({ ...baseline, tavern: { ...baseline.tavern, settings, presets: [preset], variables, chats: [chat], activeChatId: chat.id },
    api: { ...baseline.api, abortController: null }, game: { ...baseline.game, history: [], currentScene: null,
      currentState: { ...baseline.game.currentState, background: 'home-day' },
      gameStatus: { time: new Date(variables.time), stamina: 100, sanity: 70, items: [] },
      endingCheckContext: variablesToEndingContext(variables) as typeof baseline.game.endingCheckContext } }, true);
  vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages =>
    messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性') ? JSON.stringify(approved)
      : JSON.stringify({ turnGoal: '查看房间', tone: '克制', timeCostMinutes: 1,
        beats: [{ id: 'b', purpose: '查看', description: '你在房间里查看四周。', locationId: 'home', speakerIds: [] }],
        revelations: [], assetRequests: [], optionIntents: [
          { id: 'o1', intent: '继续调查', tone: '克制', expectedPressure: 'low' },
          { id: 'o2', intent: '休息一会儿', tone: '克制', expectedPressure: 'low' }] }) }));
  vi.mocked(saveChat).mockResolvedValue(undefined);
  vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue(approved);
  vi.mocked(reviewNarrativeStyle).mockResolvedValue(approved);
  vi.mocked(generateSceneChecklist).mockResolvedValue({ observe: '', investigateItems: [], actionItems: [] });
  vi.mocked(runStateAgent).mockResolvedValue({ vars: { stamina: 1, sanity: 1, time: '2024-09-09T23:00:00', location: 'school' }, summary: null, rejected: [], clamped: [] });
  vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
    callbacks.onToken(prose); await callbacks.onComplete();
  });
});
afterEach(() => { invalidatePreplans(); useGameStore.getState().api.abortController?.abort(); vi.unstubAllGlobals(); useGameStore.setState(baseline, true); });

describe('resolved action at the real hook boundary', () => {
  it.each([['休息一会儿', 112], ['等待一会儿', 100]] as const)('settles %s through the actual prepared hook', async (input, stamina) => {
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage(input); });
    expect(useGameStore.getState().game.history).toHaveLength(1);
    expect(useGameStore.getState().tavern.variables).toMatchObject({ time: '2024-09-09T09:00:00', stamina, sanity: 70 });
    unmount();
  });
  it('retains the original approved finding through interruption even when the resumed Director omits it', async () => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, variables: { ...state.tavern.variables, cycleCount: 2, time: '2024-09-09T15:30:00' } },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T15:30:00') },
        endingCheckContext: { ...state.game.endingCheckContext, cycleCount: 2 } } }));
    let plans = 0;
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages => {
      if (messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')) return JSON.stringify(approved);
      plans += 1;
      return JSON.stringify({ turnGoal: '查看衣柜', tone: '克制', beats: [{ id: 'b', purpose: '调查', description: '查看衣柜', locationId: 'home' }],
        revelations: plans === 1 ? [{ factId: 'F001', level: 'hint', delivery: 'object' }] : [], assetRequests: [],
        optionIntents: [{ id: 'o', intent: '休息', tone: '克制', expectedPressure: 'low' }] });
    } }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ ...approved, assertionAudit: {
      reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '衣柜', proposition: '衣柜出现异常', status: 'supported',
        citations: [{ sourceId: 'fact:F001:hint', quote: '衣柜' }], reason: 'mock semantic audit' }],
    } });
    let scenes = 0;
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      scenes += 1;
      callbacks.onToken(prose.replace('你在房间里查看四周。', scenes === 2
        ? '警方通过电话明确告知你：文穗已经死亡。' : `你检查衣柜的第${scenes}处地方。`));
      await callbacks.onComplete();
    });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('深入调查衣柜'); });
    const first = useGameStore.getState().tavern.variables;
    expect(first.time).toBe('2024-09-09T16:00:00');
    expect(first.mysteryKnowledge?.['shared-apron-missing']).toBeUndefined();
    const resumeActionId = first.actionContinuity?.continuation?.actionId;
    expect(first.actionContinuity?.pendingAuthorization).toBeTruthy();
    await act(async () => { await result.current.sendMessage('接听警方电话'); });
    await act(async () => { await result.current.sendMessage('继续未完成的调查', { resumeActionId }); });
    const final = useGameStore.getState().tavern.variables;
    expect(final.time).toBe('2024-09-09T17:15:00');
    expect(final.mysteryKnowledge?.['shared-apron-missing']).toBe('hint');
    expect(final.actionContinuity?.pendingAuthorization).toBeNull();
    expect(vi.mocked(streamChatCompletion).mock.calls.at(-1)?.[1].map(message => message.content).join(''))
      .not.toContain('shared-apron-missing');
    unmount();
  });
  it.each(['maintext', 'summary', 'none'])('only learns earned facts cited in accepted maintext (%s audit)', async field => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, variables: { ...state.tavern.variables, cycleCount: 2 } },
      game: { ...state.game, endingCheckContext: { ...state.game.endingCheckContext, cycleCount: 2 } } }));
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages =>
      messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性') ? JSON.stringify(approved)
        : JSON.stringify({ turnGoal: '查看衣柜', tone: '克制', beats: [{ id: 'b', purpose: '调查', description: '查看衣柜', locationId: 'home' }],
          revelations: [{ factId: 'F001', level: 'hint', delivery: 'object' }], assetRequests: [],
          optionIntents: [{ id: 'o', intent: '休息', tone: '克制', expectedPressure: 'low' }] }) }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ ...approved, assertionAudit: {
      reviewedFields: field === 'none' ? [] : [field], assertions: field === 'none' ? [] : [{ field,
        quote: '你在房间里查看四周。', proposition: '衣柜中出现异常', status: 'supported',
        citations: [{ sourceId: 'fact:F001:hint', quote: '衣柜' }], reason: 'mock semantic audit' }],
    } });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('调查衣柜'); });
    expect(useGameStore.getState().game.history).toHaveLength(1);
    expect(useGameStore.getState().tavern.variables.mysteryKnowledge?.['shared-apron-missing'])
      .toBe(field === 'maintext' ? 'hint' : undefined);
    expect(useGameStore.getState().tavern.variables.time).toBe('2024-09-09T08:55:00');
    unmount();
  });
  it.each(['standard', 'strict'] as const)('%s persists the same resolved result passed to State', async mode => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings: { ...state.tavern.settings, agentNarrativeMode: mode } } }));
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('调查房间'); });
    const state = useGameStore.getState();
    expect(state.game.history).toHaveLength(1);
    expect(state.tavern.variables).toMatchObject({ time: '2024-09-09T08:55:00', stamina: 93, sanity: 70, location: 'home' });
    expect(vi.mocked(runStateAgent).mock.calls[0][0].resolvedAction).toMatchObject({ executedMinutes: 55 });
    expect(state.tavern.variables.actionContinuity?.settledResolutionIds).toHaveLength(1);
    expect(vi.mocked(saveChat).mock.calls.at(-1)?.[0].variables.time).toBe('2024-09-09T08:55:00');
    unmount();
  });
  it('does not spend time or resources when Writer fails before acceptance', async () => {
    vi.mocked(streamChatCompletion).mockRejectedValue(new Error('gateway unavailable'));
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('调查房间'); });
    expect(useGameStore.getState().tavern.variables).toMatchObject({ time: '2024-09-09T08:00:00', stamina: 100, sanity: 70 });
    expect(useGameStore.getState().game.history).toHaveLength(0);
    expect(useGameStore.getState().tavern.variables.actionContinuity).toBeUndefined();
    unmount();
  });
  it.each([false, true])('resumes remaining75minutes after death news (failed save/retry: %s)', async retry => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, variables: { ...state.tavern.variables, time: '2024-09-09T15:30:00' } },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T15:30:00') } } }));
    const scenes = ['你开始逐一检查房间的角落。', '警方通过电话明确告知你：文穗已经死亡。', '你继续查看房间中剩下的地方。'];
    let index = 0;
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken(prose.replace('你在房间里查看四周。', scenes[index++])); await callbacks.onComplete();
    });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('深入调查房间'); });
    const first = useGameStore.getState().tavern.variables;
    expect(first).toMatchObject({ time: '2024-09-09T16:00:00', stamina: 96, sanity: 70, deathNews: 'pending' });
    const continuationId = first.actionContinuity?.continuation?.actionId;
    expect(continuationId).toBeTruthy();
    await act(async () => { await result.current.sendMessage('接听警方电话'); });
    expect(useGameStore.getState().tavern.variables).toMatchObject({ time: '2024-09-09T16:00:00', stamina: 96, sanity: 58, deathNews: 'delivered' });
    expect(useGameStore.getState().tavern.variables.actionContinuity?.continuation?.actionId).toBe(continuationId);
    if (retry) {
      vi.mocked(saveChat).mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error('disk write failed'));
    }
    await act(async () => { await result.current.sendMessage('继续未完成的调查', { resumeActionId: continuationId }); });
    if (retry) {
      expect(useGameStore.getState().tavern.variables).toMatchObject({ time: '2024-09-09T16:00:00', stamina: 96, sanity: 58 });
      expect(useGameStore.getState().tavern.variables.actionContinuity?.continuation?.actionId).toBe(continuationId);
      index = 2;
      await act(async () => { await result.current.retryTurn(); });
    }
    expect(useGameStore.getState().tavern.variables).toMatchObject({ time: '2024-09-09T17:15:00', stamina: 86, sanity: 58 });
    expect(useGameStore.getState().tavern.variables.actionContinuity?.continuation).toBeNull();
    expect(useGameStore.getState().tavern.variables.actionContinuity?.settledResolutionIds).toHaveLength(3);
    unmount();
  });
});
