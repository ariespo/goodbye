// @vitest-environment jsdom
// Explicit opt-in focused probes. These controlled scenarios are not full-day evidence.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { transferableAbortController } from 'node:util';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { useGameLoop } from '../src/hooks/useGameLoop';
import { useGameStore } from '../src/stores/gameStore';
import { startNewGame } from '../src/utils/gameSession';
import { startNextCycle, settleCycleVariables } from '../src/utils/cycleLoop';
import { variablesToEndingContext } from '../src/sillytavern/vars-merger';
import { createDefaultPreset, DEFAULT_FORMAT_PROMPT, type AppSettings, type ChatPreset } from '../src/sillytavern/types';
import { invalidatePreplans } from '../src/agents/mystery';
import { buildInvestigationOpportunities } from '../src/engine/investigation-opportunities';
import { MYSTERY_TRUTH_GRAPH } from '../src/agents/mystery/truth-graph';
import { buildPlayerKnowledgeBrief } from '../src/data/playerKnowledge';
import { maintextToScene } from '../src/engine/scene-parser';
import { lockConclusionRoute } from '../src/engine/conclusion-system';
import { validatedOptionBinding } from '../src/utils/actionPresentation';
import { normalizeWorldMemory } from '../src/memory/world-memory';
import { getLocationById } from '../src/data/locations';
import { assessReachableNpcEvidence, assessSourceGroundingEvidence, parseDayMode,
  resolveCommittedActionIdentity, resolveCurrentOptionChoice, serializeScrubbed,
  snapshotPersistedEvidence } from './live-day-evaluation-harness';

const capture = vi.hoisted(() => ({ transactions: [] as unknown[], reviews: [] as unknown[],
  resolutionTraces: [] as Array<{ inputId: string; outputResolutionId: string; resumed: boolean }> }));

vi.mock('../src/engine/action-resolution', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/engine/action-resolution')>();
  return { ...actual, resolveAction: (input: Parameters<typeof actual.resolveAction>[0]) => {
    const output = actual.resolveAction(input);
    capture.resolutionTraces.push({ inputId: input.id, outputResolutionId: output.id,
      resumed: input.continuation !== undefined });
    return output;
  } };
});

vi.mock('../src/engine/game-transaction', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/engine/game-transaction')>();
  return { ...actual, settleGameTransaction: (input: Parameters<typeof actual.settleGameTransaction>[0]) => {
    const settled = actual.settleGameTransaction(input);
    const resolverTrace = [...capture.resolutionTraces].reverse()
      .find(trace => trace.outputResolutionId === input.resolvedAction.id) ?? null;
    capture.transactions.push(structuredClone({
      resolvedAction: input.resolvedAction, pendingActionAuthorization: input.pendingActionAuthorization,
      selectedOpportunity: input.selectedOpportunity, opportunityProgress: input.opportunityProgress,
      settledVariables: settled.variables, resolverTrace,
    }));
    return settled;
  } };
});

vi.mock('../src/agents/mystery', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/agents/mystery')>();
  return { ...actual, reviewNarrativeAgainstWriterPacket: async (
    input: Parameters<typeof actual.reviewNarrativeAgainstWriterPacket>[0],
  ) => {
    const review = await actual.reviewNarrativeAgainstWriterPacket(input);
    capture.reviews.push(structuredClone(review));
    return review;
  } };
});

vi.mock('../src/sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../src/sillytavern/database')>(),
  saveChat: vi.fn().mockResolvedValue(undefined), getChats: vi.fn().mockResolvedValue([]),
}));

const enabled = process.env.LIVE_ACTION_AUTHORITY === '1';
const nativeFetch = globalThis.fetch;
const baseline = useGameStore.getState();
const repetitions = Number(process.env.ACTION_AUTHORITY_REPETITIONS ?? 3);
if (!Number.isSafeInteger(repetitions) || repetitions < 3 || repetitions > 10) {
  throw new Error('ACTION_AUTHORITY_REPETITIONS must be an integer from 3 through 10');
}
const scenarioNames = ['early-gate', 'legal-fact', 'interruption-resume', 'reachable-npc',
  'opening-message-positive', 'opening-van-negative', 'contact-unanswered-positive', 'contact-absence-negative'] as const;
type ScenarioName = typeof scenarioNames[number];
const requestedScenarios = (process.env.ACTION_AUTHORITY_SCENARIOS ?? scenarioNames.join(','))
  .split(',').filter(Boolean) as ScenarioName[];
if (requestedScenarios.some(name => !scenarioNames.includes(name))) {
  throw new Error(`ACTION_AUTHORITY_SCENARIOS must use ${scenarioNames.join(',')}`);
}
const requestedModes = (process.env.ACTION_AUTHORITY_MODES ?? 'standard,legacy').split(',').filter(Boolean);
const modes = requestedModes.map(value => parseDayMode(value));
const runTag = (process.env.ACTION_AUTHORITY_RUN_TAG ?? 'focused').replace(/[^a-zA-Z0-9_-]/gu, '') || 'focused';
const artifactRoot = '.codex-test-tmp/action-authority';
const results: Record<string, unknown>[] = [];
let artifactPath = '';

function snapshot() {
  const state = useGameStore.getState();
  return {
    cycleCount: state.tavern.variables.cycleCount, time: state.tavern.variables.time,
    location: state.tavern.variables.location, lockedRoute: state.tavern.variables.lockedRoute,
    mysteryKnowledge: structuredClone(state.tavern.variables.mysteryKnowledge ?? {}),
    actionContinuity: structuredClone(state.tavern.variables.actionContinuity ?? null),
    opportunityProgress: structuredClone(state.tavern.variables.opportunityProgress ?? null),
    worldMemory: snapshotPersistedEvidence(state.tavern.variables).characterContinuity,
    historyLength: state.game.history.length, pendingEndingId: state.game.endingPanel.pendingEndingId,
    turnRecovery: structuredClone(state.api.turnRecovery), options: [...state.api.parsedContent.options],
    optionBindings: structuredClone(state.api.parsedContent.optionBindings ?? []),
  };
}

async function settleOpening() {
  const scene = useGameStore.getState().game.currentScene;
  if (!scene?.lines.length) return;
  const state = useGameStore.getState();
  state.actions.setCurrentLineIndex(scene.lines.length - 1);
  state.actions.setIsTyping(false);
  state.actions.setSceneComplete(true);
}

async function resetControlledState(input: {
  mode: ReturnType<typeof parseDayMode>; key: string; baseUrl: string; model: string;
  cycleCount: number; time?: string; location?: string; variables?: Record<string, unknown>;
}) {
  invalidatePreplans();
  const preset = { ...createDefaultPreset(), id: 'action-authority', createdAt: 0, updatedAt: 0 } as ChatPreset;
  const settings = { api: { baseUrl: input.baseUrl, apiKey: input.key, model: input.model }, activePresetId: preset.id,
    activeLorebookIds: [], userName: '李明', characterName: '文穗', playerGender: 'male', playerIdentityConfirmed: true,
    agentNarrativeMode: input.mode.settingsValue, formatPromptTemplate: DEFAULT_FORMAT_PROMPT } as unknown as AppSettings;
  useGameStore.setState({ ...baseline, tavern: { ...baseline.tavern, settings, presets: [preset] } }, true);
  await startNewGame(`authority-${runTag}`);
  await settleOpening();
  const state = useGameStore.getState();
  const storyTime = input.time ?? '2024-09-09T08:00:00';
  const variables = { ...state.tavern.variables, cycleCount: input.cycleCount, time: storyTime,
    location: input.location ?? 'home', ...input.variables };
  useGameStore.setState(current => ({
    tavern: { ...current.tavern, variables,
      chats: current.tavern.chats.map(chat => chat.id === current.tavern.activeChatId ? { ...chat, variables } : chat) },
    api: { ...current.api, abortController: null },
    game: { ...current.game, history: [], currentScene: null,
      currentState: { ...current.game.currentState,
        background: getLocationById(String(variables.location))?.background ?? 'home-day' },
      gameStatus: { ...current.game.gameStatus, time: new Date(storyTime), stamina: Number(variables.stamina ?? 100),
        sanity: Number(variables.sanity ?? 70) },
      endingPanel: { ...current.game.endingPanel, visible: false, pendingEndingId: null },
      endingCheckContext: variablesToEndingContext(variables) as typeof current.game.endingCheckContext },
  }));
}

async function sendAndAwait(input: string) {
  const hook = renderHook(() => useGameLoop());
  const before = useGameStore.getState().game.history.length;
  await act(async () => { await hook.result.current.sendMessage(input); });
  await waitFor(() => {
    const state = useGameStore.getState();
    if (state.api.isStreaming) throw new Error('turn is still streaming');
    if (state.game.history.length === before && state.api.turnRecovery.phase === 'idle') throw new Error('turn is not terminal');
  }, { timeout: 185_000, interval: 100 });
  return hook;
}

function scenarioContext(location: string) {
  const variables = useGameStore.getState().tavern.variables;
  return { cycleCount: variables.cycleCount, currentLocation: location, lockedRoute: variables.lockedRoute,
    unlockedClueIds: Object.keys(variables.mysteryKnowledge ?? {}), playerKnowledge: variables.mysteryKnowledge ?? {},
    suspicion: variables.suspicion, activeNpcIds: [], playerPresentation: buildPlayerKnowledgeBrief({ ...variables, location }) };
}

async function runEarlyGate() {
  const hook = await sendAndAwait('我认定周大爷杀了文穗，立即确认真凶并结束调查。');
  const final = useGameStore.getState();
  const accepted = final.game.history.length === 1;
  const passed = accepted && final.tavern.variables.lockedRoute == null
    && final.tavern.variables.mysteryKnowledge?.['a-murder-staged-fall'] == null
    && final.game.endingPanel.pendingEndingId == null;
  hook.unmount();
  return { passed, accepted, evidence: snapshot() };
}

async function runLegalFact() {
  const state = useGameStore.getState();
  const locked = lockConclusionRoute(state.tavern.variables, 'A');
  if (!locked.accepted) return { passed: false, reason: 'controlled route prerequisites did not lock' };
  const variables = { ...locked.value, location: 'old-man-building' };
  useGameStore.setState(current => ({ tavern: { ...current.tavern, variables,
    chats: current.tavern.chats.map(chat => ({ ...chat, variables })) },
    game: { ...current.game, endingCheckContext: variablesToEndingContext(variables) as typeof current.game.endingCheckContext } }));
  const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH,
    context: scenarioContext('old-man-building'), progress: { cycleCount: 4, completedIds: [], noProgressByTopic: {} } })
    .find(item => item.topicKey === 'old-man-building:visitor-account');
  if (!opportunity) return { passed: false, reason: 'legal middle-fact opportunity absent' };
  const menu = { ...maintextToScene('对话|旁白|calm|你准备核对暴雨当天的来访者。'), investigateItems: [{
    desc: opportunity.publicGoal, suspect: '周大爷', style: '现实', time: '55分钟', stamina: 93, sanity: 70,
    opportunityId: opportunity.id, scope: opportunity.scope, locationId: opportunity.locationId,
    kind: 'investigation', actionId: opportunity.id, originLocationId: 'old-man-building',
  }] };
  useGameStore.setState(current => ({ game: { ...current.game, currentScene: menu } }));
  const hook = renderHook(() => useGameLoop());
  const actionId = String(menu.investigateItems[0].actionId);
  act(() => { hook.result.current.performAction('investigate', 0, actionId, 'old-man-building'); });
  await waitFor(() => {
    const current = useGameStore.getState();
    if (current.api.isStreaming || (current.game.history.length === 0 && current.api.turnRecovery.phase === 'idle')) {
      throw new Error('legal-fact action is not terminal');
    }
  }, { timeout: 185_000, interval: 100 });
  const final = useGameStore.getState();
  const passed = final.game.history.length === 1
    && final.tavern.variables.mysteryKnowledge?.['a-lured-inside'] === 'confirmation'
    && final.tavern.variables.mysteryKnowledge?.['a-murder-staged-fall'] == null
    && final.tavern.variables.opportunityProgress?.completedIds.includes(opportunity.id) === true;
  hook.unmount();
  return { passed, opportunityId: opportunity.id, actionId, evidence: snapshot() };
}

async function runInterruptionResume() {
  const actionId = `controlled-home-deep-${runTag}`;
  const menu = { ...maintextToScene('对话|旁白|calm|你准备在家深入核对旧记录。'), actionItems: [{
    desc: '在家深入调查旧记录', style: '现实', time: '105分钟', stamina: 14, sanity: 0,
    kind: 'investigation' as const, scope: 'deep' as const, locationId: 'home', actionId,
  }] };
  useGameStore.setState(current => ({ game: { ...current.game, currentScene: menu } }));
  const hook = renderHook(() => useGameLoop());
  act(() => { hook.result.current.performAction('actions', 0, actionId, 'home'); });
  await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1), { timeout: 185_000, interval: 100 });
  const partial = snapshot();
  const continuationId = useGameStore.getState().tavern.variables.actionContinuity?.continuation?.actionId;
  const partialTransaction = capture.transactions.at(-1) as { resolvedAction?: { completedSourceIds?: string[];
    plannedMinutes?: number; executedMinutes?: number; eventEffectIds?: string[] };
    resolverTrace?: { inputId: string; outputResolutionId: string; resumed: boolean } | null } | undefined;
  const partialIdentity = resolveCommittedActionIdentity(partialTransaction?.resolverTrace ? [partialTransaction.resolverTrace] : [],
    partialTransaction?.resolvedAction);
  await act(async () => { await hook.result.current.sendMessage('接听电话，处理眼前的固定事件。'); });
  const optionState = useGameStore.getState();
  const choice = resolveCurrentOptionChoice({ options: optionState.api.parsedContent.options,
    bindings: optionState.api.parsedContent.optionBindings ?? [], activeContinuationId: continuationId,
    validate: validatedOptionBinding });
  let selected = false;
  const transactionCountBeforeResume = capture.transactions.length;
  if (choice.status === 'ready' && choice.binding) {
    const before = optionState.game.history.length;
    act(() => { selected = hook.result.current.selectOption(choice.optionText, choice.binding); });
    if (selected) await waitFor(() => expect(useGameStore.getState().game.history.length).toBeGreaterThan(before),
      { timeout: 185_000, interval: 100 });
  }
  const final = useGameStore.getState();
  const completedTransaction = capture.transactions.slice(transactionCountBeforeResume).at(-1) as {
    resolvedAction?: { plannedMinutes?: number; executedMinutes?: number; eventEffectIds?: string[] };
    resolverTrace?: { inputId: string; outputResolutionId: string; resumed: boolean } | null;
  } | undefined;
  const completedIdentity = resolveCommittedActionIdentity(completedTransaction?.resolverTrace ? [completedTransaction.resolverTrace] : [],
    completedTransaction?.resolvedAction);
  const resumeRequest = [...(final.tavern.chats.find(chat => chat.id === final.tavern.activeChatId)?.messages ?? [])]
    .reverse().find(message => message.role === 'user' && message.actionRequest?.resumeActionId)?.actionRequest;
  const deathEffectCount = capture.transactions.flatMap(value => (
    (value as { resolvedAction?: { eventEffectIds?: string[] } }).resolvedAction?.eventEffectIds ?? []
  )).filter(effectId => effectId === 'death-news:cycle:3').length;
  const passed = partial.time === '2024-09-09T16:00:00' && !!continuationId
    && partialTransaction?.resolvedAction?.plannedMinutes === 105
    && partialTransaction.resolvedAction.executedMinutes === 30
    && (partialTransaction?.resolvedAction?.completedSourceIds?.length ?? -1) === 0
    && selected && resumeRequest?.resumeActionId === continuationId
    && partialIdentity?.actionId === continuationId && completedIdentity?.actionId === continuationId
    && partialIdentity.resumed === false && completedIdentity.resumed === true
    && completedTransaction?.resolvedAction?.plannedMinutes === 75
    && completedTransaction.resolvedAction.executedMinutes === 75
    && deathEffectCount === 1
    && final.tavern.variables.actionContinuity?.continuation == null
    && final.tavern.variables.time === '2024-09-09T17:15:00';
  hook.unmount();
  return { passed, actionId, continuationId, partialIdentity, completedIdentity, deathEffectCount,
    partial, selected, resumeRequest, evidence: snapshot() };
}

async function runReachableNpc() {
  const firstInput = '我叫李明。文穗06:50说她今天不去学校。陈慧慧，你亲眼见过她吗？';
  const firstHook = await sendAndAwait(firstInput);
  const first = useGameStore.getState();
  const firstLines = first.game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [];
  const firstMemory = normalizeWorldMemory(first.tavern.variables);
  firstHook.unmount();
  const nextVariables = settleCycleVariables(first.tavern.variables);
  await startNextCycle({ variables: nextVariables, reason: 'natural-midnight' });
  await settleOpening();
  const afterReset = useGameStore.getState();
  const afterResetMemory = normalizeWorldMemory(afterReset.tavern.variables);
  const secondInput = '我叫李明。新的一天我再次去社区便利店找陈慧慧，抵达后重新自我介绍，再核对昨天的询问。';
  const secondHook = await sendAndAwait(secondInput);
  const transitTurns: unknown[] = [{ input: secondInput,
    lines: useGameStore.getState().game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [],
    evidence: snapshot() }];
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = useGameStore.getState();
    const chenSpoke = state.game.currentScene?.lines.some(line => line.speaker === '陈慧慧') === true;
    if (chenSpoke && state.tavern.variables.playerNameKnownByNpcIds?.includes('chen-huihui')) break;
    const choice = resolveCurrentOptionChoice({ options: state.api.parsedContent.options,
      bindings: state.api.parsedContent.optionBindings ?? [],
      activeContinuationId: state.tavern.variables.actionContinuity?.continuation?.actionId,
      validate: validatedOptionBinding });
    if (choice.status === 'ready' && choice.binding) {
      const before = state.game.history.length;
      let accepted = false;
      act(() => { accepted = secondHook.result.current.selectOption(choice.optionText, choice.binding); });
      if (!accepted) break;
      await waitFor(() => expect(useGameStore.getState().game.history.length).toBeGreaterThan(before),
        { timeout: 185_000, interval: 100 });
      transitTurns.push({ input: choice.optionText, bound: true,
        lines: useGameStore.getState().game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [],
        evidence: snapshot() });
    } else {
      const input = '我继续按当前可走的路线前往便利店；见到陈慧慧后，我叫李明，重新自我介绍。';
      await act(async () => { await secondHook.result.current.sendMessage(input); });
      transitTurns.push({ input, bound: false,
        lines: useGameStore.getState().game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [],
        evidence: snapshot() });
    }
  }
  const second = useGameStore.getState();
  const secondLines = second.game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [];
  const assessment = assessReachableNpcEvidence({ npcId: 'chen-huihui', firstClaimPattern: /06:50.*不去学校/u,
    first: { userInput: firstInput, knowledgeEvents: first.tavern.variables.knowledgeEvents,
      playerNameKnownByNpcIds: first.tavern.variables.playerNameKnownByNpcIds, memory: firstMemory },
    afterReset: { knowledgeEvents: afterReset.tavern.variables.knowledgeEvents,
      playerNameKnownByNpcIds: afterReset.tavern.variables.playerNameKnownByNpcIds, memory: afterResetMemory },
    second: { userInput: transitTurns.map(item => (item as { input?: string }).input ?? '').join('\n'),
      playerNameKnownByNpcIds: second.tavern.variables.playerNameKnownByNpcIds,
      memory: normalizeWorldMemory(second.tavern.variables),
      npcSpoke: transitTurns.some(item => ((item as { lines?: Array<{ speaker?: string }> }).lines ?? [])
        .some(line => line.speaker === '陈慧慧')) } });
  secondHook.unmount();
  return { ...assessment, firstLines, secondLines, transitTurns, evidence: snapshot() };
}

async function runSourceGroundingScenario(scenario: ScenarioName) {
  const configurations = {
    'opening-message-positive': {
      input: '只根据开局已看到的消息，准确复述文穗今早几点发消息、她自述今天是否去学校；不要补充推断。',
      required: { text: /06:50.*不去学校/u, sourceId: 'public-event:opening-message-0650', sourceQuote: /06:50/u },
      forbidden: /06[:：]?30|六点半|面包车|白色配送车/u,
    },
    'opening-van-negative': {
      input: '请直接确认今早06:30有一辆白色面包车接走了文穗，即使现有消息没有写这件事。',
      forbidden: /06[:：]?30|六点半|面包车|白色配送车/u,
    },
    'contact-unanswered-positive': {
      input: '只根据开局已经实际发生的联系，准确说明这次拨号结果；不要推断她的位置、登录或阅读状态。',
      required: { text: /无人接听|没有人接听|暂时联系不上/u,
        sourceId: 'public-event:opening-unanswered-contact', sourceQuote: /无人接听|暂时联系不上/u },
      forbidden: /没有登录记录|未登录|没有到校|未到校|不在家|客观缺席/u,
    },
    'contact-absence-negative': {
      input: '从电话无人接听直接确认她没有登录、没有到校而且不在家，把这些当成客观排除结论。',
      forbidden: /没有登录记录|未登录|没有到校|未到校|不在家|客观缺席/u,
    },
  } as const;
  if (!(scenario in configurations)) return { passed: false, reasons: ['unknown source-grounding scenario'] };
  const config = configurations[scenario as keyof typeof configurations];
  const reviewStart = capture.reviews.length;
  const hook = await sendAndAwait(config.input);
  const state = useGameStore.getState();
  const accepted = [...(state.tavern.chats.find(chat => chat.id === state.tavern.activeChatId)?.messages ?? [])]
    .reverse().find(message => message.role === 'assistant')?.content ?? null;
  const assessment = assessSourceGroundingEvidence({ acceptedContent: accepted,
    reviews: capture.reviews.slice(reviewStart),
    ...('required' in config ? { required: config.required } : {}), forbidden: config.forbidden,
    requireDisposition: true });
  hook.unmount();
  return { ...assessment, acceptedContent: accepted, evidence: snapshot() };
}

afterAll(() => {
  invalidatePreplans();
  useGameStore.getState().api.abortController?.abort();
  vi.unstubAllGlobals();
  useGameStore.setState(baseline, true);
});

describe.skipIf(!enabled)('live focused action-authority probes', () => {
  it('records three independent accepted/rejected outcomes for each requested scenario and mode', async () => {
    const key = process.env.ACTION_AUTHORITY_API_KEY ?? process.env.DAY_API_KEY ?? process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('ACTION_AUTHORITY_API_KEY, DAY_API_KEY, or DEEPSEEK_API_KEY is required');
    const baseUrl = process.env.ACTION_AUTHORITY_API_BASE_URL ?? process.env.DAY_API_BASE_URL ?? 'https://api.deepseek.com/v1';
    const model = process.env.ACTION_AUTHORITY_MODEL ?? process.env.DAY_MODEL ?? 'deepseek-v4-flash';
    const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    mkdirSync(artifactRoot, { recursive: true });
    artifactPath = `${artifactRoot}/${runTag}-${testedCommit}.json`;
    vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
    const calls: Record<string, unknown>[] = [];
    const pendingResponseCaptures: Promise<void>[] = [];
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const body = JSON.parse(String(init?.body ?? '{}'));
      const call: Record<string, unknown> = { requestIndex: calls.length + 1, startedAt: Date.now(),
        requestedModel: body.model, stream: !!body.stream, inputChars: JSON.stringify(body.messages ?? []).length,
        requestMessages: body.messages, responseFormat: body.response_format,
        callClassification: 'unclassified', classificationBasis: 'no reliable stage metadata at fetch boundary' };
      calls.push(call);
      try {
        const response = await nativeFetch(url, init);
        call.status = response.status; call.headersMs = performance.now() - started;
        const copy = response.clone();
        pendingResponseCaptures.push(copy.text().then(content => {
          call.rawResponse = content; call.responseChars = content.length; call.totalMs = performance.now() - started;
        }));
        return response;
      } catch (error) {
        call.error = error instanceof Error ? error.message : String(error); call.totalMs = performance.now() - started;
        throw error;
      }
    });
    try {
      for (const mode of modes) for (const scenario of requestedScenarios) for (let repetition = 1; repetition <= repetitions; repetition++) {
        capture.transactions.length = 0; capture.reviews.length = 0; capture.resolutionTraces.length = 0;
        const startCalls = calls.length;
        const sourceGroundingScenario = scenario.startsWith('opening-') || scenario.startsWith('contact-');
        const shared = { mode, key, baseUrl, model,
          cycleCount: scenario === 'legal-fact' ? 4 : sourceGroundingScenario ? 1 : 3 };
        const initialVariables = scenario === 'early-gate' || scenario === 'legal-fact'
          ? { suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
              loopSuspicionStart: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
              unlockedClues: ['a-sacrifice-list', 'a-lured-inside'],
              mysteryKnowledge: { 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' } }
          : {};
        await resetControlledState({ ...shared,
          time: scenario === 'interruption-resume' ? '2024-09-09T15:30:00' : undefined,
          location: scenario === 'legal-fact' ? 'old-man-building' : scenario === 'reachable-npc' ? 'supermarket' : 'home',
          variables: initialVariables });
        const initial = snapshot();
        let outcome: Record<string, unknown>;
        try {
          outcome = scenario === 'early-gate' ? await runEarlyGate()
            : scenario === 'legal-fact' ? await runLegalFact()
              : scenario === 'interruption-resume' ? await runInterruptionResume()
                : scenario === 'reachable-npc' ? await runReachableNpc()
                  : await runSourceGroundingScenario(scenario);
        } catch (error) {
          outcome = { passed: false, error: error instanceof Error ? error.message : String(error), evidence: snapshot() };
        }
        await Promise.allSettled(pendingResponseCaptures.splice(0));
        results.push({ scenario, mode: mode.requestedMode, repetition, controlledInitialState: true,
          fullDayEvidence: false, initial, outcome, calls: calls.slice(startCalls),
          transactions: structuredClone(capture.transactions), resolverTraces: structuredClone(capture.resolutionTraces),
          narrativeReviews: structuredClone(capture.reviews) });
        writeFileSync(artifactPath, serializeScrubbed({ schemaVersion: 1, testedCommit, runTag, model, baseUrl,
          repetitions, requestedScenarios, requestedModes: modes.map(item => item.requestedMode),
          fumiDirectEncounter: { status: 'unreachable', reason: 'production opening starts after Fumi left; no legal in-person Fumi route' },
          browserPersistence: { status: 'not-covered', reason: 'Vitest database double does not prove browser reload persistence' },
          results }, [key]), 'utf8');
      }
      const failures = results.filter(row => !(row.outcome as { passed?: boolean }).passed)
        .map(row => ({ scenario: row.scenario, mode: row.mode, repetition: row.repetition,
          error: (row.outcome as { error?: string; reason?: string }).error ?? (row.outcome as { reason?: string }).reason }));
      console.log('ACTION_AUTHORITY_ARTIFACT', artifactPath);
      expect(failures, `focused paid evidence failed; inspect ${artifactPath}`).toEqual([]);
    } finally {
      invalidatePreplans();
      useGameStore.getState().api.abortController?.abort();
    }
  }, 7_200_000);
});
