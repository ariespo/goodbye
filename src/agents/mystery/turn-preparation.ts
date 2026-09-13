import { DEFAULT_CONTEXT_TOKENS, getMaxOutputTokens } from '../../sillytavern/token-budget';
import type { AppSettings, ChatPreset, ChatMessage, DynamicRecord, GameStatus, CurrentState, EndingCheckContext } from '../../sillytavern/types';
import { gameLocations, getLocationById, getLocationBackground } from '../../data/locations';
import { appendResourcePrompt } from '../../utils/resourcePrompt';
import { buildNpcPlayerKnowledgeBrief, doesPlayerIntroduceName, formatNpcPlayerKnowledgeDirective, type PlayerIdentity } from '../../data/npcPlayerKnowledge';
import { buildScheduledDirectives, nextScheduledBoundary } from '../../engine/scheduled-events';
import { advanceClock } from '../../engine/game-clock';
import { buildNarrativeClock } from '../../engine/narrative-contract';
import { OPENING_MAINTEXT, OPENING_PUBLIC_CONTINUITY } from '../../engine/opening-storyline';
import { translateForDirector } from '../../engine/variable-thresholds';
import { buildPlayerKnowledgeBrief } from '../../data/playerKnowledge';
import { evaluatePlayerIntent } from '../../engine/player-intent-policy';
import { resolveActionNarrativeContext, resolveExecutedActionNarrativeContext, type ActionNarrativeContext } from '../../engine/action-narrative-context';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';
import type { ActionAuthorityContext } from './action-authority';
import { isNonWorkResolution } from './action-authority';
import { compileTurnContext, type TurnContextBundle } from '../../memory/world-memory';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import { REVEAL_LEVELS, type RevealLevel, type MysteryRouteId, type MysteryOverlayId, type TruthContext } from './types';
import type { AgentNarrativeMode, PrepareMysteryTurnOptions } from './orchestrator';
import type { ApiConfig } from '../../sillytavern/api-router';
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
  npcPlayerKnowledge: ReturnType<typeof buildNpcPlayerKnowledgeBrief>;
  knownByNpcIds: Set<string>;
  contextBundle: TurnContextBundle;
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
function buildProjection(input: TurnPreparationInput, execution?: {
  resolution: ResolvedActionOutcome; proposed: ActionNarrativeContext | null;
}) {
  const { userInput, settings, activePreset, history } = input;
  const pendingNarrativeContext = input.pendingNarrativeContext ?? null;
  const tavern = { variables: input.variables };
  const game = { gameStatus: input.gameStatus, currentState: input.currentState, endingCheckContext: input.endingCheckContext };
  const currentLocationId = typeof tavern.variables.location === 'string'
    ? tavern.variables.location
    : resolveMysteryLocation(game.currentState.background);
  const proposed = pendingNarrativeContext ?? resolveActionNarrativeContext(
    userInput,
    game.gameStatus.time,
    0,
    {
      currentLocationId,
      cycleCount: Number(tavern.variables.cycleCount ?? game.endingCheckContext.cycleCount ?? 1),
      knowledgeEvents: tavern.variables.knowledgeEvents,
    },
  );
  let actionNarrativeContext = execution
    ? resolveExecutedActionNarrativeContext(execution.proposed, execution.resolution) : proposed;
  const resolution = execution?.resolution;
  const transit = !!resolution?.segments.some(segment => segment.step.kind === 'travel' && !segment.completed);
  const nonWork = !!resolution && isNonWorkResolution(resolution);
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
  const recentHistory = contextBundle.recentMessages.map(message => ({ role: message.role, content: message.content }));
  const analysisApi = resolveAnalysisApi(settings);

  const request: Omit<PrepareMysteryTurnOptions, 'abortSignal' | 'speculative'> = {
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
    },
    formatPrompt: settings.formatPromptTemplate,

  };
  return { request, actionNarrativeContext, narrativeVariables, narrativeBackground, intentPolicy,
    hadPendingDeathNews, mysteryLocation, activeNpcIds, playerIdentity, introducesPlayerName,
    knownByNpcIds, npcPlayerKnowledge, contextBundle };
}

/** The callback and its immutable source snapshot stay in the in-memory preparation cache. */
export function buildTurnPreparation(input: TurnPreparationInput) {
  const snapshot = structuredClone(input);
  const prepared = buildProjection(snapshot);
  const cycleCount = Number(snapshot.variables.cycleCount ?? 1);
  const startTime = advanceClock(snapshot.gameStatus.time.toISOString(), 0);
  const currentLocationId = typeof snapshot.variables.location === 'string'
    ? snapshot.variables.location : resolveMysteryLocation(snapshot.currentState.background);
  const continuity = snapshot.variables.actionContinuity?.cycleCount === cycleCount ? snapshot.variables.actionContinuity : undefined;
  const actionAuthority: ActionAuthorityContext = {
    cycleCount, startTime, currentLocationId, stamina: snapshot.gameStatus.stamina, sanity: snapshot.gameStatus.sanity,
    originalInput: snapshot.originalActionInput ?? snapshot.userInput,
    deathNews: typeof snapshot.variables.deathNews === 'string' ? snapshot.variables.deathNews : undefined,
    proposedScene: prepared.actionNarrativeContext,
    nextBoundary: nextScheduledBoundary(startTime, snapshot.variables),
    appliedEventEffectIds: continuity?.appliedEventEffectIds ?? [],
    continuation: continuity?.continuation ?? undefined,
    pendingAuthorization: continuity?.pendingAuthorization ?? undefined,
    resumeActionId: snapshot.resumeActionId,
    fantasy: prepared.intentPolicy.mode === 'fantasy',
    selection: snapshot.actionSelection,
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
    const projected = buildProjection(snapshot, { resolution, proposed: prepared.actionNarrativeContext });
    return {
      truthContext: projected.request.truthContext, turnContext: projected.request.turnContext,
      presentationContext: projected.request.presentationContext,
      actionNarrativeContext: projected.actionNarrativeContext, narrativeVariables: projected.narrativeVariables,
      narrativeBackground: projected.narrativeBackground, mysteryLocation: projected.mysteryLocation,
      activeNpcIds: projected.activeNpcIds, npcPlayerKnowledge: projected.npcPlayerKnowledge,
      knownByNpcIds: projected.knownByNpcIds, contextBundle: projected.contextBundle,
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
