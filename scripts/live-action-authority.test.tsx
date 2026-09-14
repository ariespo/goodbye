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
import { parseDayMode, resolveCurrentOptionChoice, serializeScrubbed, snapshotPersistedEvidence } from './live-day-evaluation-harness';

const capture = vi.hoisted(() => ({ transactions: [] as unknown[], reviews: [] as unknown[] }));

vi.mock('../src/engine/game-transaction', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/engine/game-transaction')>();
  return { ...actual, settleGameTransaction: (input: Parameters<typeof actual.settleGameTransaction>[0]) => {
    const settled = actual.settleGameTransaction(input);
    capture.transactions.push(structuredClone({
      resolvedAction: input.resolvedAction, pendingActionAuthorization: input.pendingActionAuthorization,
      selectedOpportunity: input.selectedOpportunity, opportunityProgress: input.opportunityProgress,
      settledVariables: settled.variables,
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
const scenarioNames = ['early-gate', 'legal-fact', 'interruption-resume', 'reachable-npc'] as const;
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
  const opportunity = buildInvestigationOpportunities({ graph: MYSTERY_TRUTH_GRAPH,
    context: scenarioContext('home'), progress: { cycleCount: 3, completedIds: [], noProgressByTopic: {} },
    currentTime: '2024-09-09T15:30:00' })
    .find(item => item.locationId === 'school');
  if (!opportunity) return { passed: false, reason: 'school opportunity absent' };
  const actionId = opportunity.id;
  const menu = { ...maintextToScene('对话|旁白|calm|你准备去学校核对记录。'), investigateItems: [{
    desc: opportunity.publicGoal, suspect: '无', style: '现实', time: '65分钟', stamina: 90, sanity: 70,
    opportunityId: opportunity.id, kind: 'investigation' as const, scope: opportunity.scope, locationId: opportunity.locationId,
    actionId, originLocationId: 'home',
  }] };
  useGameStore.setState(current => ({ game: { ...current.game, currentScene: menu } }));
  const hook = renderHook(() => useGameLoop());
  act(() => { hook.result.current.performAction('investigate', 0, actionId, 'home'); });
  await waitFor(() => expect(useGameStore.getState().game.history).toHaveLength(1), { timeout: 185_000, interval: 100 });
  const partial = snapshot();
  const continuationId = useGameStore.getState().tavern.variables.actionContinuity?.continuation?.actionId;
  const partialTransaction = capture.transactions.at(-1) as { resolvedAction?: { completedSourceIds?: string[] } } | undefined;
  await act(async () => { await hook.result.current.sendMessage('接听电话，处理眼前的固定事件。'); });
  const optionState = useGameStore.getState();
  const choice = resolveCurrentOptionChoice({ options: optionState.api.parsedContent.options,
    bindings: optionState.api.parsedContent.optionBindings ?? [], activeContinuationId: continuationId,
    validate: validatedOptionBinding });
  let selected = false;
  if (choice.status === 'ready' && choice.binding) {
    const before = optionState.game.history.length;
    act(() => { selected = hook.result.current.selectOption(choice.optionText, choice.binding); });
    if (selected) await waitFor(() => expect(useGameStore.getState().game.history.length).toBeGreaterThan(before),
      { timeout: 185_000, interval: 100 });
  }
  const final = useGameStore.getState();
  const resumeRequest = [...(final.tavern.chats.find(chat => chat.id === final.tavern.activeChatId)?.messages ?? [])]
    .reverse().find(message => message.role === 'user' && message.actionRequest?.resumeActionId)?.actionRequest;
  const passed = partial.time === '2024-09-09T16:00:00' && !!continuationId
    && (partialTransaction?.resolvedAction?.completedSourceIds?.length ?? -1) === 0
    && selected && resumeRequest?.resumeActionId === continuationId
    && final.tavern.variables.actionContinuity?.continuation == null
    && final.tavern.variables.opportunityProgress?.completedIds.includes(opportunity.id) === true;
  hook.unmount();
  return { passed, actionId, continuationId, partial, selected, resumeRequest, evidence: snapshot() };
}

async function runReachableNpc() {
  const firstHook = await sendAndAwait('我到社区便利店找店员陈慧慧，先自我介绍叫李明，再询问她亲眼见过文穗的事情。');
  const first = useGameStore.getState();
  const firstLines = first.game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [];
  const firstMemory = normalizeWorldMemory(first.tavern.variables);
  const chenDisclosure = firstMemory.disclosures.some(item => item.speakerId === 'chen-huihui'
    || item.listenerIds.includes('chen-huihui'));
  firstHook.unmount();
  const nextVariables = settleCycleVariables(first.tavern.variables);
  await startNextCycle({ variables: nextVariables, reason: 'natural-midnight' });
  await settleOpening();
  const secondHook = await sendAndAwait('新的一天我再次去社区便利店找陈慧慧，请她先说明自己是谁，再继续核对亲眼见过的事情。');
  const second = useGameStore.getState();
  const secondLines = second.game.currentScene?.lines.map(line => ({ speaker: line.speaker, text: line.text })) ?? [];
  const chenFirst = firstLines.some(line => line.speaker === '陈慧慧');
  const chenAgain = secondLines.some(line => line.speaker === '陈慧慧');
  const passed = first.game.history.length === 1 && second.game.history.length >= 2 && chenFirst && chenAgain && chenDisclosure;
  secondHook.unmount();
  return { passed, chenDisclosure, firstLines, secondLines, evidence: snapshot() };
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
        capture.transactions.length = 0; capture.reviews.length = 0;
        const startCalls = calls.length;
        const shared = { mode, key, baseUrl, model, cycleCount: scenario === 'legal-fact' ? 4 : 3 };
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
                : await runReachableNpc();
        } catch (error) {
          outcome = { passed: false, error: error instanceof Error ? error.message : String(error), evidence: snapshot() };
        }
        await Promise.allSettled(pendingResponseCaptures.splice(0));
        results.push({ scenario, mode: mode.requestedMode, repetition, controlledInitialState: true,
          fullDayEvidence: false, initial, outcome, calls: calls.slice(startCalls),
          transactions: structuredClone(capture.transactions), narrativeReviews: structuredClone(capture.reviews) });
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
