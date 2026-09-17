// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from './useGameLoop';
import { useGameStore } from '../stores/gameStore';
import { prepareMysteryTurn as prepareActual } from '../agents/mystery/orchestrator';
import type { PreparedMysteryTurn } from '../agents/mystery/orchestrator';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { prepareMysteryTurn, invalidatePreplans, startPreplan, consumePreplan, reviewNarrativeAgainstWriterPacket,
  reviewNarrativeStyle, repairNarrativeAgainstWriterPacket } from '../agents/mystery';
import { reviewNarrativeStyle as actualStyleReview } from '../agents/mystery/style-review';
import { resolveAction } from '../engine/action-resolution';
import { candidateFingerprint } from '../memory/character-continuity';
import { applyNarrativePatch, buildNarrativePatchTask, InvalidNarrativePatchError } from '../agents/mystery/narrative-patch';
import { generateSceneChecklist } from '../agents/mystery/scene-list';
import { isBoundedRetrievalEligible } from '../agents/mystery/bounded-retrieval';
import { streamChatCompletion } from '../sillytavern/api-router';
import { runStateAgent } from '../agents/state/state-agent';
import { saveChat } from '../sillytavern/database';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatSession } from '../sillytavern/types';
import { clearTurnMetrics, getTurnMetrics } from '../agents/mystery/turn-metrics';

vi.mock('../agents/mystery', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery')>(), prepareMysteryTurn: vi.fn(), startPreplan: vi.fn(), consumePreplan: vi.fn(),
  reviewNarrativeAgainstWriterPacket: vi.fn().mockResolvedValue({ approved: true, violations: [], corrections: [] }),
  reviewNarrativeStyle: vi.fn().mockResolvedValue({ approved: true, violations: [], corrections: [] }),
  repairNarrativeAgainstWriterPacket: vi.fn(),
}));
vi.mock('../agents/mystery/bounded-retrieval', async importOriginal => ({
  ...await importOriginal<typeof import('../agents/mystery/bounded-retrieval')>(), isBoundedRetrievalEligible: vi.fn(),
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
  vi.mocked(reviewNarrativeStyle).mockResolvedValue({ approved: true, violations: [], corrections: [] });
  vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ approved: true, violations: [], corrections: [] });
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected live HTTP in lifecycle fixture'); });
  invalidatePreplans();
  clearTurnMetrics();
  vi.mocked(consumePreplan).mockResolvedValue(null);
  vi.mocked(isBoundedRetrievalEligible).mockReturnValue(false);
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
  it.each(['standard', 'strict'] as const)('%s applies its optional-call policy while preserving the same fixed settlement and persistence', async mode => {
    useGameStore.setState(state => ({ game: { ...state.game, gameStatus: { ...state.game.gameStatus, stamina: 60 } },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, stamina: 60 }, settings: { ...state.tavern.settings!, agentNarrativeMode: mode },
      chats: state.tavern.chats.map(chat => ({ ...chat, variables: { ...chat.variables, stamina: 60 }, messages: [{ id: 'old', role: 'assistant',
        content: '<maintext>对话|旁白|calm|冷白色的灯光在收银台上轻轻闪了一下，照得她的脸色更加苍白。</maintext>', timestamp: 1, variables: {} }] })) } }));
    preparedFixture.reviewPolicy.state = false;
    preparedFixture.reviewPolicy.narrative = true;
    preparedFixture.writerPacket.resolvedAction = resolveAction({ id: 'fixed-rest', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 60, sanity: 70, steps: [{ id: 'rest', kind: 'rest', scope: 'short', locationId: 'home', requestedMinutes: 10, completionSourceIds: [] }] });
    const semanticStyle = vi.fn(async () => '{"approved":true,"violations":[],"corrections":[]}');
    vi.mocked(reviewNarrativeStyle).mockImplementation(options => actualStyleReview({ ...options, complete: semanticStyle }));
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockResolvedValue({ approved: true, violations: [], corrections: [],
      assertionAudit: { reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '你在房间里停下脚步。', proposition: '休息', status: 'ordinary-present', citations: [], reason: '当下动作' }] },
      continuityEffects: { candidateId: candidateFingerprint(prose), cognitionDeltas: [], disclosures: [], commitmentOperations: [] } });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('休息十分钟'); });
    expect(runStateAgent).toHaveBeenCalledTimes(mode === 'strict' ? 1 : 0);
    expect(semanticStyle).toHaveBeenCalledTimes(mode === 'strict' ? 1 : 0);
    expect(useGameStore.getState().game.history, JSON.stringify(useGameStore.getState().api.turnRecovery)).toHaveLength(1);
    expect(useGameStore.getState().game.gameStatus.time.getMinutes()).toBe(10);
    expect(useGameStore.getState().game.gameStatus.stamina).toBe(preparedFixture.writerPacket.resolvedAction.resources.after.stamina);
    // Background observation may update this same message, but never append/settle it twice.
    expect(new Set(vi.mocked(saveChat).mock.calls.flatMap(([chat]) => chat.messages
      .filter(message => message.role === 'assistant' && message.id !== 'old').map(message => message.id))).size).toBe(1);
    unmount();
  });
  it('runs fresh fact review after a model repair even when the old policy disabled fact review', async () => {
    preparedFixture.reviewPolicy.narrative = false;
    preparedFixture.reviewPolicy.style = false;
    vi.mocked(reviewNarrativeStyle).mockResolvedValueOnce({ approved: false, violations: [{ code: 'repeated-prose', message: '重复' }], corrections: ['改写'] })
      .mockResolvedValue({ approved: true, violations: [], corrections: [] });
    vi.mocked(repairNarrativeAgainstWriterPacket).mockResolvedValue(prose.replace('停下脚步', '扶着桌沿坐下来'));
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    expect(repairNarrativeAgainstWriterPacket).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(reviewNarrativeAgainstWriterPacket).mock.calls.filter(([options]) => options.continuityMode !== 'auxiliary');
    expect(calls).toHaveLength(1);
    expect(calls[0][0].narrative).toContain('扶着桌沿坐下来');
    expect(useGameStore.getState().game.history).toHaveLength(1);
    unmount();
  });
  it('consumes an invalid local patch attempt and retries the unchanged draft with full repair', async () => {
    preparedFixture.reviewPolicy.narrative = false;
    const rejection = { approved: false, violations: [{ code: 'repeated-prose' as const, message: '重复' }], corrections: ['改写'] };
    vi.mocked(reviewNarrativeStyle).mockResolvedValueOnce(rejection).mockResolvedValue({ approved: true, violations: [], corrections: [] });
    vi.mocked(repairNarrativeAgainstWriterPacket).mockRejectedValueOnce(new InvalidNarrativePatchError('unknown target'))
      .mockResolvedValueOnce(prose.replace('停下脚步', '扶着桌沿坐下来'));
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    const calls = vi.mocked(repairNarrativeAgainstWriterPacket).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].allowLocalizedRepair).toBe(true);
    expect(calls[1][0].allowLocalizedRepair).toBe(false);
    expect(calls[1][0].rejectedNarrative).toBe(calls[0][0].rejectedNarrative);
    expect(vi.mocked(reviewNarrativeAgainstWriterPacket).mock.calls.filter(([options]) => options.continuityMode !== 'auxiliary')).toHaveLength(1);
    expect(useGameStore.getState().game.history).toHaveLength(1);
    unmount();
  });
  it('rejects unauthorized content introduced by an actual local patch before any State or commit', async () => {
    preparedFixture.reviewPolicy.narrative = false;
    const rejection = { approved: false, violations: [{ code: 'repeated-prose' as const, message: '重复', candidateQuote: '你在房间里停下脚步。' }], corrections: ['改写这句'] };
    vi.mocked(reviewNarrativeStyle).mockResolvedValueOnce(rejection).mockResolvedValue({ approved: true, violations: [], corrections: [] });
    const forbidden = '监控证实她昨晚到过学校。';
    vi.mocked(repairNarrativeAgainstWriterPacket).mockImplementation(async options => {
      if (!options.allowLocalizedRepair) return options.rejectedNarrative;
      const task = buildNarrativePatchTask(options.rejectedNarrative, options.review)!;
      expect(task).toBeDefined();
      return applyNarrativePatch(task, JSON.stringify({ edits: task.targets.map(target => ({ targetId: target.id,
        replacement: target.required ? forbidden : target.originalText })) }));
    });
    vi.mocked(reviewNarrativeAgainstWriterPacket).mockImplementation(async options => {
      expect(options.narrative).toContain(forbidden);
      return { approved: false, violations: [{ code: 'unsupported-assertion', message: '没有获准的监控来源', candidateQuote: forbidden }], corrections: ['撤销监控断言'] };
    });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    expect(reviewNarrativeAgainstWriterPacket).toHaveBeenCalledTimes(3);
    expect(runStateAgent).not.toHaveBeenCalled();
    expect(useGameStore.getState().game.history).toHaveLength(0);
    expect(vi.mocked(saveChat).mock.calls.flatMap(([chat]) => chat.messages).some(message => message.role === 'assistant')).toBe(false);
    expect(useGameStore.getState().api.turnRecovery.repairable).toBe(true);
    unmount();
  });
  it('does not adopt a speculative plan that skipped a complex input\'s retrieval', async () => {
    vi.mocked(isBoundedRetrievalEligible).mockImplementation(input => input.includes('核对'));
    vi.mocked(consumePreplan).mockResolvedValue(preparedFixture);
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('核对之前两次的证词'); });
    expect(consumePreplan).not.toHaveBeenCalled();
    expect(prepareMysteryTurn).toHaveBeenCalledTimes(1);
    expect(getTurnMetrics().at(-1)?.outcome).toBe('success');
    unmount();
  });

  it('adopts ordinary preplanning without calling or charging preparation again', async () => {
    vi.mocked(consumePreplan).mockResolvedValue(preparedFixture);
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    expect(consumePreplan).toHaveBeenCalledTimes(1);
    expect(prepareMysteryTurn).not.toHaveBeenCalled();
    expect(getTurnMetrics().at(-1)?.outcome).toBe('success');
    expect(getTurnMetrics().at(-1)?.accounting?.preparationReused).toBe(true);
    unmount();
  });

  it('captures one foreground observer and separate originating scopes for optional work', async () => {
    vi.mocked(runStateAgent).mockResolvedValue({ vars: {}, summary: null, rejected: [], clamped: [] });
    const { result, unmount } = renderHook(() => useGameLoop());
    await act(async () => { await result.current.sendMessage('观察房间'); });
    const foreground = vi.mocked(prepareMysteryTurn).mock.calls[0][0].api.telemetry;
    expect(foreground?.onRequest).toBeTypeOf('function');
    expect(vi.mocked(streamChatCompletion).mock.calls[0][0].telemetry).toBe(foreground);
    expect(vi.mocked(runStateAgent).mock.calls[0][0].api.telemetry).toBe(foreground);
    const checklist = vi.mocked(generateSceneChecklist).mock.calls[0][1];
    expect(checklist.api.telemetry?.onRequest).toBeTypeOf('function');
    expect(checklist.api.telemetry).not.toBe(foreground);
    expect(checklist.abortSignal).toBe(useGameStore.getState().api.abortController?.signal);
    expect(vi.mocked(startPreplan).mock.calls[0][0].options.api.telemetry?.onRequest).toBeTypeOf('function');
    expect(vi.mocked(startPreplan).mock.calls[0][0].options.api.telemetry).not.toBe(foreground);
    expect(useGameStore.getState().tavern.settings?.api).not.toHaveProperty('telemetry');
    const initial = getTurnMetrics().at(-1)!;
    const oldObserver = checklist.api.telemetry!;
    await act(async () => { await result.current.sendMessage('继续观察'); });
    oldObserver.onRequest({ durationMs: 15, status: 200, outcome: 'success', kind: 'request',
      usage: { inputTokens: 23, outputTokens: 7, cachedInputTokens: 0 }, cost: null });
    const [first, second] = getTurnMetrics();
    expect(first.accounting?.purposes.checklist.requests).toBe(1);
    expect(second.accounting?.purposes.checklist.requests).toBe(0);
    expect(first.playableMs).toBe(initial.playableMs);
    expect(first.totalMs).toBe(initial.totalMs);
    unmount();
  });

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
