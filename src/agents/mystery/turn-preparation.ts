import { DEFAULT_CONTEXT_TOKENS, getMaxOutputTokens } from '../../sillytavern/token-budget';
import type { AppSettings, ChatPreset, ChatMessage, DynamicRecord, GameStatus, CurrentState, EndingCheckContext } from '../../sillytavern/types';
import { gameLocations, getLocationById, getLocationBackground } from '../../data/locations';
import { appendResourcePrompt } from '../../utils/resourcePrompt';
import { buildNpcPlayerKnowledgeBrief, doesPlayerIntroduceName, formatNpcPlayerKnowledgeDirective, type PlayerIdentity } from '../../data/npcPlayerKnowledge';
import { buildScheduledDirectives, nextScheduledBoundary, planQuietWait } from '../../engine/scheduled-events';
import { advanceClock } from '../../engine/game-clock';
import { buildNarrativeClock } from '../../engine/narrative-contract';
import { OPENING_MAINTEXT, OPENING_PUBLIC_CONTINUITY } from '../../engine/opening-storyline';
import { translateForDirector } from '../../engine/variable-thresholds';
import { buildPlayerKnowledgeBrief } from '../../data/playerKnowledge';
import { evaluatePlayerIntent } from '../../engine/player-intent-policy';
import { resolveExecutedActionNarrativeContext, type ActionNarrativeContext } from '../../engine/action-narrative-context';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';
import {
  buildInvestigationOpportunities,
  findInvestigationOpportunity,
  projectPublicInvestigationOpportunities,
  type BuildInvestigationOpportunitiesInput,
  type InvestigationOpportunity,
  type OpportunityProgress,
} from '../../engine/investigation-opportunities';
import {
  buildPendingActionSceneContext,
  pendingSceneContextFromSaved,
  selectContinuationSceneContext,
  type ActionSceneContinuity,
  type PendingActionSceneContext,
} from '../../engine/action-scene-continuity';
import type { ActionAuthorityContext } from './action-authority';
import { isNonWorkResolution } from './action-authority';
import { compileTurnContext, type TurnContextBundle } from '../../memory/world-memory';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import { REVEAL_LEVELS, type RevealLevel, type MysteryRouteId, type MysteryOverlayId, type TruthContext } from './types';
import type { AgentNarrativeMode, PrepareMysteryTurnOptions } from './orchestrator';
import type { ApiConfig } from '../../sillytavern/api-router';
import { buildProgramChecklistActions } from '../../engine/opportunity-integration';
import { commitmentBoundariesFromVariables } from '../../engine/commitment-boundaries';
import type { ProgramChecklistAction } from './scene-list';
const mysteryFactIds = new Set(MYSTERY_TRUTH_GRAPH.facts.map(fact => fact.id));
const npcIdsByLocation: Record<string, string[]> = {
  supermarket: ['chen-huihui'],
  'community-hospital': ['detective-b'],
  school: ['school-guard'],
  'mountain-trail': ['morning-witness'],
  'senpai-building': ['touko'],
  'old-man-building': ['old-man'],
  'detective-inn': ['detective-a', 'detective-b'],
  'water-tower': ['detective-a'],
};

export function resolveMysteryLocation(background: string | null): string {
  const normalized = (background ?? '').replace(/\.png$/i, '');
  if (!normalized || normalized.startsWith('home') || normalized.startsWith('bedroom')) return 'home';
  const location = gameLocations.find(candidate =>
    [candidate.id, candidate.background, candidate.dayBackground, candidate.nightBackground]
      .filter(Boolean)
      .includes(normalized)
  );
  return location?.id ?? 'home';
}

function readLockedRoute(variables: DynamicRecord): MysteryRouteId | null {
  const value = variables.lockedRoute ?? variables.mysteryRoute;
  return value === 'A' || value === 'B' || value === 'C' || value === 'NONE' || value === 'FAKE'
    ? value
    : null;
}

export function readPlayerKnowledge(variables: DynamicRecord, clueIds: string[]): Record<string, RevealLevel> {
  const result: Record<string, RevealLevel> = {};
  const stored = variables.mysteryKnowledge;
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [id, level] of Object.entries(stored)) {
      if (mysteryFactIds.has(id) && REVEAL_LEVELS.includes(level as RevealLevel)) {
        result[id] = level as RevealLevel;
      }
    }
  }
  for (const id of clueIds) {
    if (mysteryFactIds.has(id) && !result[id]) result[id] = 'clue';
  }
  return result;
}

function readActiveOverlay(variables: DynamicRecord): MysteryOverlayId | null {
  return variables.overlay === 'CULT' || variables.overlay === 'PSYCH'
    ? variables.overlay
    : null;
}

export function resolveAnalysisApi(settings: AppSettings) {
  // 导演/审查是结构化 JSON 任务,优先走次 API(便宜模型),未配置时回退主 API
  const sec = settings.api.secondary;
  return sec?.enabled && sec.apiKey && sec.baseUrl
    ? { baseUrl: sec.baseUrl, apiKey: sec.apiKey, model: sec.model }
    : { baseUrl: settings.api.baseUrl, apiKey: settings.api.apiKey, model: settings.api.model };
}

function readConfirmedPlayerIdentity(settings: AppSettings): PlayerIdentity | undefined {
  if (!settings.playerIdentityConfirmed || !settings.userName.trim()) return undefined;
  if (settings.playerGender !== 'male' && settings.playerGender !== 'female') return undefined;
  return { name: settings.userName.trim(), gender: settings.playerGender };
}


export interface TurnPreparationInput {
  userInput: string; settings: AppSettings; activePreset: ChatPreset | null;
  variables: DynamicRecord; gameStatus: GameStatus; currentState: CurrentState;
  endingCheckContext: EndingCheckContext; history: ChatMessage[];
  pendingNarrativeContext?: ActionNarrativeContext | null; hasPendingAction?: boolean;
  actionSelection?: ActionAuthorityContext['selection']; originalActionInput?: string;
  resumeActionId?: string;
}

export interface ExecutedTurnProjection {
  truthContext: TruthContext;
  turnContext: Record<string, unknown>;
  presentationContext: Record<string, unknown>;
  actionNarrativeContext: ActionNarrativeContext | null;
  narrativeVariables: DynamicRecord;
  narrativeBackground: string | null;
  mysteryLocation: string;
  activeNpcIds: string[];
  /** Cast for work actually executed at each location, independent of the physical end anchor. */
  segmentNpcIdsByLocation?: Record<string, string[]>;
  /** Program-only original scene contracts for a possible unfinished action. */
  pendingActionSceneContext?: PendingActionSceneContext;
  npcPlayerKnowledge: ReturnType<typeof buildNpcPlayerKnowledgeBrief>;
  knownByNpcIds: Set<string>;
  contextBundle: TurnContextBundle;
  /** Private source-bearing candidates. Model contexts receive only their public projection. */
  legalOpportunityMap: Readonly<Record<string, InvestigationOpportunity>>;
  legalProgramActionMap: Readonly<Record<string, ProgramChecklistAction>>;
}

export function normalizeOpportunityProgress(value: unknown, cycleCount: number): OpportunityProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { cycleCount, completedIds: [], noProgressByTopic: {}, settledResolutionIds: [] };
  }
  const candidate = value as Partial<OpportunityProgress>;
  if (candidate.cycleCount !== cycleCount) {
    return { cycleCount, completedIds: [], noProgressByTopic: {}, settledResolutionIds: [] };
  }
  const noProgressByTopic = candidate.noProgressByTopic && typeof candidate.noProgressByTopic === 'object'
    && !Array.isArray(candidate.noProgressByTopic)
    ? Object.fromEntries(Object.entries(candidate.noProgressByTopic)
        .filter(([key, count]) => !!key && Number.isInteger(count) && Number(count) >= 0)
        .map(([key, count]) => [key, Number(count)]))
    : {};
  return {
    cycleCount,
    completedIds: Array.isArray(candidate.completedIds)
      ? [...new Set(candidate.completedIds.filter((id): id is string => typeof id === 'string' && !!id))] : [],
    noProgressByTopic,
    settledResolutionIds: Array.isArray(candidate.settledResolutionIds)
      ? [...new Set(candidate.settledResolutionIds.filter((id): id is string => typeof id === 'string' && !!id))] : [],
  };
}

function immutableOpportunityMap(opportunities: readonly InvestigationOpportunity[]): Readonly<Record<string, InvestigationOpportunity>> {
  return Object.freeze(Object.fromEntries(opportunities.map(opportunity => [
    opportunity.id,
    Object.freeze({ ...opportunity, sourceIds: Object.freeze([...opportunity.sourceIds]) }) as InvestigationOpportunity,
  ])));
}

function immutableProgramActionMap(actions: readonly ProgramChecklistAction[]): Readonly<Record<string, ProgramChecklistAction>> {
  return Object.freeze(Object.fromEntries(actions.map(action => [action.id, Object.freeze({ ...action })])));
}

function validateSelectedOpportunityBeforeScene(
  input: TurnPreparationInput,
  currentLocationId: string,
  cycleCount: number,
): InvestigationOpportunity | undefined {
  const selection = input.actionSelection;
  if (!selection?.opportunityId) return undefined;
  const knownClueIds = (Array.isArray(input.endingCheckContext.unlockedClues)
    ? input.endingCheckContext.unlockedClues : []).filter(id => mysteryFactIds.has(id));
  const playerIdentity = readConfirmedPlayerIdentity(input.settings);
  const truthContext: TruthContext = {
    cycleCount,
    currentLocation: currentLocationId,
    lockedRoute: readLockedRoute(input.variables),
    unlockedClueIds: knownClueIds,
    playerKnowledge: readPlayerKnowledge(input.variables, knownClueIds),
    suspicion: {
      ...input.endingCheckContext.suspicion,
      ...(input.variables.suspicion && typeof input.variables.suspicion === 'object'
        ? input.variables.suspicion : {}),
    },
    affinity: {
      ...input.endingCheckContext.affinity,
      ...(input.variables.affinity && typeof input.variables.affinity === 'object'
        ? input.variables.affinity : {}),
    },
    tripProgress: Number(input.variables.tripProgress ?? 0),
    sanity: input.gameStatus.sanity,
    activeOverlay: readActiveOverlay(input.variables),
    activeNpcIds: [],
    playerPresentation: buildPlayerKnowledgeBrief({ ...input.variables, location: currentLocationId }),
    playerIdentity,
    playerIdentityVariables: input.variables,
  };
  const exact = findInvestigationOpportunity({
    graph: MYSTERY_TRUTH_GRAPH,
    context: truthContext,
    progress: normalizeOpportunityProgress(input.variables.opportunityProgress, cycleCount),
    currentTime: input.gameStatus.time.toISOString(),
    stamina: input.gameStatus.stamina,
    nextBoundary: nextScheduledBoundary(
      input.gameStatus.time.toISOString(), input.variables, commitmentBoundariesFromVariables(input.variables),
    ),
  }, selection.opportunityId);
  if (!exact) throw new Error('所选调查机会已经失效。');
  if (selection.kind !== 'investigation'
    || selection.scope !== exact.scope
    || selection.locationId !== exact.locationId) {
    throw new Error('所选调查机会元数据与当前合法机会不匹配。');
  }
  return exact;
}
/** Old saves predate the public ledger. Trust only the exact mandatory assistant
 * opening, never a player quote or parsed-only claim. Legacy panels were nested
 * inside maintext, but their optional contents do not confer any knowledge.
 */
function hasOfficialOpeningHistory(history: ChatMessage[]): boolean {
  return history.some(message => {
    if (message.role !== 'assistant') return false;
    const maintext = message.content.match(/^\s*<maintext>([\s\S]*?)<\/maintext>/)?.[1];
    if (!maintext) return false;
    const mandatoryText = maintext
      .replace(/<(observe|investigate|action)>[\s\S]*?<\/\1>/g, '')
      .replace(/\r\n/g, '\n')
      .trim();
    return mandatoryText === OPENING_MAINTEXT;
  });
}

/** Both foreground and speculative callers use the identical authority inputs. */
interface ProjectionSceneState {
  proposed: ActionNarrativeContext | null;
  pendingActionSceneContext: PendingActionSceneContext;
  savedContinuation?: import('../../engine/action-resolution').ActionContinuation;
}

function buildProjection(input: TurnPreparationInput, sceneState: ProjectionSceneState, execution?: {
  resolution: ResolvedActionOutcome;
}) {
  const { userInput, settings, activePreset, history } = input;
  const tavern = { variables: input.variables };
  const game = { gameStatus: input.gameStatus, currentState: input.currentState, endingCheckContext: input.endingCheckContext };
  const proposed = sceneState.proposed;
  const resolution = execution?.resolution;
  const nonWork = !!resolution && isNonWorkResolution(resolution);
  const resolutionTransit = !!resolution?.segments.some(segment => segment.step.kind === 'travel'
    && segment.executedMinutes > 0 && !segment.completed);
  const savedActiveStep = sceneState.savedContinuation?.steps
    .find(step => step.id === sceneState.savedContinuation?.activeStepId);
  const preservesSavedWork = !!resolution
    && resolution.startLocationId === resolution.endLocationId
    && sceneState.savedContinuation?.expectedLocationId === resolution.endLocationId
    && new Date(resolution.startTime).toDateString() === new Date(resolution.endTime).toDateString()
    && resolution.segments.every(segment => segment.step.kind === 'event' || segment.step.kind === 'wait');
  const savedTransit = preservesSavedWork && savedActiveStep?.kind === 'travel'
    && (sceneState.savedContinuation?.completedMinutesByStep[savedActiveStep.id] ?? 0) > 0;
  const transit = resolutionTransit || savedTransit;
  const executionContext = resolution && !transit
    ? sceneState.pendingActionSceneContext.contextsByLocation[resolution.endLocationId] ?? proposed
    : proposed;
  let actionNarrativeContext = resolution
    ? resolveExecutedActionNarrativeContext(executionContext, resolution) : proposed;
  if (transit) actionNarrativeContext = null;
  if (nonWork) actionNarrativeContext = null;
  if (resolution && actionNarrativeContext && resolution.segments.some(segment => !segment.completed)) {
    const earned = new Set(resolution.completedSourceIds);
    const requiredKnowledgeEvents = actionNarrativeContext.sceneContract.requiredKnowledgeEvents
      .filter(event => earned.has(`accepted-event:${event.eventId}`));
    const directive = `实际到达${actionNarrativeContext.locationId}，本次只执行了${resolution.executedMinutes}分钟，调查尚未全部完成。仅演绎已执行的阶段；不得预支调查结果。只允许在正文实际呈现以下已获准认知事件：${requiredKnowledgeEvents.map(event => event.evidence).join('；') || '无新增认知事件'}。`;
    actionNarrativeContext = { ...actionNarrativeContext, directive,
      sceneContract: { ...actionNarrativeContext.sceneContract, requiredKnowledgeEvents, directive } };
  }
  const actualLocation = resolution?.endLocationId ?? actionNarrativeContext?.locationId;
  const narrativeVariables = actualLocation
    ? { ...tavern.variables, location: actualLocation,
      ...(resolution ? { stamina: resolution.resources.after.stamina, sanity: resolution.resources.after.sanity } : {}) }
    : tavern.variables;
  const actualLocationData = actualLocation ? getLocationById(actualLocation) : undefined;
  const narrativeBackground = transit ? 'street' : actionNarrativeContext?.background
    ?? (resolution && actualLocationData ? getLocationBackground(actualLocationData, new Date(resolution.endTime)) : game.currentState.background);
  const scheduledDirectives = buildScheduledDirectives(narrativeVariables);
  const intentPolicy = evaluatePlayerIntent(userInput, narrativeVariables);
  const hadPendingDeathNews = tavern.variables.deathNews === 'pending';
  const clock = buildNarrativeClock(game.gameStatus.time, Number(tavern.variables.cycleCount ?? 1));
  const openingIds = new Set(Array.isArray(tavern.variables.openingPublicContinuity)
    ? tavern.variables.openingPublicContinuity.map((fact: { id?: unknown }) => fact?.id) : []);
  const recoverOpening = tavern.variables.openingPublicContinuity === undefined && hasOfficialOpeningHistory(history);
  const publicContinuity = OPENING_PUBLIC_CONTINUITY.filter(fact => recoverOpening || openingIds.has(fact.id));
  const historyMessages = history;
  const agentMode: AgentNarrativeMode = settings.agentNarrativeMode ?? 'standard';
  const mysteryLocation = actualLocation ?? resolveMysteryLocation(narrativeBackground);
  const activeNpcIds = transit || nonWork ? [] : [...new Set([
    ...(npcIdsByLocation[mysteryLocation] ?? []),
    ...(actionNarrativeContext?.requiredNpcIds ?? []),
    ...(actionNarrativeContext?.enRouteNpcIds ?? []),
  ])];
  const segmentNpcIdsByLocation: Record<string, string[]> = {};
  if (resolution) {
    for (const segment of resolution.segments) {
      if (segment.executedMinutes <= 0 || !['inquiry', 'investigation', 'search'].includes(segment.step.kind)) continue;
      const locationId = segment.step.locationId;
      const originalContext = sceneState.pendingActionSceneContext.contextsByLocation[locationId];
      segmentNpcIdsByLocation[locationId] = [...new Set([
        ...(npcIdsByLocation[locationId] ?? []),
        ...(originalContext?.requiredNpcIds ?? []),
      ])];
    }
  }
  const playerIdentity = readConfirmedPlayerIdentity(settings);
  const introducesPlayerName = doesPlayerIntroduceName(userInput, playerIdentity);
  const knownByNpcIds = new Set(Array.isArray(narrativeVariables.playerNameKnownByNpcIds)
    ? narrativeVariables.playerNameKnownByNpcIds.filter((id): id is string => typeof id === 'string')
    : []);
  if (introducesPlayerName) activeNpcIds.forEach(id => knownByNpcIds.add(id));
  const playerIdentityVariables = {
    ...narrativeVariables,
    playerNameKnownByNpcIds: [...knownByNpcIds],
  };
  const npcPlayerKnowledge = buildNpcPlayerKnowledgeBrief(activeNpcIds, playerIdentity, playerIdentityVariables);
  const basePromptUserInput = appendResourcePrompt(execution ? input.originalActionInput ?? userInput : userInput, narrativeBackground, narrativeVariables)
    + `\n\n${clock.directive}`
    + (actionNarrativeContext ? `\n\n${actionNarrativeContext.directive}` : '')
    + (npcPlayerKnowledge.length ? `\n\n${formatNpcPlayerKnowledgeDirective(npcPlayerKnowledge)}` : '')
    + `\n\n[玩家意图裁决] ${intentPolicy.directorDirective}`
    + (scheduledDirectives.length ? '\n\n' + scheduledDirectives.map(l => `[系统指令] ${l}`).join('\n') : '');
  const contextBundle: TurnContextBundle = compileTurnContext({
    userInput,
    locationId: mysteryLocation,
    activeNpcIds,
    history: historyMessages,
    variables: narrativeVariables,
    maxContext: Number(activePreset?.settings?.openai_max_context ?? DEFAULT_CONTEXT_TOKENS),
    reservedOutput: getMaxOutputTokens(activePreset),
    fixedPromptText: `${basePromptUserInput}\n${settings.formatPromptTemplate ?? ''}`,
  });

  const knownClueIds = (Array.isArray(game.endingCheckContext.unlockedClues)
    ? game.endingCheckContext.unlockedClues
    : []).filter(id => mysteryFactIds.has(id));
  const playerPresentation = buildPlayerKnowledgeBrief({ ...narrativeVariables, location: mysteryLocation });
  const truthContext: TruthContext = {
    cycleCount: Number(narrativeVariables.cycleCount ?? game.endingCheckContext.cycleCount ?? 1),
    currentLocation: mysteryLocation,
    lockedRoute: readLockedRoute(narrativeVariables),
    unlockedClueIds: knownClueIds,
    playerKnowledge: readPlayerKnowledge(narrativeVariables, knownClueIds),
    suspicion: {
      ...game.endingCheckContext.suspicion,
      ...(narrativeVariables.suspicion && typeof narrativeVariables.suspicion === 'object'
        ? narrativeVariables.suspicion
        : {}),
    },
    affinity: {
      ...game.endingCheckContext.affinity,
      ...(narrativeVariables.affinity && typeof narrativeVariables.affinity === 'object'
        ? narrativeVariables.affinity
        : {}),
    },
    tripProgress: Number(narrativeVariables.tripProgress ?? 0),
    sanity: game.gameStatus.sanity,
    activeOverlay: readActiveOverlay(narrativeVariables),
    activeNpcIds,
    playerPresentation,
    playerIdentity,
    playerIdentityVariables,
    sceneContract: actionNarrativeContext?.sceneContract,
  };
  const opportunityTime = resolution?.endTime ?? game.gameStatus.time.toISOString();
  const opportunityProgress = normalizeOpportunityProgress(narrativeVariables.opportunityProgress, truthContext.cycleCount);
  const opportunityInput: BuildInvestigationOpportunitiesInput = {
    graph: MYSTERY_TRUTH_GRAPH,
    context: truthContext,
    progress: opportunityProgress,
    currentTime: opportunityTime,
    stamina: resolution?.resources.after.stamina ?? game.gameStatus.stamina,
    nextBoundary: nextScheduledBoundary(
      opportunityTime, narrativeVariables, commitmentBoundariesFromVariables(narrativeVariables),
    ),
  };
  const opportunities = buildInvestigationOpportunities(opportunityInput);
  const requestedOpportunityId = input.actionSelection?.opportunityId;
  if (requestedOpportunityId) {
    const exact = findInvestigationOpportunity(opportunityInput, requestedOpportunityId);
    if (!exact) throw new Error('所选调查机会已经失效。');
    if (!opportunities.some(opportunity => opportunity.id === exact.id)) opportunities.push(exact);
  }
  const legalOpportunityMap = immutableOpportunityMap(opportunities);
  const publicOpportunities = projectPublicInvestigationOpportunities(opportunities);
  const programActions = buildProgramChecklistActions({
    currentLocationId: truthContext.currentLocation,
    currentTime: opportunityTime,
    variables: narrativeVariables,
    stamina: resolution?.resources.after.stamina ?? game.gameStatus.stamina,
    publicLocations: truthContext.playerPresentation?.locations ?? [],
    opportunities,
    commitmentBoundaries: commitmentBoundariesFromVariables(narrativeVariables),
  });
  const legalProgramActionMap = immutableProgramActionMap(programActions);
  const opportunityPolicy = publicOpportunities[0]
    ? `公开调查机会已按程序优先级排序。若玩家没有指定其他目标，下一组选项的首项必须关联 ${publicOpportunities[0].id}，逐字复制其 id 与 scope；不得让休息或长等待排在可负担的新调查之前。`
    : '当前程序清单暂无新的明确调查目标；这不表示世界中没有可调查内容。保留玩家自由输入，并可提供公开通用行动。';
  const recentHistory = contextBundle.recentMessages.map(message => ({ role: message.role, content: message.content }));
  const analysisApi = resolveAnalysisApi(settings);

  const request: Omit<PrepareMysteryTurnOptions, 'abortSignal' | 'speculative'> & {
    pendingActionSceneContext?: PendingActionSceneContext;
  } = {
    mode: agentMode,
    api: analysisApi,
    preset: activePreset,
    truthContext,
    turnContext: {
      playerInput: userInput,
      playerIntentPolicy: intentPolicy,
      sceneContract: actionNarrativeContext?.sceneContract,
      recentHistory,
      memoryContext: contextBundle.directorMemory,
      contextSelectionIds: contextBundle.selectedIds,
      requiresStateAgent: true,
      clock,
      publicContinuity,
      gameStatus: {
        time: game.gameStatus.time.toISOString(),
        stamina: game.gameStatus.stamina,
        sanity: game.gameStatus.sanity,
      },
      investigation: game.endingCheckContext.investigation,
      publicOpportunities,
      programActions,
      opportunityPolicy,
      thresholdDirectives: translateForDirector(tavern.variables)
        + (scheduledDirectives.length ? '\n' + scheduledDirectives.map(l => `- ${l}`).join('\n') : ''),
    },
    presentationContext: {
      clock,
      publicContinuity,
      playerInput: userInput,
      recentHistory,
      currentLocation: truthContext.currentLocation,
      currentBackground: narrativeBackground,
      currentSpeaker: game.currentState.speaker,
      userName: settings.userName,
      characterName: settings.characterName,
      resourceInstructions: basePromptUserInput,
      playerIntentPolicy: intentPolicy,
      memoryContext: contextBundle.writerMemory,
      contextSelectionIds: contextBundle.selectedIds,
      publicOpportunities,
      programActions,
    },
    formatPrompt: settings.formatPromptTemplate,
    pendingActionSceneContext: structuredClone(sceneState.pendingActionSceneContext),
    legalOpportunityMap,
    legalProgramActionMap,

  };
  return { request, actionNarrativeContext, narrativeVariables, narrativeBackground, intentPolicy,
    hadPendingDeathNews, mysteryLocation, activeNpcIds, playerIdentity, introducesPlayerName,
    knownByNpcIds, npcPlayerKnowledge, contextBundle, segmentNpcIdsByLocation,
    legalOpportunityMap, legalProgramActionMap };
}

/** The callback and its immutable source snapshot stay in the in-memory preparation cache. */
export function buildTurnPreparation(input: TurnPreparationInput) {
  const snapshot = structuredClone(input);
  const cycleCount = Number(snapshot.variables.cycleCount ?? 1);
  const startTime = advanceClock(snapshot.gameStatus.time.toISOString(), 0);
  const currentLocationId = typeof snapshot.variables.location === 'string'
    ? snapshot.variables.location : resolveMysteryLocation(snapshot.currentState.background);
  const continuity = snapshot.variables.actionContinuity?.cycleCount === cycleCount ? snapshot.variables.actionContinuity : undefined;
  const savedSceneContext: ActionSceneContinuity | null | undefined = continuity?.sceneContext;
  const validSavedScene = savedSceneContext
    && continuity?.continuation
    && savedSceneContext.actionId === continuity.continuation.actionId
    && savedSceneContext.cycleCount === cycleCount
    ? savedSceneContext : undefined;
  const isResume = !!snapshot.resumeActionId
    && snapshot.resumeActionId === continuity?.continuation?.actionId
    && snapshot.resumeActionId === validSavedScene?.actionId;
  const preselectedOpportunity = isResume
    ? undefined
    : validateSelectedOpportunityBeforeScene(snapshot, currentLocationId, cycleCount);
  let pendingActionSceneContext = isResume && validSavedScene
    ? pendingSceneContextFromSaved(validSavedScene)
    : buildPendingActionSceneContext(
        preselectedOpportunity?.publicGoal ?? snapshot.originalActionInput ?? snapshot.userInput,
        snapshot.gameStatus.time,
        {
          currentLocationId,
          cycleCount,
          knowledgeEvents: snapshot.variables.knowledgeEvents,
          destinationLocationId: preselectedOpportunity?.locationId,
        },
      );
  if (!isResume && snapshot.pendingNarrativeContext) {
    pendingActionSceneContext = {
      ...pendingActionSceneContext,
      contextsByLocation: {
        ...pendingActionSceneContext.contextsByLocation,
        [snapshot.pendingNarrativeContext.locationId]: structuredClone(snapshot.pendingNarrativeContext),
      },
    };
  }
  const proposed = isResume
    ? selectContinuationSceneContext(validSavedScene, continuity?.continuation)
    : snapshot.pendingNarrativeContext
      ?? Object.values(pendingActionSceneContext.contextsByLocation)[0]
      ?? null;
  const sceneState: ProjectionSceneState = {
    proposed: proposed ? structuredClone(proposed) : null,
    pendingActionSceneContext: structuredClone(pendingActionSceneContext),
    savedContinuation: continuity?.continuation ? structuredClone(continuity.continuation) : undefined,
  };
  const prepared = buildProjection(snapshot, structuredClone(sceneState));
  const continuedOpportunityId = continuity?.continuation?.steps.find(step => step.opportunityId)?.opportunityId;
  let selectedOpportunity: InvestigationOpportunity | undefined;
  let selectedProgramAction: ProgramChecklistAction | undefined;
  if (isResume && continuedOpportunityId) {
    const saved = continuity?.selectedOpportunity;
    if (!saved || saved.id !== continuedOpportunityId) throw new Error('未完成调查缺少原始机会快照。');
    selectedOpportunity = structuredClone(saved);
    prepared.request.legalOpportunityMap = immutableOpportunityMap([
      ...Object.values(prepared.request.legalOpportunityMap ?? {}),
      selectedOpportunity,
    ]);
  } else if (snapshot.actionSelection?.opportunityId) {
    selectedOpportunity = preselectedOpportunity;
    if (!selectedOpportunity) throw new Error('所选调查机会已经失效。');
    const selection = snapshot.actionSelection;
    if (selection.kind !== 'investigation'
      || selection.scope !== selectedOpportunity.scope
      || selection.locationId !== selectedOpportunity.locationId) {
      throw new Error('所选调查机会元数据与当前合法机会不匹配。');
    }
    selectedOpportunity = structuredClone(selectedOpportunity);
  }
  if (!snapshot.actionSelection?.opportunityId && snapshot.actionSelection?.actionId) {
    selectedProgramAction = prepared.request.legalProgramActionMap?.[snapshot.actionSelection.actionId];
    if (!selectedProgramAction) throw new Error('所选程序行动已经失效。');
    const selection = snapshot.actionSelection;
    if (selection.kind !== selectedProgramAction.kind
      || selection.scope !== selectedProgramAction.scope
      || selection.locationId !== selectedProgramAction.locationId
      || selection.requestedMinutes !== selectedProgramAction.requestedMinutes) {
      throw new Error('所选程序行动元数据与当前合法行动不匹配。');
    }
    selectedProgramAction = structuredClone(selectedProgramAction);
  }
  const quietWaitDecision = planQuietWait({
    time: startTime,
    variables: snapshot.variables,
    commitmentBoundaries: commitmentBoundariesFromVariables(snapshot.variables),
    opportunities: Object.values(prepared.request.legalOpportunityMap ?? {}),
  });
  const actionAuthority: ActionAuthorityContext = {
    cycleCount, startTime, currentLocationId, stamina: snapshot.gameStatus.stamina, sanity: snapshot.gameStatus.sanity,
    originalInput: snapshot.originalActionInput ?? snapshot.userInput,
    deathNews: typeof snapshot.variables.deathNews === 'string' ? snapshot.variables.deathNews : undefined,
    proposedScene: prepared.actionNarrativeContext,
    nextBoundary: nextScheduledBoundary(
      startTime, snapshot.variables, commitmentBoundariesFromVariables(snapshot.variables),
    ),
    appliedEventEffectIds: continuity?.appliedEventEffectIds ?? [],
    continuation: continuity?.continuation ?? undefined,
    pendingAuthorization: continuity?.pendingAuthorization ?? undefined,
    resumeActionId: snapshot.resumeActionId,
    fantasy: prepared.intentPolicy.mode === 'fantasy',
    selection: snapshot.actionSelection,
    selectedOpportunity,
    selectedProgramAction,
    quietWaitDecision,
    inputOrigin: snapshot.hasPendingAction ? 'menu' : 'player',
  };
  prepared.request.actionAuthority = actionAuthority;
  // Exact comparison, not a collision-prone digest. No credentials are added;
  // API/preset/format configuration is already covered by the outer request key.
  prepared.request.executionFingerprint = JSON.stringify({
    userInput: snapshot.userInput, variables: snapshot.variables, history: snapshot.history,
    gameStatus: snapshot.gameStatus, currentState: snapshot.currentState, endingCheckContext: snapshot.endingCheckContext,
    identity: { userName: snapshot.settings.userName, playerGender: snapshot.settings.playerGender,
      confirmed: snapshot.settings.playerIdentityConfirmed, characterName: snapshot.settings.characterName },
    budget: snapshot.activePreset?.settings,
  });
  prepared.request.projectExecution = resolution => {
    const projectedSceneState = isNonWorkResolution(resolution) && validSavedScene
      ? { ...sceneState, pendingActionSceneContext: pendingSceneContextFromSaved(validSavedScene) }
      : sceneState;
    const projected = buildProjection(snapshot, projectedSceneState, { resolution });
    return {
      truthContext: projected.request.truthContext, turnContext: projected.request.turnContext,
      presentationContext: projected.request.presentationContext,
      actionNarrativeContext: projected.actionNarrativeContext, narrativeVariables: projected.narrativeVariables,
      narrativeBackground: projected.narrativeBackground, mysteryLocation: projected.mysteryLocation,
      activeNpcIds: projected.activeNpcIds, npcPlayerKnowledge: projected.npcPlayerKnowledge,
      knownByNpcIds: projected.knownByNpcIds, contextBundle: projected.contextBundle,
      legalOpportunityMap: projected.legalOpportunityMap,
      legalProgramActionMap: projected.legalProgramActionMap,
      segmentNpcIdsByLocation: projected.segmentNpcIdsByLocation,
      pendingActionSceneContext: projected.request.pendingActionSceneContext,
    };
  };
  return prepared;
}

/** Exact, stable, in-memory comparison; never write this credential-bearing key to logs. */
export function preparationContextKey(chatId: string | null, request: Omit<PrepareMysteryTurnOptions, 'abortSignal' | 'speculative'>, writerApi?: ApiConfig): string {
  function canonical(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
    return value;
  }
  return JSON.stringify(canonical({ chatId, writerApi, ...request }));
}
