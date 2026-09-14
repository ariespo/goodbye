// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import type { PreparedMysteryTurn } from '../agents/mystery/orchestrator';
import { prepareMysteryTurn, invalidatePreplans, reviewNarrativeAgainstWriterPacket } from '../agents/mystery';
import { callSecondaryApi, streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';
import { lockConclusionRoute } from '../engine/conclusion-system';
import { buildInvestigationOpportunities } from '../engine/investigation-opportunities';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { createFactAliasTable } from '../agents/mystery/fact-aliases';
import { buildPlayerKnowledgeBrief } from '../data/playerKnowledge';
import { maintextToScene } from '../engine/scene-parser';
import type { TruthContext } from '../agents/mystery/types';

const actionResolutionCapture = vi.hoisted(() => ({
  traces: [] as Array<{ inputId: string; outputResolutionId: string; resumed: boolean }>,
}));

vi.mock('../engine/action-resolution', async importOriginal => {
  const actual = await importOriginal<typeof import('../engine/action-resolution')>();
  return { ...actual, resolveAction: (input: Parameters<typeof actual.resolveAction>[0]) => {
    const output = actual.resolveAction(input);
    actionResolutionCapture.traces.push({ inputId: input.id, outputResolutionId: output.id,
      resumed: input.continuation !== undefined });
    return output;
  } };
});

vi.mock('../agents/mystery', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery')>(), prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(),
  reviewNarrativeAgainstWriterPacket: vi.fn(),
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

async function configureCycle(mode: 'standard' | 'legacy', cycleCount: number, time = '08:00:00', scope: 'normal' | 'deep' = 'normal') {
  const state = useGameStore.getState();
  const preset = state.tavern.presets[0]!;
  const settings = { ...state.tavern.settings, agentNarrativeMode: mode } as unknown as AppSettings;
  const variables = {
    ...createDefaultVariables(), cycleCount, time: `2024-09-09T${time}`,
    suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
    loopSuspicionStart: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
    unlockedClues: ['a-sacrifice-list', 'a-lured-inside'],
    mysteryKnowledge: { 'a-sacrifice-list': 'clue' as const, 'a-lured-inside': 'clue' as const },
  };
  const chat: ChatSession = { id: `day-contract-${mode}-${cycleCount}`, name: 'test', messages: [], variables,
    characterName: '文穗', userName: '玩家', presetId: preset.id, lorebookIds: [], createdAt: 0, updatedAt: 0 };
  useGameStore.setState(current => ({
    tavern: { ...current.tavern, settings, activeChatId: chat.id, variables, chats: [chat] },
    api: { ...current.api, abortController: null, parsedContent: { ...current.api.parsedContent, options: [] } },
    game: { ...current.game, history: [], currentScene: null,
      gameStatus: { time: new Date(`2024-09-09T${time}`), stamina: 100, sanity: 70, items: [] },
      endingPanel: { ...current.game.endingPanel, visible: false, pendingEndingId: null },
      endingCheckContext: variablesToEndingContext(variables) as typeof current.game.endingCheckContext },
  }));
  prepared = await prepareActual({ mode: mode === 'legacy' ? 'standard' : mode, api: settings.api, preset,
    truthContext: { cycleCount, currentLocation: 'home', lockedRoute: null,
      unlockedClueIds: Object.keys(variables.mysteryKnowledge), playerKnowledge: variables.mysteryKnowledge,
      suspicion: variables.suspicion, activeNpcIds: [] },
    turnContext: {}, presentationContext: {},
    complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
      ? JSON.stringify({ approved: true, violations: [], corrections: [] })
      : JSON.stringify({ turnGoal: '核对现有判断', tone: '克制',
        beats: [{ id: 'beat-1', purpose: '核对', description: '把怀疑和已经核实的事实分开' }],
        revelations: [], actionSteps: [{ id: 'check', kind: 'investigation', scope, locationId: 'home' }],
        optionIntents: [{ id: 'option-1', intent: '继续核对', tone: '谨慎', expectedPressure: 'low' }], assetRequests: [] }),
  });
  prepared.reviewPolicy.narrative = false;
  prepared.reviewPolicy.style = false;
  vi.mocked(prepareMysteryTurn).mockResolvedValue(prepared);
}

beforeEach(async () => {
  vi.clearAllMocks();
  actionResolutionCapture.traces.length = 0;
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
  vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ approved: true, violations: [], corrections: [],
    continuityAudit: { reviewed: true, disclosures: [], beliefs: [], commitments: [] } });
});

afterEach(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe('narrative day contract at the playable commit boundary', () => {
  it.each(['standard', 'legacy'] as const)('%s accepts an early accusation turn without committing a route, solution, or ending', async mode => {
    for (const cycleCount of [1, 2, 3]) {
      await configureCycle(mode, cycleCount);
      draft = '<maintext>场景|home-day\n对话|旁白|calm|你把现有线索重新排开，只确认怀疑仍缺少决定性证据。</maintext><option>继续核对\n暂时休息</option><sum>怀疑尚未形成结论。</sum><vars>{}</vars>';
      const { result, unmount } = renderHook(() => useGameLoop());
      await act(async () => { await result.current.sendMessage('我认定周大爷杀了文穗，现在就确认结论'); });
      const state = useGameStore.getState();
      expect(state.game.history).toHaveLength(1);
      expect(state.tavern.variables.lockedRoute ?? null).toBeNull();
      expect(state.tavern.variables.mysteryKnowledge?.['a-murder-staged-fall']).toBeUndefined();
      expect(state.game.endingPanel.pendingEndingId).toBeNull();
      expect(lockConclusionRoute(state.tavern.variables, 'A').accepted).toBe(false);
      unmount();
    }
  });

  it.each(['standard', 'legacy'] as const)('%s stops a long cycle-3 investigation at 16:00 with stable unfinished authority', async mode => {
    await configureCycle(mode, 3, '15:30:00', 'deep');
    const neutral = { ...useGameStore.getState().tavern.variables,
      suspicion: { 'old-man': 0, 'detective-a': 0, 'detective-b': 0, self: 0 },
      loopSuspicionStart: { 'old-man': 0, 'detective-a': 0, 'detective-b': 0, self: 0 },
      unlockedClues: [], mysteryKnowledge: {} };
    useGameStore.setState(state => ({ tavern: { ...state.tavern, variables: neutral,
      chats: state.tavern.chats.map(chat => ({ ...chat, variables: neutral })) },
      game: { ...state.game, endingCheckContext: variablesToEndingContext(neutral) as typeof state.game.endingCheckContext } }));
    const settings = useGameStore.getState().tavern.settings;
    const preset = useGameStore.getState().tavern.presets[0]!;
    vi.mocked(prepareMysteryTurn).mockImplementation(async options => {
      const dynamicPrepared = await prepareActual({ ...options,
        mode: mode === 'legacy' ? 'standard' : mode, api: settings.api, preset,
        complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
          ? JSON.stringify({ approved: true, violations: [], corrections: [] })
          : JSON.stringify({ turnGoal: options.actionAuthority?.resumeActionId ? '继续核对旧记录'
            : options.actionAuthority?.originalInput.includes('接听') ? '接听固定电话' : '深入核对旧记录', tone: '克制',
            beats: [{ id: 'b', purpose: '调查', description: options.actionAuthority?.originalInput.includes('接听')
              ? '接听警方电话' : '在家深入核对旧记录', locationId: 'home' }], revelations: [],
            ...(!options.actionAuthority?.resumeActionId && !options.actionAuthority?.originalInput.includes('接听')
              ? { actionSteps: [{ id: 'home-records', kind: 'investigation', scope: 'deep', locationId: 'home' }] }
              : {}),
            optionIntents: [{ id: 'continue', intent: '继续核对', tone: '谨慎', expectedPressure: 'medium' }],
            assetRequests: [] }),
      });
      dynamicPrepared.reviewPolicy.narrative = false;
      dynamicPrepared.reviewPolicy.style = false;
      return dynamicPrepared;
    });
    draft = '<maintext>场景|home-day\n对话|旁白|calm|你开始深入核对旧记录，广播报时后仍有大半没有查完。</maintext><option>处理眼前的事情\n停下来</option><sum>调查被固定事件打断。</sum><vars>{}</vars>';
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('在家深入调查旧记录'); });
    expect(useGameStore.getState().api.turnRecovery.errorMessage ?? null).toBeNull();
    expect(useGameStore.getState().game.history).toHaveLength(1);
    const state = useGameStore.getState();
    const resolved = vi.mocked(runStateAgent).mock.calls.at(-1)?.[0].resolvedAction;
    expect(state.game.history).toHaveLength(1);
    expect(resolved).toMatchObject({ plannedMinutes: 105, executedMinutes: 30, completedSourceIds: [] });
    expect(state.tavern.variables.time).toBe('2024-09-09T16:00:00');
    expect(resolved?.continuation?.actionId).toBeTruthy();
    expect(state.tavern.variables.actionContinuity?.continuation?.actionId).toBe(resolved?.continuation?.actionId);
    expect(state.tavern.variables.mysteryKnowledge?.['a-murder-staged-fall']).toBeUndefined();
    expect(state.game.endingPanel.pendingEndingId).toBeNull();

    const continuationId = resolved!.continuation!.actionId;
    draft = '<maintext>场景|home-day\n对话|旁白|calm|你接起电话，警方明确告知文穗已经死亡。</maintext><option>处理眼前的事情\n停下来</option><sum>死讯已经送达。</sum><vars>{}</vars>';
    await act(async () => { await result.current.sendMessage('接听电话，处理眼前的固定事件。'); });
    expect(useGameStore.getState().game.history).toHaveLength(2);
    const optionState = useGameStore.getState();
    const resumeOption = optionState.api.parsedContent.options[0];
    const resumeBinding = optionState.api.parsedContent.optionBindings?.[0];
    expect(resumeOption).toMatch(/继续未完成的行动.*剩余75分钟/u);
    expect(resumeBinding).toMatchObject({ continuationId });

    draft = '<maintext>场景|home-day\n对话|旁白|calm|你回到桌前，把剩余旧记录逐项核对完毕。</maintext><option>整理记录\n暂时休息</option><sum>旧记录核对完成。</sum><vars>{}</vars>';
    let selected = false;
    act(() => { selected = result.current.selectOption(resumeOption, resumeBinding); });
    expect(selected).toBe(true);
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(3));
    const final = useGameStore.getState();
    const resolvedActions = vi.mocked(runStateAgent).mock.calls
      .map(call => call[0].resolvedAction).filter(value => value !== undefined);
    const resumed = resolvedActions.at(-1)!;
    const partialTrace = actionResolutionCapture.traces.find(trace => trace.outputResolutionId === resolved?.id);
    const resumedTrace = actionResolutionCapture.traces.find(trace => trace.outputResolutionId === resumed.id);
    expect(resumed).toMatchObject({ plannedMinutes: 75, executedMinutes: 75 });
    expect(resumed.continuation).toBeUndefined();
    expect(final.tavern.variables).toMatchObject({ time: '2024-09-09T17:15:00', deathNews: 'delivered' });
    expect(final.tavern.variables.actionContinuity?.continuation).toBeNull();
    expect(resolvedActions.flatMap(item => item?.eventEffectIds ?? [])
      .filter(effectId => effectId === 'death-news:cycle:3')).toHaveLength(1);
    expect(partialTrace).toMatchObject({ inputId: continuationId, resumed: false });
    expect(resumedTrace).toMatchObject({ inputId: continuationId, resumed: true });
    unmount();
  });

  it('earns the legal cycle-4 route fact through a bound production menu action while the cycle-5 solution remains absent', async () => {
    await configureCycle('standard', 4);
    const current = useGameStore.getState();
    const locked = lockConclusionRoute(current.tavern.variables, 'A');
    expect(locked.accepted).toBe(true);
    const variables = { ...locked.value, location: 'old-man-building' } as typeof current.tavern.variables;
    const storyTime = typeof variables.time === 'string' ? variables.time : '2024-09-09T08:00:00';
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, variables,
        chats: state.tavern.chats.map(chat => ({ ...chat, variables })) },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date(storyTime) },
        currentState: { ...state.game.currentState, background: 'old-man-building-day' },
        endingCheckContext: variablesToEndingContext(variables) as typeof state.game.endingCheckContext },
    }));
    const context: TruthContext = { cycleCount: 4, currentLocation: 'old-man-building', lockedRoute: 'A',
      unlockedClueIds: Object.keys(variables.mysteryKnowledge ?? {}),
      playerKnowledge: (variables.mysteryKnowledge ?? {}) as TruthContext['playerKnowledge'],
      suspicion: variables.suspicion, activeNpcIds: ['old-man'],
      playerPresentation: buildPlayerKnowledgeBrief(variables) };
    const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH, context,
      progress: { cycleCount: 4, completedIds: [], noProgressByTopic: {} } })
      .find(item => item.topicKey === 'old-man-building:visitor-account');
    expect(opportunity?.sourceIds[0]).toMatch(/:confirmation$/);
    const alias = createFactAliasTable(MYSTERY_TRUTH_GRAPH).factIdToAlias['a-lured-inside'];
    const preset = useGameStore.getState().tavern.presets[0]!;
    const settings = useGameStore.getState().tavern.settings;
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, mode: 'standard', api: settings.api, preset,
      complete: async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
        ? JSON.stringify({ approved: true, violations: [], corrections: [] })
        : JSON.stringify({ turnGoal: '核对暴雨当天的来访者', tone: '克制',
          beats: [{ id: 'b', purpose: '核对', description: '旧楼内的记录和现场痕迹确认文穗被诱入内室',
            locationId: 'old-man-building' }],
          revelations: [{ factId: alias, level: 'confirmation', delivery: 'object' }],
          actionSteps: [{ id: 'visitor-account', kind: 'investigation', scope: opportunity!.scope, locationId: 'old-man-building' }],
          optionIntents: [{ id: 'continue', intent: '继续核对', tone: '谨慎', expectedPressure: 'medium' }], assetRequests: [] }),
    }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ approved: true, violations: [], corrections: [],
      assertionAudit: { reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '旧记录和内室痕迹互相印证：周德明以避雨为饵，把文穗诱入内室。',
        proposition: '旧楼现场确认文穗被诱入内室', status: 'supported',
        citations: [{ sourceId: `fact:${alias}:confirmation`, quote: '旧记录和内室痕迹互相印证：周德明以避雨为饵，把文穗诱入内室。' }],
        reason: 'authorized route fact' }] },
      continuityAudit: { reviewed: true, disclosures: [], beliefs: [], commitments: [] } });
    draft = '<maintext>场景|old-man-building\n对话|周大爷|calm|我只让她在门口避过雨，别的我不知道。\n对话|旁白|calm|旧记录和内室痕迹互相印证：周德明以避雨为饵，把文穗诱入内室。</maintext><option>继续核对\n离开</option><sum>核实暴雨当天的来访情况。</sum><vars>{}</vars>';
    const menu = { ...maintextToScene('对话|旁白|calm|你准备核对来访记录。'), investigateItems: [{
      desc: opportunity!.publicGoal, suspect: '周大爷', style: '现实', time: '55分钟', stamina: 93, sanity: 70,
      opportunityId: opportunity!.id, kind: 'investigation' as const, scope: opportunity!.scope, locationId: opportunity!.locationId,
      actionId: opportunity!.id, originLocationId: 'old-man-building',
    }] };
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));
    const { result, unmount } = renderHook(() => useGameLoop());
    act(() => { result.current.performAction('investigate', 0, opportunity!.id, 'old-man-building'); });
    await waitFor(() => {
      const state = useGameStore.getState();
      expect(state.api.isStreaming).toBe(false);
      expect(state.game.history.length > 0 || state.api.turnRecovery.phase !== 'idle').toBe(true);
    });
    expect(useGameStore.getState().api.turnRecovery.errorMessage ?? null).toBeNull();
    expect(useGameStore.getState().game.history).toHaveLength(1);
    const final = useGameStore.getState().tavern.variables;
    expect(final.mysteryKnowledge?.['a-lured-inside']).toBe('confirmation');
    expect(final.mysteryKnowledge?.['a-murder-staged-fall']).toBeUndefined();
    expect(final.opportunityProgress?.completedIds).toContain(opportunity!.id);
    unmount();
  });
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
