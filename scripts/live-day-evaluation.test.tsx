// @vitest-environment jsdom
// Explicit opt-in only. Real models, real history/transactions, isolated disk I/O.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { transferableAbortController } from 'node:util';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, vi, expect } from 'vitest';
import { useGameLoop } from '../src/hooks/useGameLoop';
import { useGameStore } from '../src/stores/gameStore';
import { startNewGame } from '../src/utils/gameSession';
import { commitKnowledgeEvents } from '../src/utils/knowledgeCommit';
import { resolveSceneEnvironment } from '../src/utils/sceneEnvironment';
import { normalizeLocationId } from '../src/data/locations';
import { validatedOptionBinding, type ActionOptionBinding } from '../src/utils/actionPresentation';
import { startNextCycle, settleCycleVariables } from '../src/utils/cycleLoop';
import { invalidatePreplans } from '../src/agents/mystery';
import { clearOrchestrationLog, getOrchestrationLog } from '../src/agents/mystery/orchestration-log';
import { clearTurnMetrics, getTurnMetrics } from '../src/agents/mystery/turn-metrics';
import { createDefaultPreset, DEFAULT_FORMAT_PROMPT, type AppSettings, type ChatPreset } from '../src/sillytavern/types';
import {
  assessFullDayAcceptance,
  assertAcceptanceOverrides,
  assertCampaignAdvance,
  assertResumeCompatible,
  buildEvaluationProvenance,
  classifyCycleReset,
  compareQuoteToResolution,
  diffPersistedEvidence,
  parseDayMode,
  resolveCurrentOptionChoice,
  resolveCommittedActionIdentity,
  sameActionRequestIdentity,
  serializeScrubbed,
  snapshotPersistedEvidence,
  summarizeAuditRows,
} from './live-day-evaluation-harness';

const harnessCapture = vi.hoisted(() => ({ transactions: [] as unknown[], narrativeReviews: [] as unknown[],
  resolutionTraces: [] as Array<{ inputId: string; outputResolutionId: string; resumed: boolean }> }));

vi.mock('../src/engine/action-resolution', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/engine/action-resolution')>();
  return { ...actual, resolveAction: (input: Parameters<typeof actual.resolveAction>[0]) => {
    const output = actual.resolveAction(input);
    harnessCapture.resolutionTraces.push({ inputId: input.id, outputResolutionId: output.id,
      resumed: input.continuation !== undefined });
    return output;
  } };
});

vi.mock('../src/engine/game-transaction', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/engine/game-transaction')>();
  return { ...actual, settleGameTransaction: (input: Parameters<typeof actual.settleGameTransaction>[0]) => {
    const resolverTrace = [...harnessCapture.resolutionTraces].reverse()
      .find(trace => trace.outputResolutionId === input.resolvedAction.id) ?? null;
    harnessCapture.transactions.push(structuredClone({
      resolvedAction: input.resolvedAction,
      pendingActionAuthorization: input.pendingActionAuthorization,
      selectedOpportunity: input.selectedOpportunity,
      opportunityProgress: input.opportunityProgress,
      resolverTrace,
    }));
    return actual.settleGameTransaction(input);
  } };
});

vi.mock('../src/agents/mystery', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/agents/mystery')>();
  return { ...actual, reviewNarrativeAgainstWriterPacket: async (
    options: Parameters<typeof actual.reviewNarrativeAgainstWriterPacket>[0],
  ) => {
    const review = await actual.reviewNarrativeAgainstWriterPacket(options);
    harnessCapture.narrativeReviews.push(structuredClone(review));
    return review;
  } };
});

vi.mock('../src/sillytavern/database', async importOriginal => ({
  ...await importOriginal<typeof import('../src/sillytavern/database')>(),
  saveChat: vi.fn().mockResolvedValue(undefined), getChats: vi.fn().mockResolvedValue([]),
}));

const enabled = process.env.LIVE_DAY_EVAL === '1';
const profileValue = process.env.DAY_PROFILE ?? 'fast';
const supportedProfiles = ['fast', 'investigator', 'options', 'program-menu'] as const;
if (!supportedProfiles.includes(profileValue as typeof supportedProfiles[number])) {
  throw new Error(`Unsupported DAY_PROFILE ${JSON.stringify(profileValue)}; expected ${supportedProfiles.join(', ')}`);
}
const profile = profileValue as typeof supportedProfiles[number];
const mode = parseDayMode(process.env.DAY_MODE);
assertAcceptanceOverrides(enabled, process.env);
const maxTurns = Math.min(120, Number(process.env.DAY_MAX_TURNS) || 90);
const expectedBaselineCycle = Number(process.env.DAY_EXPECTED_BASELINE_CYCLE ?? 1);
if (!Number.isSafeInteger(expectedBaselineCycle) || expectedBaselineCycle < 1) {
  throw new Error('DAY_EXPECTED_BASELINE_CYCLE must be a positive integer');
}
const nativeFetch = globalThis.fetch;
const baseline = useGameStore.getState();
const root = '.codex-test-tmp/day-evaluation';
const runTag = (process.env.DAY_RUN_TAG ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
const campaignId = ((process.env.DAY_CAMPAIGN_ID ?? runTag).trim() || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
if (!campaignId) throw new Error('DAY_CAMPAIGN_ID must contain a safe identifier');
const baseLabel = `${profile}-${mode.requestedMode}-${campaignId}`;
const segmentPaths = (cycle: number) => ({
  file: `${root}/${baseLabel}-c${cycle}.json`,
  checkpoint: `${root}/${baseLabel}-c${cycle}-checkpoint.json`,
});
const { file, checkpoint } = segmentPaths(expectedBaselineCycle);
const label = `${baseLabel}-c${expectedBaselineCycle}`;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const snapshot = () => {
  const state = useGameStore.getState();
  return { time: state.game.gameStatus.time.toISOString(), storyTime: state.tavern.variables.time,
    cycleCount: state.tavern.variables.cycleCount,
    location: state.tavern.variables.location, stamina: state.game.gameStatus.stamina, sanity: state.game.gameStatus.sanity,
    knowledge: Array.isArray(state.tavern.variables.knowledgeEvents)
      ? structuredClone(state.tavern.variables.knowledgeEvents) : [],
    facts: state.tavern.variables.mysteryKnowledge && typeof state.tavern.variables.mysteryKnowledge === 'object'
      ? structuredClone(state.tavern.variables.mysteryKnowledge) : {},
    suspicion: state.tavern.variables.suspicion, deathNews: state.tavern.variables.deathNews,
    pendingReset: state.game.pendingCycleReset, pendingEnding: state.game.endingPanel.pendingEndingId,
    historyLength: state.game.history.length,
    persistedEvidence: snapshotPersistedEvidence(state.tavern.variables),
    latestHistoryEvidence: snapshotPersistedEvidence(state.game.history.at(-1)?.variables) };
};

const lastUserActionRequest = () => {
  const state = useGameStore.getState();
  const chat = state.tavern.chats.find(item => item.id === state.tavern.activeChatId);
  return structuredClone([...chat?.messages ?? []].reverse().find(message => message.role === 'user')?.actionRequest ?? null);
};

function playback() {
  const state = useGameStore.getState();
  const scene = state.game.currentScene;
  if (!scene?.lines.length) return;
  const committed = new Set<string>();
  scene.lines.forEach((line, i) => {
    if (!scene.knowledgeAlreadyCommitted && line.knowledgeEvents?.length)
      commitKnowledgeEvents(line.knowledgeEvents, `${scene.id}:${i}`, committed);
  });
  const line = scene.lines.at(-1)!;
  state.actions.setCurrentState({ background: line.background || null, bgm: line.bgm || null,
    character: line.character ?? null, speaker: line.speaker || null, mood: line.emotion || 'calm',
    effect: line.effect || null, item: line.item || null, environment: resolveSceneEnvironment(line.background) });
  state.actions.setCurrentLineIndex(scene.lines.length - 1);
  state.actions.setIsTyping(false);
  state.actions.setSceneComplete(true);
}

const interactions = [
  '我想去社区便利店，向店员询问文穗今天是否来过。',
  '谢谢你，不着急，你慢慢说。我想先听清楚你亲眼见过的事情。',
  '你刚才一直在擦汗，我有点担心。是我问得太急了吗？',
  '我想去学校找体育老师，询问文穗今天的情况。',
  '我想核实学校现在能够告诉家属的情况，请告诉我接下来应该去哪里找她。',
  '我去周大爷居住的旧楼，敲门向他打听文穗的消息。',
  '周大爷，您先坐，我只问您亲眼见过的事情，不确定的就不用猜。',
  '我现在有一些怀疑，但怀疑不是证据。我想继续核对刚才那件事。',
  '我去社区医院，找值班护士了解有没有文穗的消息。',
  '我很着急，但不想越过规定。哪些事情您能告诉我，哪些需要另找负责人？',
  '我叫李明，现在正式介绍一下。我希望你告诉我接下来实际能做什么。',
  '我去山路和附近街道寻找目击者，只询问他们亲眼见到的事情。',
  '我想去附近旅馆询问有没有人见过文穗。',
  '您方便介绍一下自己吗？平时在这附近做什么工作？',
  '我联系灯织学姐，告诉她目前已发生的情况，听听她的建议。',
  '谢谢你替我考虑，但这次我想自己决定。你能把能说的部分直接告诉我吗？',
];

describe.skipIf(!enabled)('live full repeated-day evaluation', () => {
  it(`${label}: requires a naturally completed real-model calendar day`, async () => {
    const key = process.env.DAY_API_KEY ?? process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DAY_API_KEY or DEEPSEEK_API_KEY is required');
    const baseUrl = process.env.DAY_API_BASE_URL ?? 'https://api.deepseek.com/v1';
    const model = process.env.DAY_MODEL ?? 'deepseek-v4-flash';
    const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const provenance = buildEvaluationProvenance({
      testedCommit, profile, mode, model, baseUrl, maxTurns, runTag, campaignId,
      baselineCycle: expectedBaselineCycle,
    });
    const resumeRequested = process.env.DAY_RESUME === '1';
    const advanceRequested = process.env.DAY_ADVANCE === '1';
    if (resumeRequested && advanceRequested) throw new Error('DAY_RESUME and DAY_ADVANCE are mutually exclusive');
    if (resumeRequested) {
      if (!existsSync(checkpoint) || !existsSync(file)) throw new Error(`missing current segment artifacts for ${label}`);
      const saved = JSON.parse(readFileSync(checkpoint, 'utf8'));
      const old = JSON.parse(readFileSync(file, 'utf8'));
      const parentPaths = segmentPaths(expectedBaselineCycle - 1);
      const parentArtifacts = saved.lineage?.source === 'advance'
        ? { checkpointText: readFileSync(parentPaths.checkpoint, 'utf8'), resultText: readFileSync(parentPaths.file, 'utf8') }
        : undefined;
      assertResumeCompatible({ expected: provenance, checkpoint: saved, result: old, parentArtifacts });
    }
    vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
    let calls: Record<string, unknown>[] = [];
    let pending = 0;
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const body = JSON.parse(String(init?.body ?? '{}'));
      const call: Record<string, unknown> = { requestIndex: calls.length + 1, startedAt: Date.now(), stream: !!body.stream,
        inputChars: JSON.stringify(body.messages ?? []).length, maxTokens: body.max_tokens,
        requestedModel: body.model,
        system: body.messages?.[0]?.content, user: body.messages?.at(-1)?.content,
        responseFormat: body.response_format?.type };
      calls.push(call); pending++;
      try {
        const response = await nativeFetch(url, init);
        call.headersMs = performance.now() - started; call.status = response.status;
        const copy = response.clone();
        void (body.stream ? copy.text().then(content => { call.content = content; }) : copy.json().then(result => {
          call.content = result.choices?.[0]?.message?.content; call.usage = result.usage;
          call.responseModel = result.model; call.finishReason = result.choices?.[0]?.finish_reason;
          call.providerError = result.error?.message;
        })).catch(() => {}).finally(() => { call.totalMs = performance.now() - started; pending--; });
        return response;
      } catch (error) { call.error = error instanceof Error ? error.name : 'fetch error'; pending--; throw error; }
    });
    const background = async () => {
      const start = Date.now();
      while (Date.now() - start < 75_000) {
        await pause(250);
        if (!pending) { await pause(150); if (!pending) return; }
      }
      invalidatePreplans();
    };
    const preset = { ...createDefaultPreset(), id: 'day-eval', createdAt: 0, updatedAt: 0 } as ChatPreset;
    const settings = { api: { baseUrl, apiKey: key, model },
      activePresetId: preset.id, activeLorebookIds: [], userName: '李明', characterName: '文穗',
      playerGender: 'male', playerIdentityConfirmed: true, agentNarrativeMode: mode.settingsValue,
      formatPromptTemplate: DEFAULT_FORMAT_PROMPT } as unknown as AppSettings;
    useGameStore.setState({ ...baseline, tavern: { ...baseline.tavern, settings, presets: [preset] } }, true);
    let rows: Record<string, any>[] = [];
    let startState: unknown;
    let lineage: Record<string, unknown> = { source: 'fresh' };
    const restoreCheckpoint = (saved: Record<string, any>) => {
      saved.game.gameStatus.time = new Date(saved.game.gameStatus.time);
      useGameStore.setState(state => ({ game: saved.game, tavern: { ...state.tavern, ...saved.tavern },
        api: { ...state.api, ...saved.api, abortController: null, isStreaming: false } }));
    };
    if (resumeRequested) {
      if (!existsSync(checkpoint) || !existsSync(file)) throw new Error(`missing current segment artifacts for ${label}`);
      const checkpointText = readFileSync(checkpoint, 'utf8');
      const resultText = readFileSync(file, 'utf8');
      const saved = JSON.parse(checkpointText);
      const old = JSON.parse(resultText);
      const parentPaths = segmentPaths(expectedBaselineCycle - 1);
      const parentArtifacts = saved.lineage?.source === 'advance'
        ? { checkpointText: readFileSync(parentPaths.checkpoint, 'utf8'), resultText: readFileSync(parentPaths.file, 'utf8') }
        : undefined;
      assertResumeCompatible({ expected: provenance, checkpoint: saved, result: old, parentArtifacts });
      restoreCheckpoint(saved);
      rows = old.rows; startState = old.startState;
      lineage = saved.lineage;
    } else if (advanceRequested) {
      if (expectedBaselineCycle < 2) throw new Error('DAY_ADVANCE requires DAY_EXPECTED_BASELINE_CYCLE >= 2');
      const parentPaths = segmentPaths(expectedBaselineCycle - 1);
      if (!existsSync(parentPaths.checkpoint) || !existsSync(parentPaths.file)) {
        throw new Error(`missing passed parent segment artifacts for cycle ${expectedBaselineCycle - 1}`);
      }
      const checkpointText = readFileSync(parentPaths.checkpoint, 'utf8');
      const resultText = readFileSync(parentPaths.file, 'utf8');
      const saved = JSON.parse(checkpointText);
      const old = JSON.parse(resultText);
      const grandparentPaths = segmentPaths(expectedBaselineCycle - 2);
      const parentArtifacts = saved.lineage?.source === 'advance'
        ? { checkpointText: readFileSync(grandparentPaths.checkpoint, 'utf8'), resultText: readFileSync(grandparentPaths.file, 'utf8') }
        : undefined;
      lineage = assertCampaignAdvance({ expected: provenance, checkpoint: saved, result: old,
        checkpointText, resultText, parentArtifacts });
      restoreCheckpoint(saved);
      startState = snapshot();
    } else {
      await act(async () => { await startNewGame(); playback(); await pause(25); });
      startState = snapshot();
      if (Number((startState as { cycleCount?: unknown }).cycleCount) !== expectedBaselineCycle) {
        throw new Error(`fresh evaluation began at cycle ${(startState as { cycleCount?: unknown }).cycleCount}; expected ${expectedBaselineCycle}`);
      }
    }
    mkdirSync(root, { recursive: true });
    const { result, unmount } = renderHook(() => useGameLoop());
    let stopReason = 'turn-cap';
    let consecutiveFailures = 0;
    let successful = rows.filter(row => row.success).length;
    let programMenuSelections = rows.filter(row => row.actionOrigin === 'program-menu').length;
    let optionChoiceSelections = rows.filter(row => row.actionOrigin === 'option-choice' && row.success).length;
    const flush = () => {
      const state = useGameStore.getState();
      const finalState = snapshot();
      const audit = summarizeAuditRows(rows);
      const acceptance = assessFullDayAcceptance({ baselineCycle: expectedBaselineCycle,
        finalCycle: Number(finalState.cycleCount), successfulRows: successful, stopReason,
        programMenuRequired: profile === 'program-menu', programMenuSelections,
        optionChoiceRequired: profile === 'options', optionChoiceSelections });
      const storageBoundary = {
        database: 'saveChat/getChats are test doubles; committed in-memory chat, variables, and history snapshots are observed',
        browserPersistence: 'unverified in this harness; browser reload, IndexedDB durability, and playback require later browser acceptance',
      };
      writeFileSync(file, serializeScrubbed({ profile, mode, baseUrl, model, diagnosticsEnabled: false,
        provenance, lineage, startState, finalState, stopReason, successful, programMenuSelections, optionChoiceSelections,
        audit, acceptance, storageBoundary,
        characterConversationCoverage: 'unrun: no fabricated alive in-person Fumi fixture; legal production route must be determined later',
        rows }, [key]));
      writeFileSync(checkpoint, serializeScrubbed({ provenance, lineage, baselineCycle: expectedBaselineCycle,
        currentCycle: Number(finalState.cycleCount), game: state.game,
        tavern: { chats: state.tavern.chats, activeChatId: state.tavern.activeChatId, variables: state.tavern.variables },
        api: { parsedContent: state.api.parsedContent, turnRecovery: state.api.turnRecovery, error: state.api.error } }, [key]));
      return acceptance;
    };
    try {
      while (successful < maxTurns && rows.length < maxTurns + 40) {
        calls = []; clearTurnMetrics(); clearOrchestrationLog();
        const before = snapshot();
        const state = useGameStore.getState();
        const options = state.api.parsedContent.options ?? [];
        const retry = consecutiveFailures === 1;
        const transactionCaptureStart = harnessCapture.transactions.length;
        const reviewCaptureStart = harnessCapture.narrativeReviews.length;
        const retrySourceActionRequest = retry ? lastUserActionRequest() : null;
        let selectedProgramAction: Record<string, unknown> | null = null;
        let selectedOptionChoice: { optionIndex: number; optionText: string; binding?: ActionOptionBinding } | null = null;
        let optionSelectionAccepted: boolean | undefined;
        let localSelectionError: string | null = null;
        let actionOrigin = retry ? 'retry' : 'player';
        let input: string;
        if (retry) input = rows.at(-1)!.input;
        else if (consecutiveFailures > 1) input = '我停下来整理刚刚发生的事情，先做目前可以做到的下一步。';
        else if (profile === 'fast') input = successful === 0
          ? '我用接下来的两个小时在附近寻找文穗，向愿意回答的人打听，不做越权的事情。'
          : '我继续寻找文穗，愿意花接下来的两个小时做当前实际能够做的搜索或等候，并留意这段时间发生的消息。';
        else if (profile === 'investigator' && successful < interactions.length) input = interactions[successful];
        else if (profile === 'investigator') input = before.deathNews === 'delivered'
          ? '我继续处理刚收到的坏消息，完成当前能做的确认和善后；如果暂时没有可做的事，就回家休息一段时间。'
          : (options.find((option: string) => /去|找|联系|核实|调查|询问/.test(option)) ?? options[0] ?? '我继续寻找文穗。');
        else if (profile === 'program-menu') {
          const investigationIndex = state.game.currentScene?.investigateItems?.findIndex(item => !!item.actionId) ?? -1;
          const actionIndex = state.game.currentScene?.actionItems?.findIndex(item => !!item.actionId) ?? -1;
          if (investigationIndex >= 0) {
            const item = state.game.currentScene!.investigateItems![investigationIndex];
            selectedProgramAction = structuredClone({ type: 'investigate', index: investigationIndex, ...item });
            input = item.desc; actionOrigin = 'program-menu';
          } else if (actionIndex >= 0) {
            const item = state.game.currentScene!.actionItems![actionIndex];
            selectedProgramAction = structuredClone({ type: 'actions', index: actionIndex, ...item });
            input = item.desc; actionOrigin = 'program-menu';
          } else {
            input = options[0] ?? '我检查眼前能看到的事情，决定接下来去哪里找文穗。';
            actionOrigin = 'program-menu-bootstrap';
          }
        } else {
          const optionChoice = resolveCurrentOptionChoice({
            options,
            bindings: state.api.parsedContent.optionBindings ?? [],
            activeContinuationId: state.tavern.variables.actionContinuity?.continuation?.actionId,
            validate: validatedOptionBinding,
          });
          if (optionChoice.status === 'ready') {
            selectedOptionChoice = { optionIndex: optionChoice.optionIndex, optionText: optionChoice.optionText,
              ...(optionChoice.binding ? { binding: optionChoice.binding } : {}) };
            input = optionChoice.optionText;
            actionOrigin = 'option-choice';
          } else if (optionChoice.status === 'no-option' && successful === 0) {
            input = '我检查眼前能看到的事情，决定接下来去哪里找文穗。';
            actionOrigin = 'options-bootstrap';
          } else {
            input = optionChoice.status === 'no-option' ? '[no current option]' : optionChoice.optionText;
            actionOrigin = 'option-choice-rejected';
            localSelectionError = optionChoice.status;
          }
        }
        const attemptStarted = Date.now();
        const timer = setTimeout(() => useGameStore.getState().api.abortController?.abort(), 180_000);
        if (selectedProgramAction) {
          programMenuSelections++;
          await act(async () => {
            result.current.performAction(
              selectedProgramAction!.type as 'investigate' | 'actions',
              Number(selectedProgramAction!.index),
              String(selectedProgramAction!.actionId),
              normalizeLocationId(state.tavern.variables.location),
            );
            await pause(10);
          });
          await waitFor(() => {
            const current = useGameStore.getState();
            const committed = current.game.history.length > Number(before.historyLength);
            const failed = current.api.turnRecovery.phase !== 'idle';
            if ((!committed && !failed) || current.api.isStreaming) throw new Error('program-menu turn is still running');
          }, { timeout: 185_000, interval: 100 });
        } else if (selectedOptionChoice) {
          await act(async () => {
            optionSelectionAccepted = result.current.selectOption(selectedOptionChoice!.optionText, selectedOptionChoice!.binding);
            await pause(10);
          });
          if (optionSelectionAccepted) {
            await waitFor(() => {
              const current = useGameStore.getState();
              const committed = current.game.history.length > Number(before.historyLength);
              const failed = current.api.turnRecovery.phase !== 'idle';
              if ((!committed && !failed) || current.api.isStreaming) throw new Error('option-choice turn is still running');
            }, { timeout: 185_000, interval: 100 });
          } else localSelectionError = 'selectOption rejected current validated choice';
        } else if (!localSelectionError) {
          await act(async () => {
            if (retry) await result.current.retryTurn();
            else await result.current.sendMessage(input);
          });
        }
        clearTimeout(timer);
        const afterSend = useGameStore.getState();
        const success = afterSend.game.history.length > Number(before.historyLength);
        const accepted = success ? [...afterSend.tavern.chats.find(c=>c.id===afterSend.tavern.activeChatId)!.messages]
          .reverse().find(message=>message.role==='assistant') : null;
        const actionRequest = lastUserActionRequest();
        const transactionCapture = harnessCapture.transactions.slice(transactionCaptureStart).at(-1) as {
          resolvedAction?: unknown; pendingActionAuthorization?: unknown;
          selectedOpportunity?: unknown; opportunityProgress?: unknown;
          resolverTrace?: { inputId: string; outputResolutionId: string; resumed: boolean } | null;
        } | undefined;
        const after = snapshot();
        const stableIdentity = resolveCommittedActionIdentity(transactionCapture?.resolverTrace ? [transactionCapture.resolverTrace] : [],
          transactionCapture?.resolvedAction);
        const row: Record<string, any> = { attempt: rows.length + 1, turn: successful + 1, input, retry, success,
          actionOrigin, selectedProgramAction, selectedOptionChoice, optionSelectionAccepted, actionRequest,
          majorActionIdentity: stableIdentity?.actionId ?? null,
          majorActionIdentitySource: stableIdentity?.source ?? 'unverifiable',
          majorActionResumed: stableIdentity?.resumed ?? null,
          retrySourceActionRequest,
          retryIdentityMatches: retry ? sameActionRequestIdentity(retrySourceActionRequest, actionRequest) : undefined,
          before, after: snapshot(), metrics: getTurnMetrics().at(-1),
          error: localSelectionError ?? afterSend.api.error ?? afterSend.api.turnRecovery.errorMessage,
          accepted: accepted?.content, lines: success ? afterSend.game.currentScene?.lines : [],
          options: [...afterSend.api.parsedContent.options], calls, orchestration: [],
          resolvedAction: transactionCapture?.resolvedAction ?? null,
          priceVsActual: compareQuoteToResolution(selectedProgramAction, transactionCapture?.resolvedAction),
          selectedOpportunity: transactionCapture?.selectedOpportunity ?? null,
          settledOpportunityProgress: transactionCapture?.opportunityProgress ?? null,
          persistedDelta: diffPersistedEvidence(before.persistedEvidence, after.persistedEvidence),
          sourceAwards: {
            completedSourceIds: (transactionCapture?.resolvedAction as { completedSourceIds?: unknown } | undefined)?.completedSourceIds ?? [],
            knowledgeEvents: (after.knowledge as unknown[]).filter(id => !(before.knowledge as unknown[]).includes(id)),
            factLevelChanges: Object.entries(after.facts as Record<string, unknown>).filter(([id, level]) =>
              (before.facts as Record<string, unknown>)[id] !== level),
          },
          notifications: afterSend.ui.notifications.map(item=>item.message) };
        rows.push(row);
        if(success) {
          successful++; consecutiveFailures=0;
          if (actionOrigin === 'option-choice' && optionSelectionAccepted) optionChoiceSelections++;
        }
        else consecutiveFailures++;
        await act(async () => { await background(); });
        row.orchestration = getOrchestrationLog();
        row.assertionAudits = harnessCapture.narrativeReviews.slice(reviewCaptureStart);
        row.elapsedIncludingBackgroundMs = Date.now() - attemptStarted;
        row.checklist = useGameStore.getState().game.currentScene && {
          observe: useGameStore.getState().game.currentScene?.observe,
          investigations: useGameStore.getState().game.currentScene?.investigateItems,
          actions: useGameStore.getState().game.currentScene?.actionItems };
        if (success) await act(async () => { playback(); await pause(25); });
        const live = useGameStore.getState();
        if (live.game.pendingCycleReset && live.game.sceneComplete && !live.api.isStreaming
          && !live.game.endingPanel.visible && !live.game.endingPanel.pendingEndingId) {
          row.resetReason = live.game.pendingCycleReset;
          const reason = live.game.pendingCycleReset;
          const beforeReset = snapshot();
          const beforeResetTime = String(beforeReset.storyTime ?? '');
          await act(async () => {
            live.actions.setPendingCycleReset(null);
            await startNextCycle({variables:settleCycleVariables(live.tavern.variables),reason}); playback();
          });
          row.resetScene = useGameStore.getState().game.currentScene?.lines;
          row.afterReset = snapshot();
          const afterEvidence = (row.afterReset.persistedEvidence as any) ?? {};
          const afterMemory = afterEvidence.characterContinuity ?? {};
          const commitments = Array.isArray(afterMemory.commitments?.items) ? afterMemory.commitments.items : [];
          row.resetAudit = {
            returnedTo08Home: String(row.afterReset.storyTime).includes('T08:00') && row.afterReset.location === 'home',
            resourcesReset: row.afterReset.stamina === 100 && row.afterReset.sanity === 70,
            retainedFacts: JSON.stringify(row.afterReset.facts) === JSON.stringify(beforeReset.facts),
            retainedSuspicion: JSON.stringify(row.afterReset.suspicion) === JSON.stringify(beforeReset.suspicion),
            actionContinuityCleared: afterEvidence.actionContinuity === null,
            opportunityProgressCleared: afterEvidence.opportunityProgress === null,
            activeCommitmentsAfterReset: commitments.filter((item: any) => item?.status === 'active').map((item: any) => item.id),
          };
          stopReason = classifyCycleReset({ reason, beforeResetTime, afterResetTime: String(row.afterReset.storyTime ?? ''),
            baselineCycle: expectedBaselineCycle, afterCycle: Number(row.afterReset.cycleCount) });
        }
        console.log(JSON.stringify({profile,mode:mode.requestedMode,attempt:row.attempt,turn:row.turn,success,
          from:before.time,to:row.after.time,stamina:row.after.stamina,sanity:row.after.sanity,
          playableMs:row.metrics?.playableMs,calls:calls.length,error:row.error,reset:row.resetReason,
          resolutionId:(row.resolvedAction as {id?:unknown}|null)?.id,actionOrigin}));
        flush();
        if (calls.some(call => call.status === 402)) { stopReason='provider-insufficient-balance'; flush(); break; }
        if (!success && calls.some(call => typeof call.content === 'string'
          && call.content.trim().startsWith('### **Proxy error (HTTP ')
          && call.content.trim().endsWith('<!-- oai-proxy-error -->'))) {
          stopReason='provider-proxy-error'; flush(); break;
        }
        const providerHttpError = calls.find(call => Number(call.status) >= 500);
        if (!success && providerHttpError) { stopReason=`provider-http-${providerHttpError.status}`; flush(); break; }
        if (Number(snapshot().cycleCount)>expectedBaselineCycle) break;
        if (live.game.endingPanel.pendingEndingId) { stopReason='ending-before-day-reset'; break; }
        if (consecutiveFailures>=6) { stopReason='blocked-six-attempts'; break; }
      }
      const acceptance = flush();
      console.log('CAMPAIGN_RESULT', JSON.stringify({profile,mode,diagnosticsEnabled:false,successful,
        attempts:rows.length,stopReason,programMenuSelections,optionChoiceSelections,acceptance,finalState:snapshot()}));
      expect(acceptance.passed, acceptance.reasons.join('; ')).toBe(true);
    } finally { invalidatePreplans(); unmount(); vi.unstubAllGlobals(); }
  }, 7_200_000);
});
