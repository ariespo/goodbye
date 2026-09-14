// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
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
import { createDefaultPreset, type AppSettings, type ChatMessage, type ChatPreset, type ChatSession } from '../sillytavern/types';
import { buildInvestigationOpportunities } from '../engine/investigation-opportunities';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { maintextToScene } from '../engine/scene-parser';
import { rebuildSceneFromChat } from '../utils/sceneFromChat';
import { buildPlayerKnowledgeBrief } from '../data/playerKnowledge';
import { candidateFingerprint } from '../memory/character-continuity';
import { normalizeWorldMemory } from '../memory/world-memory';
import { buildMapTravelTransaction, prepareMapTravel } from '../utils/mapTravel';
import { commitGameTransaction } from '../utils/gameTransactionStore';
import { resolveSavedParsedContent } from '../utils/gameSession';

vi.mock('../agents/mystery', async original => ({ ...await original<typeof import('../agents/mystery')>(),
  prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(), reviewNarrativeAgainstWriterPacket: vi.fn(), reviewNarrativeStyle: vi.fn() }));
vi.mock('../agents/mystery/scene-list', async original => ({ ...await original<typeof import('../agents/mystery/scene-list')>(), generateSceneChecklist: vi.fn() }));
vi.mock('../sillytavern/api-router', async original => ({ ...await original<typeof import('../sillytavern/api-router')>(), streamChatCompletion: vi.fn() }));
vi.mock('../agents/state/state-agent', async original => ({ ...await original<typeof import('../agents/state/state-agent')>(), runStateAgent: vi.fn() }));
vi.mock('../sillytavern/database', async original => ({ ...await original<typeof import('../sillytavern/database')>(), saveChat: vi.fn() }));
const baseline = useGameStore.getState();
const prose = '<maintext>场景|home-day\n对话|旁白|calm|你在房间里查看四周。</maintext><option>继续调查\n休息一会儿</option><sum>查看房间。</sum><vars>{}</vars>';
const approved = {
  approved: true, violations: [], corrections: [],
  continuityAudit: { reviewed: true as const, disclosures: [], beliefs: [], commitments: [] },
};

function acceptedContinuityReview() {
  const propositionId = 'claim:hook-validated-disclosure';
  return {
    ...approved,
    continuityEffects: {
      candidateId: candidateFingerprint(prose),
      cognitionDeltas: [{
        observerId: 'chen-huihui', propositionId, status: 'heard' as const, confidence: 1,
        summary: '陈慧慧听到玩家说明情况', provenance: 'accepted-turn' as const,
        scope: 'day' as const, acquiredCycle: 1,
      }],
      disclosures: [{
        speakerId: 'player', listenerIds: ['chen-huihui'], propositionId,
        evidenceQuote: '你在房间里查看四周。', evidenceSpans: [{ assertionIndex: 0, lineIndex: 0, quote: '你在房间里查看四周。' }],
      }],
      commitmentOperations: [],
    },
  };
}

describe('priced investigation menu acceptance', () => {
  it('awards a completed finding once and honors an exhausted same-day menu attempt', async () => {
    const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH,
      context: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [], playerPresentation: buildPlayerKnowledgeBrief({ location: 'home' }) },
      progress: { cycleCount: 1, completedIds: [], noProgressByTopic: {} } }).find(item => item.locationId === 'home');
    expect(opportunity).toBeDefined();
    const text = '衣柜里有一处不自然的空缺。';
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages =>
      messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性') ? JSON.stringify(approved)
        : JSON.stringify({ turnGoal: '查看衣柜', tone: '克制', beats: [{ id: 'b', purpose: '调查', description: text, locationId: 'home' }],
          revelations: [{ factId: 'F001', level: 'atmosphere', delivery: 'object' }], assetRequests: [],
          actionSteps: [{ id: 'q', kind: 'investigation', scope: opportunity!.scope, locationId: 'home' }],
          optionIntents: [{ id: 'rest', intent: '休息', tone: '克制', expectedPressure: 'low' }] }) }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ ...approved, assertionAudit: {
      reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: text, proposition: text, status: 'supported',
        citations: [{ sourceId: 'fact:F001:atmosphere', quote: text }], reason: 'authorized scene finding' }],
    } });
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken(`<maintext>场景|home-day\n对话|旁白|calm|${text}</maintext><option>休息\n继续查看</option><sum>检查衣柜。</sum><vars>{}</vars>`);
      await callbacks.onComplete();
    });
    const menu = { ...maintextToScene(`对话|旁白|calm|${text}`), investigateItems: [{
      desc: opportunity!.publicGoal, suspect: '无', style: '现实', time: '1分钟', stamina: 99, sanity: 99,
      opportunityId: opportunity!.id, scope: opportunity!.scope, locationId: 'home',
    }] };
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));
    const { result, rerender, unmount } = renderHook(() => useGameLoop());
    act(() => { result.current.performAction('investigate', 0); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1));
    expect(useGameStore.getState().game.gameStatus.time.getHours()).toBe(8);
    expect(useGameStore.getState().game.gameStatus.time.getMinutes()).toBe(25);
    expect(useGameStore.getState().tavern.variables.opportunityProgress?.completedIds).toContain(opportunity!.id);
    await act(async () => { useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } })); rerender(); });
    act(() => { result.current.performAction('investigate', 0); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(2));
    const progress = useGameStore.getState().tavern.variables.opportunityProgress;
    expect(progress?.completedIds.filter(id => id === opportunity!.id)).toHaveLength(1);
    expect(progress?.noProgressByTopic[opportunity!.topicKey]).toBe(1);
    unmount();
  });

  it('uses the trusted school opportunity for one travel charge, 55 minutes of work, and its reward', async () => {
    const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH,
      context: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [], playerPresentation: buildPlayerKnowledgeBrief({ location: 'home' }) },
      progress: { cycleCount: 1, completedIds: [], noProgressByTopic: {} } }).find(item => item.locationId === 'school');
    expect(opportunity).toBeDefined();
    const finding = '门卫说，今天在校门口见过文穗。';
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages =>
      messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性') ? JSON.stringify(approved)
        : JSON.stringify({ turnGoal: '向门卫核对到校情况', tone: '克制',
          beats: [{ id: 'b', purpose: '调查', description: finding, locationId: 'school', speakerIds: ['school-guard'] }],
          revelations: [{ factId: 'F002', level: 'atmosphere', delivery: 'dialogue', speakerId: 'school-guard' }], assetRequests: [],
          actionSteps: [{ id: 'school-check', kind: 'investigation', scope: opportunity!.scope, locationId: 'school' }],
          optionIntents: [{ id: 'rest', intent: '稍作休息', tone: '克制', expectedPressure: 'low' }] }) }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ ...approved, assertionAudit: {
      reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: finding, proposition: finding, status: 'supported',
        citations: [{ sourceId: 'fact:F002:atmosphere', quote: finding }], reason: 'authorized school inquiry' }],
    } });
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken(`<maintext>场景|school-day\n对话|门卫|calm|${finding}</maintext><option>继续调查\n返回</option><sum>询问门卫。</sum><vars>{}</vars>`);
      await callbacks.onComplete();
    });
    const menu = { ...maintextToScene('对话|旁白|calm|你准备出门。'), investigateItems: [{
      desc: opportunity!.publicGoal, suspect: '无', style: '现实', time: '1分钟', stamina: 99, sanity: 99,
      opportunityId: opportunity!.id, scope: opportunity!.scope, locationId: opportunity!.locationId,
    }] };
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));

    const { result, unmount } = renderHook(() => useGameLoop());
    act(() => { result.current.performAction('investigate', 0); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1));

    const state = useGameStore.getState();
    expect(state.tavern.variables).toMatchObject({
      time: '2024-09-09T09:05:00',
      location: 'school',
      mysteryKnowledge: { 'shared-school-absence': 'atmosphere' },
    });
    const resolved = vi.mocked(runStateAgent).mock.calls[0][0].resolvedAction!;
    expect(resolved.segments.map(segment => ({ kind: segment.step.kind, planned: segment.plannedMinutes })))
      .toEqual([{ kind: 'travel', planned: 10 }, { kind: 'investigation', planned: 55 }]);
    expect(resolved.completedSourceIds).toEqual(['fact:F002:atmosphere']);
    expect(state.tavern.variables.opportunityProgress?.completedIds).toContain(opportunity!.id);
    const assistant = [...state.tavern.chats[0].messages].reverse().find(message => message.role === 'assistant');
    expect(assistant?.acceptedActionOutcome).toMatchObject({
      actionId: 'school-check',
      executedMinutes: 65,
      executedWorkMinutes: 55,
      executedTravelMinutes: 10,
      endTime: '2024-09-09T09:05:00',
    });
    expect(state.api.parsedContent.actionOutcome).toEqual(assistant?.acceptedActionOutcome);
    expect(state.game.currentScene?.actionOutcome).toEqual(assistant?.acceptedActionOutcome);
    unmount();
  });

  it('restores the selected school opportunity identity after interruption and reload', async () => {
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, time: '2024-09-09T15:30:00' } },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T15:30:00') } },
    }));
    const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH,
      context: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [], playerPresentation: buildPlayerKnowledgeBrief({ location: 'home' }) },
      progress: { cycleCount: 1, completedIds: [], noProgressByTopic: {} } }).find(item => item.locationId === 'school')!;
    let plans = 0;
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages => {
      if (messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')) return JSON.stringify(approved);
      plans += 1;
      return JSON.stringify({ turnGoal: '向门卫核对到校情况', tone: '克制',
        beats: [{ id: 'b', purpose: '调查', description: '门卫说，今天在校门口见过文穗。', locationId: 'school', speakerIds: ['school-guard'] }],
        revelations: plans === 1 ? [{ factId: 'F002', level: 'atmosphere', delivery: 'dialogue', speakerId: 'school-guard' }] : [], assetRequests: [],
        ...(plans === 1 ? { actionSteps: [{ id: 'school-check', kind: 'investigation', scope: opportunity.scope, locationId: 'school' }] } : {}),
        optionIntents: [{ id: 'rest', intent: '稍作休息', tone: '克制', expectedPressure: 'low' }] });
    } }));
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ ...approved, assertionAudit: {
      reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '门卫', proposition: '门卫核对到校记录', status: 'supported',
        citations: [{ sourceId: 'fact:F002:atmosphere', quote: '门卫' }], reason: 'authorized resumed inquiry' }],
    } });
    const scenes = [
      '对话|旁白|calm|你赶到学校，并开始向门卫核对记录。\n对话|门卫|calm|我得翻一下今天的记录，你等会儿。',
      '对话|旁白|calm|警方通过电话明确告知你：文穗已经死亡。',
      '对话|门卫|calm|门卫说，今天在校门口见过文穗。',
    ];
    let sceneIndex = 0;
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken(`<maintext>场景|school-day\n${scenes[sceneIndex++]}</maintext><option>继续调查\n休息</option><sum>核对记录。</sum><vars>{}</vars>`);
      await callbacks.onComplete();
    });
    const menu = { ...maintextToScene('对话|旁白|calm|你准备出门。'), investigateItems: [{
      desc: opportunity.publicGoal, suspect: '无', style: '现实', time: '1分钟', stamina: 99, sanity: 99,
      opportunityId: opportunity.id, scope: opportunity.scope, locationId: opportunity.locationId,
    }] };
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));

    const firstHook = renderHook(() => useGameLoop());
    act(() => { firstHook.result.current.performAction('investigate', 0); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1));
    const interrupted = useGameStore.getState();
    const resumeActionId = interrupted.tavern.variables.actionContinuity?.continuation?.actionId;
    expect(interrupted.tavern.variables).toMatchObject({ time: '2024-09-09T16:00:00', location: 'school' });
    expect(interrupted.tavern.variables.actionContinuity?.selectedOpportunity?.id).toBe(opportunity.id);
    expect(interrupted.tavern.variables.mysteryKnowledge?.['shared-school-absence']).toBeUndefined();
    expect(interrupted.tavern.chats[0].messages.find(message => message.role === 'user')?.actionRequest?.selection?.opportunityId)
      .toBe(opportunity.id);
    expect(interrupted.api.parsedContent.actionOutcome).toMatchObject({
      executedMinutes: 30,
      executedWorkMinutes: 20,
      executedTravelMinutes: 10,
      remaining: { workMinutes: 35, travelMinutes: 0, totalMinutes: 35 },
    });
    expect(interrupted.api.parsedContent.options[0]).toBe('处理眼前的事情');
    expect(interrupted.api.parsedContent.optionBindings).toBeUndefined();

    const reloadedScene = rebuildSceneFromChat(interrupted.tavern.chats[0]);
    firstHook.unmount();
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: reloadedScene } }));
    const resumedHook = renderHook(() => useGameLoop());
    await act(async () => { await resumedHook.result.current.sendMessage('接听警方电话'); });
    const resumeOption = useGameStore.getState().api.parsedContent.options[0];
    const resumeBinding = useGameStore.getState().api.parsedContent.optionBindings?.[0];
    expect(resumeOption).toMatch(/继续未完成的行动.*剩余35分钟/);
    expect(resumeBinding).toMatchObject({ continuationId: resumeActionId });
    act(() => { resumedHook.result.current.selectOption(resumeOption, resumeBinding); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(3));

    const final = useGameStore.getState().tavern.variables;
    expect(final).toMatchObject({
      time: '2024-09-09T16:35:00',
      location: 'school',
      mysteryKnowledge: { 'shared-school-absence': 'atmosphere' },
    });
    expect(final.opportunityProgress?.completedIds).toContain(opportunity.id);
    resumedHook.unmount();
  });
});

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
  it('rejects a stale checklist click before any model or preparation work starts', () => {
    const menu = { ...maintextToScene('对话|旁白|calm|你看着房间。'), investigateItems: [{
      desc: '检查房间', suspect: '无', style: '现实', time: '2分钟', stamina: 99, sanity: 99,
    }] };
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));
    const { result, unmount } = renderHook(() => useGameLoop());

    act(() => { result.current.performAction('investigate', 0, 'a-stale-action-id'); });

    expect(prepareMysteryTurn).not.toHaveBeenCalled();
    expect(streamChatCompletion).not.toHaveBeenCalled();
    expect(useGameStore.getState().ui.notifications.at(-1)?.message).toContain('已更新');
    unmount();
  });

  it('rejects a continuation binding that no longer matches the saved option and action', () => {
    const optionText = '继续未完成的行动（剩余35分钟）';
    useGameStore.setState(state => ({
      api: {
        ...state.api,
        parsedContent: {
          ...state.api.parsedContent,
          options: [optionText],
          optionBindings: [{ optionIndex: 0, optionText, actionId: 'school-check', continuationId: 'school-check' }],
        },
      },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          actionContinuity: {
            cycleCount: 1,
            continuation: {
              actionId: 'school-check', cycleCount: 1, steps: [], previousResolutionId: 'resolution-1',
              stepsDigest: 'steps', resumableFromTime: '2024-09-09T16:00:00', expectedLocationId: 'school',
              activeStepId: 'school-check', completedMinutesByStep: {}, chargedStaminaByStep: {},
            },
          },
        },
      },
    }));
    const { result, unmount } = renderHook(() => useGameLoop());

    act(() => result.current.selectOption(optionText, {
      optionIndex: 0, optionText, actionId: 'forged-action', continuationId: 'school-check',
    }));

    expect(prepareMysteryTurn).not.toHaveBeenCalled();
    expect(streamChatCompletion).not.toHaveBeenCalled();
    expect(useGameStore.getState().ui.notifications.at(-1)?.message).toContain('已更新');
    unmount();
  });

  it('does not reroll through a settled local map pair into the preceding AI turn', async () => {
    const state = useGameStore.getState();
    const activeChat = state.tavern.chats[0];
    useGameStore.setState(current => ({
      tavern: {
        ...current.tavern,
        chats: [{
          ...activeChat,
          messages: [{
            id: 'map-user', role: 'user', content: '前往文穗的中学', timestamp: 1,
            variables: current.tavern.variables, localAction: 'map-travel',
          }, {
            id: 'map-assistant', role: 'assistant', content: '<maintext>对话|旁白|calm|你抵达了学校。</maintext>', timestamp: 2,
            variables: current.tavern.variables, localAction: 'map-travel',
          }],
        }],
      },
    }));
    const { result, unmount } = renderHook(() => useGameLoop());

    await act(async () => { await result.current.reroll(); });

    expect(saveChat).not.toHaveBeenCalled();
    expect(prepareMysteryTurn).not.toHaveBeenCalled();
    expect(useGameStore.getState().ui.notifications.at(-1)?.message).toMatch(/地图移动已经结算/);
    unmount();
  });

  it('resumes a reloaded map-origin continuation locally after the accepted boundary turn', async () => {
    const startVariables = {
      ...createDefaultVariables(), cycleCount: 1, location: 'home', time: '2024-09-09T15:55:00',
      stamina: 100, sanity: 70, knowledgeEvents: [],
    };
    const startStatus = {
      time: new Date(startVariables.time), stamina: 100, sanity: 70, items: [],
    };
    const partial = prepareMapTravel({
      variables: startVariables,
      gameStatus: startStatus,
      destinationLocationId: 'school',
    });
    if (partial.kind !== 'travel') throw new Error('expected partial map travel');
    const partialTransaction = buildMapTravelTransaction({
      variables: startVariables,
      gameStatus: startStatus,
      prepared: partial,
      knowledgeEvents: [],
      endings: [],
      endingsSeen: [],
      hasEndingInProgress: false,
    });
    const handleBoundaryOption = '处理眼前的事情';
    const partialParsed = {
      thinking: '', maintext: '场景|street\n对话|旁白|calm|路程尚未完成。',
      options: [handleBoundaryOption], summary: '移动暂停。', vars: {},
      investigateItems: [], actionItems: [], actionOutcome: partial.publicOutcome,
    };
    const localMessages: ChatMessage[] = [{
      id: 'map-user', role: 'user', content: '前往文穗的中学', timestamp: 1,
      variables: startVariables, localAction: 'map-travel',
    }, {
      id: 'map-assistant', role: 'assistant',
      content: `<maintext>${partialParsed.maintext}</maintext><option>${handleBoundaryOption}</option><sum>移动暂停。</sum><vars>{}</vars>`,
      timestamp: 2, variables: partialTransaction.variables, localAction: 'map-travel',
      acceptedActionOutcome: partial.publicOutcome, parsed: partialParsed,
    }];
    const partialScene = {
      id: 'partial-map',
      lines: [{ background: 'street', speaker: '旁白', emotion: 'calm' as const, text: '路程尚未完成。' }],
      actionOutcome: partial.publicOutcome,
    };
    commitGameTransaction(partialTransaction, partialScene);
    useGameStore.setState(state => ({
      tavern: {
        ...state.tavern,
        variables: partialTransaction.variables,
        chats: [{ ...state.tavern.chats[0], messages: localMessages, variables: partialTransaction.variables }],
      },
      api: { ...state.api, parsedContent: partialParsed },
      game: { ...state.game, currentScene: partialScene, sceneComplete: true },
    }));
    vi.mocked(streamChatCompletion).mockImplementationOnce(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken('<maintext>场景|street\n对话|旁白|calm|警方通过电话明确告知你：文穗已经死亡。</maintext><option>稍作整理\n继续行动</option><sum>接到警方通知。</sum><vars>{}</vars>');
      await callbacks.onComplete();
    });
    const { result, unmount } = renderHook(() => useGameLoop());

    await act(async () => { await result.current.sendMessage(handleBoundaryOption); });
    const afterBoundary = useGameStore.getState();
    expect(afterBoundary.tavern.variables).toMatchObject({
      time: '2024-09-09T16:00:00', location: 'home', stamina: 98, deathNews: 'delivered',
    });
    const resumeOption = afterBoundary.api.parsedContent.options[0];
    const resumeBinding = afterBoundary.api.parsedContent.optionBindings?.[0];
    expect(resumeOption).toMatch(/继续未完成的行动.*剩余5分钟/);
    expect(resumeBinding).toMatchObject({ continuationId: partial.actionId });

    const acceptedMessages = afterBoundary.tavern.chats[0].messages;
    const reloadedParsed = resolveSavedParsedContent({ gameState: {} } as never, acceptedMessages);
    const reloadedScene = rebuildSceneFromChat({ ...afterBoundary.tavern.chats[0], messages: acceptedMessages });
    useGameStore.setState(state => ({
      api: { ...state.api, parsedContent: reloadedParsed },
      game: { ...state.game, currentScene: reloadedScene, sceneComplete: true },
    }));
    const callsBeforeResume = vi.mocked(streamChatCompletion).mock.calls.length;
    vi.mocked(saveChat).mockRejectedValueOnce(new Error('地图存档失败')).mockResolvedValue(undefined);
    let firstDispatch: boolean | undefined;
    let repeatedDispatch: boolean | undefined;
    act(() => {
      firstDispatch = result.current.selectOption(resumeOption, resumeBinding);
      repeatedDispatch = result.current.selectOption(resumeOption, resumeBinding);
    });
    expect(firstDispatch).toBe(true);
    expect(repeatedDispatch).toBe(false);
    await waitFor(() => expect(useGameStore.getState().ui.notifications.at(-1)?.message).toContain('地图存档失败'));
    expect(useGameStore.getState().game.isWaitingForAI).toBe(false);
    expect(useGameStore.getState().tavern.variables.location).toBe('home');
    act(() => { expect(result.current.selectOption(resumeOption, resumeBinding)).toBe(true); });
    await waitFor(() => expect(useGameStore.getState().tavern.variables.location).toBe('school'));

    const arrived = useGameStore.getState();
    expect(arrived.tavern.variables).toMatchObject({
      time: '2024-09-09T16:05:00', location: 'school', stamina: 96, deathNews: 'delivered',
    });
    expect(arrived.tavern.variables.knowledgeEvents).toContain('visit:school');
    expect(vi.mocked(streamChatCompletion)).toHaveBeenCalledTimes(callsBeforeResume);
    expect(rebuildSceneFromChat(arrived.tavern.chats[0])?.observe)
      .toBe(arrived.tavern.chats[0].messages.at(-1)?.parsed?.observe);
    unmount();
  });

  it.each(['resolve', 'reject'] as const)(
    'does not let a stale local-map save %s overwrite a new chat request',
    async settlement => {
      const startVariables = {
        ...createDefaultVariables(), cycleCount: 1, location: 'home', time: '2024-09-09T15:55:00',
        stamina: 100, sanity: 70, knowledgeEvents: [],
      };
      const partial = prepareMapTravel({
        variables: startVariables,
        gameStatus: { time: new Date(startVariables.time), stamina: 100, sanity: 70, items: [] },
        destinationLocationId: 'school',
      });
      if (partial.kind !== 'travel') throw new Error('expected partial map travel');
      const partialTransaction = buildMapTravelTransaction({
        variables: startVariables,
        gameStatus: { time: new Date(startVariables.time), stamina: 100, sanity: 70, items: [] },
        prepared: partial,
        knowledgeEvents: [], endings: [], endingsSeen: [], hasEndingInProgress: false,
      });
      const continuationVariables = { ...partialTransaction.variables, deathNews: 'delivered' as const };
      const optionText = '继续未完成的行动（剩余5分钟）';
      const binding = {
        optionIndex: 0, optionText, actionId: partial.actionId, continuationId: partial.actionId,
      };
      useGameStore.setState(state => ({
        tavern: {
          ...state.tavern,
          variables: continuationVariables,
          chats: [{ ...state.tavern.chats[0], variables: continuationVariables }],
        },
        api: {
          ...state.api,
          parsedContent: { ...state.api.parsedContent, options: [optionText], optionBindings: [binding] },
        },
        game: {
          ...state.game,
          gameStatus: partialTransaction.gameStatus,
          sceneComplete: true,
        },
      }));

      let settleOldSave!: () => void;
      let rejectOldSave!: (error: Error) => void;
      const oldSave = new Promise<void>((resolve, reject) => {
        settleOldSave = resolve;
        rejectOldSave = reject;
      });
      vi.mocked(saveChat).mockImplementationOnce(() => oldSave).mockResolvedValue(undefined);
      let releaseNewRequest!: () => void;
      const newRequestGate = new Promise<void>(resolve => { releaseNewRequest = resolve; });
      vi.mocked(streamChatCompletion).mockImplementationOnce(async (_api, _messages, _preset, callbacks) => {
        await newRequestGate;
        callbacks.onToken(prose);
        await callbacks.onComplete();
      });
      const { result, unmount } = renderHook(() => useGameLoop());

      act(() => { expect(result.current.selectOption(optionText, binding)).toBe(true); });
      expect(saveChat).toHaveBeenCalledTimes(1);

      const newVariables = {
        ...createDefaultVariables(), cycleCount: 2, location: 'home', time: '2024-09-10T08:00:00',
        stamina: 88, sanity: 66,
      };
      const newChat: ChatSession = {
        ...useGameStore.getState().tavern.chats[0],
        id: 'new-chat', name: 'new chat', messages: [], variables: newVariables,
      };
      useGameStore.setState(state => ({
        tavern: {
          ...state.tavern,
          activeChatId: newChat.id,
          chats: [...state.tavern.chats, newChat],
          variables: newVariables,
        },
        api: {
          ...state.api,
          isStreaming: false,
          parsedContent: { ...state.api.parsedContent, maintext: '', options: ['新会话选项'], optionBindings: undefined },
        },
        game: {
          ...state.game,
          isWaitingForAI: false,
          gameStatus: { time: new Date(newVariables.time), stamina: 88, sanity: 66, items: [] },
        },
      }));
      let newRequest!: Promise<void>;
      act(() => { newRequest = result.current.sendMessage('新会话请求'); });
      await waitFor(() => expect(useGameStore.getState().api.isStreaming).toBe(true));
      const newAbortController = useGameStore.getState().api.abortController;
      const parsedBeforeOldSettlement = useGameStore.getState().api.parsedContent;
      const notificationCount = useGameStore.getState().ui.notifications.length;

      if (settlement === 'resolve') settleOldSave();
      else rejectOldSave(new Error('旧地图保存失败'));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      const afterOldSettlement = useGameStore.getState();
      expect(afterOldSettlement.tavern.activeChatId).toBe(newChat.id);
      expect(afterOldSettlement.game.isWaitingForAI).toBe(true);
      expect(afterOldSettlement.api.isStreaming).toBe(true);
      expect(afterOldSettlement.api.abortController).toBe(newAbortController);
      expect(afterOldSettlement.api.parsedContent).toBe(parsedBeforeOldSettlement);
      expect(afterOldSettlement.ui.notifications).toHaveLength(notificationCount);

      releaseNewRequest();
      await act(async () => { await newRequest; });
      unmount();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'releases a stale local-map operation after its save %s so the original chat can resume again',
    async settlement => {
      const startVariables = {
        ...createDefaultVariables(), cycleCount: 1, location: 'home', time: '2024-09-09T15:55:00',
        stamina: 100, sanity: 70, knowledgeEvents: [],
      };
      const partial = prepareMapTravel({
        variables: startVariables,
        gameStatus: { time: new Date(startVariables.time), stamina: 100, sanity: 70, items: [] },
        destinationLocationId: 'school',
      });
      if (partial.kind !== 'travel') throw new Error('expected partial map travel');
      const partialTransaction = buildMapTravelTransaction({
        variables: startVariables,
        gameStatus: { time: new Date(startVariables.time), stamina: 100, sanity: 70, items: [] },
        prepared: partial,
        knowledgeEvents: [], endings: [], endingsSeen: [], hasEndingInProgress: false,
      });
      const originalChat = useGameStore.getState().tavern.chats[0];
      const continuationVariables = { ...partialTransaction.variables, deathNews: 'delivered' as const };
      const optionText = '继续未完成的行动（剩余5分钟）';
      const binding = {
        optionIndex: 0, optionText, actionId: partial.actionId, continuationId: partial.actionId,
      };
      const parsedContent = {
        ...useGameStore.getState().api.parsedContent,
        options: [optionText], optionBindings: [binding],
      };
      useGameStore.setState(state => ({
        tavern: {
          ...state.tavern,
          variables: continuationVariables,
          chats: [{ ...originalChat, variables: continuationVariables }],
        },
        api: { ...state.api, parsedContent },
        game: { ...state.game, gameStatus: partialTransaction.gameStatus, sceneComplete: true },
      }));

      let settleOldSave!: () => void;
      let rejectOldSave!: (error: Error) => void;
      const oldSave = new Promise<void>((resolve, reject) => {
        settleOldSave = resolve;
        rejectOldSave = reject;
      });
      vi.mocked(saveChat).mockImplementationOnce(() => oldSave).mockResolvedValue(undefined);
      const { result, unmount } = renderHook(() => useGameLoop());

      act(() => { expect(result.current.selectOption(optionText, binding)).toBe(true); });
      expect(saveChat).toHaveBeenCalledTimes(1);

      const awayVariables = { ...createDefaultVariables(), cycleCount: 2, time: '2024-09-10T08:00:00' };
      const awayChat: ChatSession = {
        ...originalChat, id: 'away-chat', name: 'away chat', messages: [], variables: awayVariables,
      };
      useGameStore.setState(state => ({
        tavern: {
          ...state.tavern,
          activeChatId: awayChat.id,
          chats: [...state.tavern.chats, awayChat],
          variables: awayVariables,
        },
        game: { ...state.game, isWaitingForAI: false },
      }));
      if (settlement === 'resolve') settleOldSave();
      else rejectOldSave(new Error('旧地图保存失败'));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      useGameStore.setState(state => ({
        tavern: {
          ...state.tavern,
          activeChatId: originalChat.id,
          variables: continuationVariables,
          chats: state.tavern.chats.map(chat => chat.id === originalChat.id
            ? { ...chat, variables: continuationVariables }
            : chat),
        },
        api: { ...state.api, abortController: null, parsedContent },
        game: {
          ...state.game,
          isWaitingForAI: false,
          gameStatus: partialTransaction.gameStatus,
          sceneComplete: true,
        },
      }));

      act(() => { expect(result.current.selectOption(optionText, binding)).toBe(true); });
      await waitFor(() => expect(useGameStore.getState().tavern.variables.location).toBe('school'));
      expect(saveChat).toHaveBeenCalledTimes(2);
      unmount();
    },
  );

  it('reports a missing API as a non-dispatch so the choice can be used after configuration', () => {
    const optionText = '继续调查';
    useGameStore.setState(state => ({
      tavern: {
        ...state.tavern,
        settings: state.tavern.settings
          ? { ...state.tavern.settings, api: { ...state.tavern.settings.api, apiKey: '' } }
          : state.tavern.settings,
      },
      api: { ...state.api, parsedContent: { ...state.api.parsedContent, options: [optionText] } },
    }));
    const { result, unmount } = renderHook(() => useGameLoop());

    expect(result.current.selectOption(optionText)).toBe(false);
    expect(useGameStore.getState().ui.showApiGuide).toBe(true);
    expect(streamChatCompletion).not.toHaveBeenCalled();
    unmount();
  });

  it('executes a reconstructed legacy menu row with the normal authoritative quote', async () => {
    const menu = { ...maintextToScene('对话|旁白|calm|你看着房间。'), investigateItems: [{
      desc: '检查房间', suspect: '无', style: '现实', time: '2分钟', stamina: 99, sanity: 99,
    }] };
    const actionId = `legacy:${menu.id}:investigate:0`;
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({ ...options, complete: async messages =>
      messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
        ? JSON.stringify(approved)
        : JSON.stringify({ turnGoal: '检查房间', tone: '克制',
          beats: [{ id: 'b', purpose: '调查', description: '检查房间', locationId: 'home' }],
          revelations: [], assetRequests: [],
          actionSteps: [{ id: actionId, kind: 'investigation', scope: 'normal', locationId: 'home' }],
          optionIntents: [{ id: 'o', intent: '继续调查', tone: '克制', expectedPressure: 'low' }] }) }));
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: menu } }));
    const { result, unmount } = renderHook(() => useGameLoop());

    act(() => { result.current.performAction('investigate', 0, actionId); });
    await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1));
    expect(useGameStore.getState().tavern.variables).toMatchObject({
      time: '2024-09-09T08:55:00', stamina: 93, sanity: 70,
    });
    unmount();
  });

  it('does not persist NPC name knowledge from player input when accepted prose contains no introduction', async () => {
    useGameStore.setState(state => ({
      tavern: {
        ...state.tavern,
        settings: {
          ...state.tavern.settings,
          userName: '小林', playerIdentityConfirmed: true, playerGender: 'male',
        },
        variables: { ...state.tavern.variables, location: 'school' },
      },
      game: {
        ...state.game,
        currentState: { ...state.game.currentState, background: 'school-day' },
      },
    }));
    vi.mocked(prepareMysteryTurn).mockImplementation(options => prepareActual({
      ...options,
      complete: async messages => messages[0].content.includes('事实复核')
        || messages[0].content.includes('节奏与玩家能动性')
        ? JSON.stringify(approved)
        : JSON.stringify({
            turnGoal: '在校门口停留', tone: '克制', timeCostMinutes: 1,
            beats: [{ id: 'b', purpose: '回应', description: '门卫回应玩家。',
              locationId: 'school', speakerIds: ['school-guard'] }],
            revelations: [], assetRequests: [], optionIntents: [
              { id: 'o1', intent: '继续调查', tone: '克制', expectedPressure: 'low' },
              { id: 'o2', intent: '离开校门', tone: '克制', expectedPressure: 'low' },
            ],
          }),
    }));
    vi.mocked(streamChatCompletion).mockImplementation(async (_api, _messages, _preset, callbacks) => {
      callbacks.onToken('<maintext>场景|school-day\n对话|门卫|calm|请问有什么事？</maintext>'
        + '<option>继续调查\n离开校门</option><sum>在校门口停留。</sum><vars>{}</vars>');
      await callbacks.onComplete();
    });

    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('我叫小林。'); });

    const variables = useGameStore.getState().tavern.variables;
    const memory = normalizeWorldMemory(variables);
    expect(variables.playerNameKnownByNpcIds ?? []).not.toContain('school-guard');
    expect(memory.cognition.some(record => record.observerId === 'school-guard'
      && (record.propositionId === 'identity:player-name'
        || record.propositionId === 'expression:player-name'))).toBe(false);
    unmount();
  });

  it('commits only the validator-produced continuity effects with the accepted candidate', async () => {
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue(acceptedContinuityReview());
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('查看房间'); });

    const memory = useGameStore.getState().tavern.variables.worldMemory;
    expect(memory?.cognition).toContainEqual(expect.objectContaining({
      observerId: 'chen-huihui', propositionId: 'claim:hook-validated-disclosure', status: 'heard',
    }));
    expect(memory?.disclosures).toContainEqual(expect.objectContaining({
      speakerId: 'player', listenerIds: ['chen-huihui'], propositionId: 'claim:hook-validated-disclosure',
    }));
    unmount();
  });

  it('keeps continuity effects atomic across a failed persistence and retry', async () => {
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue(acceptedContinuityReview());
    let rejectAcceptedTurn = true;
    vi.mocked(saveChat).mockImplementation(async chat => {
      if (rejectAcceptedTurn && chat.messages.at(-1)?.role === 'assistant') {
        rejectAcceptedTurn = false;
        throw new Error('disk full');
      }
    });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('查看房间'); });

    expect(useGameStore.getState().game.history).toHaveLength(0);
    expect(useGameStore.getState().tavern.variables.worldMemory?.disclosures ?? []).toHaveLength(0);
    await act(async () => { await result.current.retryTurn(); });

    const state = useGameStore.getState();
    const memory = normalizeWorldMemory(state.tavern.variables);
    expect(state.game.history).toHaveLength(1);
    expect(memory.disclosures.filter(
      item => item.propositionId === 'claim:hook-validated-disclosure',
    )).toHaveLength(1);
    unmount();
  });

  it.each([['休息一会儿', 112, '09:00:00'], ['等待一会儿', 100, '16:00:00']] as const)('settles %s through the actual prepared hook', async (input, stamina, endTime) => {
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage(input); });
    expect(useGameStore.getState().game.history).toHaveLength(1);
    expect(useGameStore.getState().tavern.variables).toMatchObject({ time: `2024-09-09T${endTime}`, stamina, sanity: 70 });
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
