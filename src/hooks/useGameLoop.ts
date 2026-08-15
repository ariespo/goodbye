import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { assemblePrompt } from '../sillytavern/prompt-assembler';
import { ApiCallError, streamChatCompletion } from '../sillytavern/api-router';
import { augmentWithSecondary } from '../sillytavern/secondary-augment';
import { maintextToScene, mergeParsedIntoScene } from '../engine/scene-parser';
import { translateForDirector } from '../engine/variable-thresholds';
import { sanitizeVarsPatch } from '../sillytavern/vars-validator';
import { createParseState, parseChunk } from '../sillytavern/stream-parser';
import {
  createOutputProtocol,
  formatValidationErrors,
  repairRecoverableOutput,
} from '../sillytavern/output-protocol';
import type { ChatMessage } from '../sillytavern/types';
import { persistActiveChat } from '../utils/chatPersistence';
import { appendResourcePrompt } from '../utils/resourcePrompt';
import { appendCharacterPerformancePrompt } from '../data/characterPerformance';
import {
  buildNpcPlayerKnowledgeBrief,
  doesPlayerIntroduceName,
  formatNpcPlayerKnowledgeDirective,
  npcPlayerKnowledgeError,
  type PlayerIdentity,
} from '../data/npcPlayerKnowledge';
import { parseTimeCost, clampTimeCost } from '../engine/game-clock';
import { buildScheduledDirectives } from '../engine/scheduled-events';
import { settleGameTransaction, type GameResourceCosts } from '../engine/game-transaction';
import { gameLocations } from '../data/locations';
import {
  addKnowledgeEvent,
  addPresentedAuthorizedKnowledgeEvents,
  buildPlayerKnowledgeBrief,
  normalizeKnowledgeEvents,
} from '../data/playerKnowledge';
import {
  consumePreplan,
  invalidatePreplans,
  MYSTERY_TRUTH_GRAPH,
  MysteryPipelineBlockedError,
  prepareMysteryTurn,
  reviewNarrativeAgainstWriterPacket,
  REVEAL_LEVELS,
  startPreplan,
  type AgentNarrativeMode,
  type MysteryOverlayId,
  type MysteryRouteId,
  type PreparedMysteryTurn,
  type RevealLevel,
  type TruthContext,
} from '../agents/mystery';
import type { AppSettings } from '../sillytavern/types';
import {
  generateSceneChecklist,
  insertTagsIntoMaintext,
  mergeSceneChecklist,
  serializeChecklistToTags,
} from '../agents/mystery/scene-list';
import { runStateAgent } from '../agents/state/state-agent';
import { commitGameTransaction } from '../utils/gameTransactionStore';
import { variablesToEndingContext } from '../sillytavern/vars-merger';
import { rebuildSceneFromChat } from '../utils/sceneFromChat';
import { excludeCurrentInputFromHistory } from '../sillytavern/history-cutoff';
import { captureTurnState, resolveTurnRollback } from '../utils/turnStateSnapshot';
import { deriveAuthorizedFactProgress } from '../agents/mystery/knowledge-progression';
import { evaluatePlayerIntent } from '../engine/player-intent-policy';
import {
  applyActionNarrativeKnowledgeFallback,
  actionNarrativeContextError,
  resolveActionNarrativeContext,
  type ActionNarrativeContext,
} from '../engine/action-narrative-context';
import { buildTurnCommit, compileTurnContext, type TurnContextBundle } from '../memory/world-memory';
import type { Scene } from '../sillytavern/types';

const outputProtocol = createOutputProtocol({
  requiredTags: ['maintext', 'option', 'sum'],
  requireMinOptions: 2,
  validateVarsJson: true,
  checkUnclosedTags: true,
});

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

function resolveMysteryLocation(background: string | null): string {
  const normalized = (background ?? '').replace(/\.png$/i, '');
  if (!normalized || normalized.startsWith('home') || normalized.startsWith('bedroom')) return 'home';
  const location = gameLocations.find(candidate =>
    [candidate.id, candidate.background, candidate.dayBackground, candidate.nightBackground]
      .filter(Boolean)
      .includes(normalized)
  );
  return location?.id ?? 'home';
}

function readLockedRoute(variables: Record<string, any>): MysteryRouteId | null {
  const value = variables.lockedRoute ?? variables.mysteryRoute;
  return value === 'A' || value === 'B' || value === 'C' || value === 'NONE' || value === 'FAKE'
    ? value
    : null;
}

function readPlayerKnowledge(variables: Record<string, any>, clueIds: string[]): Record<string, RevealLevel> {
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

function mergeAuthorizedKnowledge(
  variables: Record<string, any>,
  prepared: PreparedMysteryTurn | null,
  presentedKnowledgeEventIds: readonly string[] = [],
  additionalAuthorizedEventIds: readonly string[] = [],
): Record<string, any> {
  const authorizedKnowledgeEventIds = [
    ...(prepared?.writerPacket.authorizedKnowledgeEvents.map(event => event.eventId) ?? []),
    ...additionalAuthorizedEventIds,
  ];
  if (!prepared && authorizedKnowledgeEventIds.length === 0) return variables;
  if (!prepared) {
    return {
      ...variables,
      knowledgeEvents: addPresentedAuthorizedKnowledgeEvents(
        normalizeKnowledgeEvents(variables.knowledgeEvents, variables.unlockedClues),
        presentedKnowledgeEventIds,
        authorizedKnowledgeEventIds,
      ),
    };
  }
  const knowledge = readPlayerKnowledge(variables, Array.isArray(variables.unlockedClues) ? variables.unlockedClues : []);
  const unlockedClues = new Set<string>(Array.isArray(variables.unlockedClues) ? variables.unlockedClues : []);
  for (const fact of prepared.writerPacket.authorizedFacts) {
    const factId = prepared.factAliases.aliasToFactId[fact.id];
    if (!factId) continue;
    const previous = knowledge[factId];
    if (!previous || REVEAL_LEVELS.indexOf(fact.level) > REVEAL_LEVELS.indexOf(previous)) {
      knowledge[factId] = fact.level;
    }
    if (fact.level === 'clue' || fact.level === 'confirmation') unlockedClues.add(factId);
  }
  const knowledgeEvents = addPresentedAuthorizedKnowledgeEvents(
    normalizeKnowledgeEvents(variables.knowledgeEvents, [...unlockedClues]),
    presentedKnowledgeEventIds,
    authorizedKnowledgeEventIds,
  );
  const factProgress = deriveAuthorizedFactProgress(variables, knowledge);
  return {
    ...variables,
    ...factProgress,
    mysteryKnowledge: knowledge,
    unlockedClues: [...unlockedClues],
    knowledgeEvents,
  };
}

function readActiveOverlay(variables: Record<string, any>): MysteryOverlayId | null {
  return variables.overlay === 'CULT' || variables.overlay === 'PSYCH'
    ? variables.overlay
    : null;
}

function finitePositive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function resolveAnalysisApi(settings: AppSettings) {
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

function buildPreplanContextKey(
  mode: AgentNarrativeMode,
  chatId: string | null,
  truthContext: Pick<TruthContext, 'cycleCount' | 'currentLocation' | 'lockedRoute'>,
): string {
  return [
    mode,
    truthContext.cycleCount,
    truthContext.currentLocation,
    truthContext.lockedRoute ?? 'none',
    chatId ?? 'none',
  ].join('|');
}

// 失败回合的编排结果缓存：重试时输入未变则跳过导演/审查重跑
let cachedPreparedTurn: { chatId: string | null; input: string; turn: PreparedMysteryTurn } | null = null;

// 玩家点击调查/行动项时缓存其标注耗时；重试同一输入时仍可命中
let pendingActionCost: {
  chatId: string;
  input: string;
  costs: GameResourceCosts;
  narrativeContext?: ActionNarrativeContext;
} | null = null;

export interface SendMessageOptions {
  isReroll?: boolean;
  /** 重试失败回合：复用已持久化的 user 消息，不重复追加 */
  isRetry?: boolean;
  /** 本回合强制回退 legacy 模式（编排阻塞后的逃生通道） */
  forceLegacy?: boolean;
}

export function useGameLoop() {
  const store = useGameStore();
  const parseStateRef = useRef(createParseState());
  const sendingLockRef = useRef(false);
  // 异步场景清单补全的竞态令牌：值为目标 assistant 消息 id，入口动作会置空使旧回调作废
  const checklistTokenRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (userInput: string, opts?: SendMessageOptions) => {
    if (sendingLockRef.current) {
      return;
    }
    sendingLockRef.current = true;
    checklistTokenRef.current = null;

    const liveStore = useGameStore.getState();
    const { tavern, game, actions } = liveStore;
    const isReroll = opts?.isReroll ?? false;
    const isRetry = opts?.isRetry ?? false;

    try {
      const settings = tavern.settings;
      const activePreset = tavern.presets.find(p => p.id === settings?.activePresetId) || null;

      if (!settings) {
        actions.addNotification({ type: 'error', message: '设置未加载', duration: 4000 });
        return;
      }

      // API 未配置：不发请求、不报错，弹出引导卡（观察等本地操作不经过这里，不受影响）
      if (!settings.api.apiKey || !settings.api.baseUrl) {
        actions.setShowApiGuide(true);
        return;
      }

      const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);
      let baseMessages = activeChat ? [...activeChat.messages] : [];

      // 玩家放弃失败回合、未撤回就直接输入新内容：先自动撤回孤儿 user 消息
      if (!isRetry && !isReroll && liveStore.api.turnRecovery.phase !== 'idle') {
        if (baseMessages.length > 0 && baseMessages[baseMessages.length - 1].role === 'user') {
          baseMessages = baseMessages.slice(0, -1);
          if (activeChat) {
            await persistActiveChat({ messages: baseMessages });
          }
        }
      }
      actions.clearTurnRecovery();

      let messages: ChatMessage[];

      if (isReroll || isRetry) {
        // 重roll/重试: 复用已有聊天记录，不添加新 user 消息
        messages = baseMessages;
      } else {
        const userMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'user',
          content: userInput,
          timestamp: Date.now(),
          variables: { ...tavern.variables },
          turnState: captureTurnState({
            gameStatus: game.gameStatus,
            currentState: game.currentState,
            currentScene: game.currentScene,
            currentLineIndex: game.currentLineIndex,
            sceneComplete: game.sceneComplete,
            variables: tavern.variables,
          }),
        };
        messages = [...baseMessages, userMessage];

        if (activeChat) {
          await persistActiveChat({ messages });
        }
      }

      actions.setIsWaitingForAI(true);
      actions.setApiError(null);
      actions.setStreaming(true);
      parseStateRef.current = createParseState();

      const pendingNarrativeContext = pendingActionCost
        && pendingActionCost.chatId === tavern.activeChatId
        && pendingActionCost.input === userInput
          ? pendingActionCost.narrativeContext ?? null
          : null;
      const currentLocationId = typeof tavern.variables.location === 'string'
        ? tavern.variables.location
        : resolveMysteryLocation(game.currentState.background);
      const actionNarrativeContext = pendingNarrativeContext ?? resolveActionNarrativeContext(
        userInput,
        game.gameStatus.time,
        0,
        {
          currentLocationId,
          cycleCount: Number(tavern.variables.cycleCount ?? game.endingCheckContext.cycleCount ?? 1),
          knowledgeEvents: tavern.variables.knowledgeEvents,
        },
      );
      const narrativeVariables = actionNarrativeContext
        ? { ...tavern.variables, location: actionNarrativeContext.locationId }
        : tavern.variables;
      const narrativeBackground = actionNarrativeContext?.background ?? game.currentState.background;
      const scheduledDirectives = buildScheduledDirectives(narrativeVariables);
      const intentPolicy = evaluatePlayerIntent(userInput, narrativeVariables);
      const hadPendingDeathNews = tavern.variables.deathNews === 'pending';
      const historyMessages = excludeCurrentInputFromHistory(messages, userInput);
      const agentMode: AgentNarrativeMode = opts?.forceLegacy ? 'legacy' : (settings.agentNarrativeMode ?? 'standard');
      const mysteryLocation = actionNarrativeContext?.locationId ?? resolveMysteryLocation(narrativeBackground);
      const activeNpcIds = [...new Set([
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
      const basePromptUserInput = appendResourcePrompt(userInput, narrativeBackground, narrativeVariables)
        + (actionNarrativeContext ? `\n\n${actionNarrativeContext.directive}` : '')
        + (npcPlayerKnowledge.length ? `\n\n${formatNpcPlayerKnowledgeDirective(npcPlayerKnowledge)}` : '')
        + `\n\n[玩家意图裁决] ${intentPolicy.directorDirective}`
        + (scheduledDirectives.length ? '\n\n' + scheduledDirectives.map(l => `[系统指令] ${l}`).join('\n') : '');
      const promptUserInput = agentMode === 'legacy'
        ? appendCharacterPerformancePrompt(
            basePromptUserInput,
            buildPlayerKnowledgeBrief({ ...narrativeVariables, location: mysteryLocation }),
            activeNpcIds,
          )
        : basePromptUserInput;
      const contextBundle: TurnContextBundle = compileTurnContext({
        userInput,
        locationId: mysteryLocation,
        activeNpcIds,
        history: historyMessages,
        variables: narrativeVariables,
        maxContext: Number(activePreset?.settings?.openai_max_context ?? 8192),
        reservedOutput: Number(activePreset?.settings?.openai_max_tokens ?? 2048),
        fixedPromptText: `${basePromptUserInput}\n${settings.formatPromptTemplate ?? ''}`,
      });
      const { messages: promptMessages } = assemblePrompt({
        userInput: promptUserInput,
        history: historyMessages,
        preset: activePreset,
        lorebooks: tavern.lorebooks,
        activeLorebookIds: settings.activeLorebookIds,
        userName: settings.userName,
        characterName: settings.characterName,
        variables: narrativeVariables,
        formatPrompt: settings.formatPromptTemplate,
        contextBundle,
      });

      const abortController = new AbortController();
      actions.setAbortController(abortController);

      let preparedTurn: PreparedMysteryTurn | null = null;
      const getAuthorizedKnowledgeEventIds = () => [...new Set([
        ...(preparedTurn?.writerPacket.authorizedKnowledgeEvents.map(event => event.eventId) ?? []),
        ...(actionNarrativeContext?.sceneContract.requiredKnowledgeEvents.map(event => event.eventId) ?? []),
      ])];
      const parseNarrativeScene = (maintext: string) => applyActionNarrativeKnowledgeFallback(
        actionNarrativeContext,
        maintextToScene(maintext, {
          authorizedKnowledgeEvents: getAuthorizedKnowledgeEventIds(),
          variables: narrativeVariables,
        }),
      );
      let requestMessages = promptMessages;
      if (agentMode !== 'legacy') {
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
        try {
          // 失败回合重试：编排结果已缓存则直接复用，不重跑导演/审查
          if (isRetry && cachedPreparedTurn
            && cachedPreparedTurn.chatId === tavern.activeChatId
            && cachedPreparedTurn.input === userInput) {
            preparedTurn = cachedPreparedTurn.turn;
          }
          // 玩家阅读期间可能已预跑过同一输入的导演/审查，命中则直接复用
          const preplanKey = buildPreplanContextKey(agentMode, tavern.activeChatId, truthContext);
          preparedTurn ??= await consumePreplan(userInput, preplanKey);
          preparedTurn ??= await prepareMysteryTurn({
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
              requiresStateAgent: !!pendingActionCost || intentPolicy.mode !== 'normal',
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
              playerInput: userInput,
              recentHistory,
              currentLocation: truthContext.currentLocation,
              currentBackground: narrativeBackground,
              currentSpeaker: game.currentState.speaker,
              userName: settings.userName,
              characterName: settings.characterName,
              resourceInstructions: promptUserInput,
              playerIntentPolicy: intentPolicy,
              memoryContext: contextBundle.writerMemory,
              contextSelectionIds: contextBundle.selectedIds,
            },
            formatPrompt: settings.formatPromptTemplate,
            abortSignal: abortController.signal,
          });
          requestMessages = preparedTurn.writerMessages;
          cachedPreparedTurn = { chatId: tavern.activeChatId, input: userInput, turn: preparedTurn };
        } catch (pipelineError) {
          preparedTurn = null;
          if (pipelineError instanceof MysteryPipelineBlockedError) {
            // 不硬终止：进入可恢复状态，玩家可选择重试编排或回退兼容模式
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);
            actions.setTurnRecovery({
              phase: 'blocked_pipeline',
              userInput,
              errorMessage: pipelineError.message,
            });
            return;
          }
          actions.addNotification({
            type: 'warning',
            message: `多 Agent 编排失败，本回合已回退兼容模式：${pipelineError instanceof Error ? pipelineError.message : String(pipelineError)}`,
            duration: 8000,
          });
        }
      } else {
        invalidatePreplans();
      }

      let fullText = '';
      const prevScene = game.currentScene;

      const resolvePendingCosts = (): GameResourceCosts | null => (
        pendingActionCost
        && pendingActionCost.chatId === tavern.activeChatId
        && pendingActionCost.input === userInput
          ? pendingActionCost.costs
          : actionNarrativeContext?.costs ?? null
      );

      const finalize = async (
        apiUsed: 'primary' | 'dual',
        stateAgentPatch: Record<string, any> = {},
        acceptedScene: Scene,
      ) => {
        const parsed = parseStateRef.current.parsed;
        const explicitCosts = resolvePendingCosts();
        let variablePatch: Record<string, any>;
        let reportedTimeCost: unknown;

        if (preparedTurn) {
          // 代理模式只信任独立 State Agent；Writer 的 <vars> 永远不进入状态。
          variablePatch = { ...stateAgentPatch };
          reportedTimeCost = preparedTurn.writerPacket.plan.timeCostMinutes;
          // 清单固定成本由引擎扣除，避免 State Agent 重复计算。
          if (finitePositive(explicitCosts?.stamina)) delete variablePatch.stamina;
          if (finitePositive(explicitCosts?.sanity)) delete variablePatch.sanity;
        } else {
          const { timeCost, ...writerPatch } = (parsed.vars ?? {}) as Record<string, any>;
          reportedTimeCost = timeCost;
          const sanitized = sanitizeVarsPatch(writerPatch, tavern.variables);
          if (sanitized.rejected.length > 0 || sanitized.clamped.length > 0) {
            console.warn('[vars-validator] 拒绝:', sanitized.rejected, '钳制:', sanitized.clamped);
          }
          variablePatch = sanitized.vars;
        }

        const llmCostRaw = Number(reportedTimeCost);
        const llmCost = Number.isFinite(llmCostRaw) && llmCostRaw > 0 ? clampTimeCost(llmCostRaw) : null;
        const presentedKnowledgeEventIds = parsed.maintext
          ? parseNarrativeScene(parsed.maintext).lines.flatMap(line => line.knowledgeEvents ?? [])
          : [];
        const authorizedVariables = mergeAuthorizedKnowledge(
          tavern.variables,
          preparedTurn,
          presentedKnowledgeEventIds,
          actionNarrativeContext?.sceneContract.requiredKnowledgeEvents.map(event => event.eventId) ?? [],
        );
        if (actionNarrativeContext) {
          variablePatch.location = actionNarrativeContext.locationId;
          variablePatch.knowledgeEvents = addKnowledgeEvent(
            authorizedVariables.knowledgeEvents,
            `visit:${actionNarrativeContext.locationId}`,
          );
        }
        if (introducesPlayerName) {
          variablePatch.playerNameKnownByNpcIds = [...knownByNpcIds];
        }
        const transaction = settleGameTransaction({
          variables: authorizedVariables,
          gameStatus: game.gameStatus,
          variablePatch,
          costs: {
            timeMinutes: explicitCosts?.timeMinutes ?? llmCost ?? 10,
            stamina: explicitCosts?.stamina,
            sanity: (explicitCosts?.sanity ?? 0) + intentPolicy.sanityPenalty || undefined,
          },
          endings: game.endings,
          endingsSeen: game.endingsSeen,
          hasEndingInProgress: game.endingPanel.visible || !!game.endingPanel.pendingEndingId,
          deliverPendingDeathNews: hadPendingDeathNews,
        });
        pendingActionCost = null;
        const acceptedAt = Date.now();
        const turnId = crypto.randomUUID();
        const memoryCommit = buildTurnCommit({
          turnId,
          turnIndex: game.history.length,
          createdAt: acceptedAt,
          occurredAt: transaction.gameStatus.time.toISOString(),
          locationId: typeof transaction.variables.location === 'string'
            ? transaction.variables.location
            : mysteryLocation,
          cycleCount: Number(transaction.variables.cycleCount ?? 1),
          summary: parsed.summary || '回合结束',
          scene: acceptedScene,
          beforeVariables: tavern.variables,
          settledVariables: transaction.variables,
          introducedPlayerNameToNpcIds: introducesPlayerName ? activeNpcIds : [],
        });
        transaction.variables = {
          ...transaction.variables,
          worldMemory: memoryCommit.worldMemory,
          // Compatibility projections remain authoritative for one migration release.
          knowledgeEvents: memoryCommit.knowledgeEvents,
          mysteryKnowledge: memoryCommit.mysteryKnowledge,
          playerNameKnownByNpcIds: memoryCommit.playerNameKnownByNpcIds,
        };
        const mergedVariables = transaction.variables;
        const nextStatus = transaction.gameStatus;
        const allowPreplan = agentMode !== 'legacy' && !transaction.ending && !transaction.failure;

        const assistantMessage: ChatMessage = {
          id: turnId,
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
          variables: mergedVariables,
          apiUsed: apiUsed === 'dual' ? 'secondary' : 'primary',
        };

        const finalMessages = [...messages, assistantMessage];
        if (activeChat) {
          try {
            await persistActiveChat({ messages: finalMessages, variables: mergedVariables });
          } catch (persistError) {
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);
            actions.setTurnRecovery({
              phase: 'failed_stream',
              userInput,
              errorMessage: `回合写入本地存档失败，未播放也未结算：${persistError instanceof Error ? persistError.message : String(persistError)}`,
            });
            return;
          }
        }
        commitGameTransaction(transaction);

        actions.addHistorySnapshot({
          turnIndex: game.history.length,
          timestamp: Date.now(),
          summary: parsed.summary || '回合结束',
          gameStatus: {
            ...transaction.gameStatus,
            time: new Date(transaction.gameStatus.time),
            items: [...transaction.gameStatus.items],
          },
          variables: mergedVariables,
        });

        // The accepted scene only becomes visible after the transaction and
        // all knowledge/profile projections have been committed together.
        actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
        actions.setCurrentScene(mergeParsedIntoScene(prevScene, {
          ...acceptedScene,
          knowledgeAlreadyCommitted: true,
        }, parsed));
        actions.setStreaming(false);
        actions.setIsWaitingForAI(false);

        cachedPreparedTurn = null;

        // 写手未输出完整清单时，异步补全场景清单；不阻塞正文播放，失败静默（performAction 有 LLM fallback）
        const needChecklist = preparedTurn && activeChat
          && (!parsed.observe || !parsed.investigateItems?.length || !parsed.actionItems?.length);
        if (needChecklist) {
          const token = assistantMessage.id;
          checklistTokenRef.current = token;
          const existing = {
            hasObserve: !!parsed.observe,
            hasInvestigate: !!parsed.investigateItems?.length,
            hasAction: !!parsed.actionItems?.length,
          };
          const writerScenePart = {
            observe: parsed.observe ?? '',
            investigateItems: parsed.investigateItems ?? [],
            actionItems: parsed.actionItems ?? [],
          };
          void generateSceneChecklist({
            maintext: parsed.maintext,
            scenePlan: preparedTurn.writerPacket.plan.scenePlan ?? null,
            currentLocation: resolveMysteryLocation(game.currentState.background),
            previousScene: prevScene,
            variables: mergedVariables,
          }, {
            api: resolveAnalysisApi(settings),
            preset: activePreset,
          }).then(checklist => {
            // 竞态防护：下一回合/重roll/切会话已发生则丢弃
            if (checklistTokenRef.current !== token) return;
            const state = useGameStore.getState();
            const chat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);
            const lastAssistant = chat ? [...chat.messages].reverse().find(m => m.role === 'assistant') : null;
            if (!chat || lastAssistant?.id !== token) return;

            const current = state.game.currentScene;
            if (current) {
              const merged = mergeSceneChecklist({ ...current, ...writerScenePart }, checklist);
              // 不走 setCurrentScene：它会重置播放进度，这里只补 currentScene 字段
              useGameStore.setState(s => ({ game: { ...s.game, currentScene: merged } }));
            }

            // 回写标签到 </maintext> 前，重载时 rebuildSceneFromChat 才能反解还原
            const tags = serializeChecklistToTags(checklist, existing);
            const updatedContent = insertTagsIntoMaintext(lastAssistant.content, tags);
            if (updatedContent !== lastAssistant.content) {
              const updatedMessages = chat.messages.map(m => (m.id === token ? { ...m, content: updatedContent } : m));
              void persistActiveChat({ messages: updatedMessages });
            }
          }).catch(error => {
            console.warn('[scene-list] 场景清单补全失败:', error);
          });
        }

        // 预规划: 玩家阅读期间按最可能的输入(第一个选项)后台预跑导演/审查
        const firstOption = parsed.options?.[0]?.trim();
        if (allowPreplan && firstOption) {
          const mysteryLocation = resolveMysteryLocation(game.currentState.background);
          const knownClueIds = (Array.isArray(mergedVariables.unlockedClues) ? mergedVariables.unlockedClues : [])
            .filter((id: string) => mysteryFactIds.has(id));
          const speculativeTruthContext: TruthContext = {
            cycleCount: Number(mergedVariables.cycleCount ?? 1),
            currentLocation: mysteryLocation,
            lockedRoute: readLockedRoute(mergedVariables),
            unlockedClueIds: knownClueIds,
            playerKnowledge: readPlayerKnowledge(mergedVariables, knownClueIds),
            suspicion: {
              ...game.endingCheckContext.suspicion,
              ...(mergedVariables.suspicion && typeof mergedVariables.suspicion === 'object'
                ? mergedVariables.suspicion
                : {}),
            },
            affinity: mergedVariables.affinity && typeof mergedVariables.affinity === 'object'
              ? mergedVariables.affinity
              : {},
            tripProgress: Number(mergedVariables.tripProgress ?? 0),
            sanity: nextStatus.sanity,
            activeOverlay: readActiveOverlay(mergedVariables),
            activeNpcIds: npcIdsByLocation[mysteryLocation] ?? [],
            playerPresentation: buildPlayerKnowledgeBrief({ ...mergedVariables, location: mysteryLocation }),
            playerIdentity: readConfirmedPlayerIdentity(settings),
            playerIdentityVariables: mergedVariables,
          };
          const speculativePrompt = appendResourcePrompt(firstOption, game.currentState.background, mergedVariables);
          const speculativeContextBundle = compileTurnContext({
            userInput: firstOption,
            locationId: mysteryLocation,
            activeNpcIds: speculativeTruthContext.activeNpcIds,
            history: finalMessages,
            variables: mergedVariables,
            maxContext: Number(activePreset?.settings?.openai_max_context ?? 8192),
            reservedOutput: Number(activePreset?.settings?.openai_max_tokens ?? 2048),
            fixedPromptText: `${speculativePrompt}\n${settings.formatPromptTemplate ?? ''}`,
          });
          const speculativeHistory = speculativeContextBundle.recentMessages.map(m => ({ role: m.role, content: m.content }));
          startPreplan({
            input: firstOption,
            contextKey: buildPreplanContextKey(agentMode, tavern.activeChatId, speculativeTruthContext),
            options: {
              mode: agentMode as Exclude<AgentNarrativeMode, 'legacy'>,
              api: resolveAnalysisApi(settings),
              preset: activePreset,
              truthContext: speculativeTruthContext,
              turnContext: {
                playerInput: firstOption,
                recentHistory: speculativeHistory,
                memoryContext: speculativeContextBundle.directorMemory,
                contextSelectionIds: speculativeContextBundle.selectedIds,
                gameStatus: {
                  time: Number.isNaN(nextStatus.time.getTime())
                    ? game.gameStatus.time.toISOString()
                    : nextStatus.time.toISOString(),
                  stamina: nextStatus.stamina,
                  sanity: nextStatus.sanity,
                },
                investigation: game.endingCheckContext.investigation,
                thresholdDirectives: translateForDirector(mergedVariables),
              },
              presentationContext: {
                playerInput: firstOption,
                recentHistory: speculativeHistory,
                currentLocation: mysteryLocation,
                currentBackground: game.currentState.background,
                currentSpeaker: game.currentState.speaker,
                userName: settings.userName,
                characterName: settings.characterName,
                resourceInstructions: speculativePrompt,
                memoryContext: speculativeContextBundle.writerMemory,
                contextSelectionIds: speculativeContextBundle.selectedIds,
              },
              formatPrompt: settings.formatPromptTemplate,
            },
          });
        }
      };

      const maybeAugmentWithSecondary = async () => {
        const parsed = parseStateRef.current.parsed;
        const result = await augmentWithSecondary(settings.api.secondary, activePreset, parsed, fullText);
        if (result.status === 'ok') {
          actions.setParsedContent(parsed);
          return true;
        }
        if (result.status === 'error') {
          actions.addNotification({
            type: 'warning',
            message: '次 API 调用失败,使用主 API 结果: ' + result.message,
            duration: 4000,
          });
        }
        return false;
      };

      await streamChatCompletion(
        settings.api,
        requestMessages,
        activePreset,
        {
          onToken: (token) => {
            fullText += token;
            actions.setStreamBuffer(fullText);
            // Deliberately do not parse or render partial output. The complete
            // turn must pass protocol, narrative and transaction validation first.
          },
          onComplete: async () => {
            const repairedOutput = repairRecoverableOutput(fullText);
            if (repairedOutput.repairedTags.length > 0) {
              fullText = repairedOutput.text;
              console.warn('[output-protocol] 已安全补全标签:', repairedOutput.repairedTags);
            }
            parseStateRef.current = parseChunk(createParseState(), fullText, { strict: true });
            actions.setStreamBuffer(fullText);
            actions.setParsedContent(parseStateRef.current.parsed);

            // 严格校验 LLM 输出协议
            const validationErrors = outputProtocol.validate(fullText, parseStateRef.current.parsed);
            const streamErrors = parseStateRef.current.errors;
            if (streamErrors.length > 0) {
              validationErrors.push(...streamErrors.map(msg => ({ code: 'STREAM_PARSE_ERROR', message: msg })));
            }
            let completedScene: Scene | null = null;
            if (parseStateRef.current.parsed.maintext) {
              completedScene = parseNarrativeScene(parseStateRef.current.parsed.maintext);
              if (actionNarrativeContext) {
                const contextError = actionNarrativeContextError(actionNarrativeContext, completedScene);
                if (contextError) {
                  validationErrors.push({ code: 'ACTION_CONTEXT_MISMATCH', message: contextError });
                }
              }
              const playerAddressError = npcPlayerKnowledgeError(
                completedScene.lines,
                playerIdentity,
                npcPlayerKnowledge,
              );
              if (playerAddressError) {
                validationErrors.push({ code: 'NPC_PLAYER_KNOWLEDGE_MISMATCH', message: playerAddressError });
              }
            }
            if (validationErrors.length > 0) {
              const detail = formatValidationErrors(validationErrors);
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setApiError('AI 输出格式不合法:\n' + detail);
              actions.setTurnRecovery({
                phase: 'failed_stream',
                userInput,
                errorMessage: 'AI 输出格式不合法:\n' + detail,
              });
              return;
            }

            if (!completedScene) {
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setTurnRecovery({
                phase: 'failed_stream',
                userInput,
                errorMessage: 'AI 正文没有生成可播放场景。',
              });
              return;
            }

            if (preparedTurn) {
              if (preparedTurn.reviewPolicy.narrative) {
                try {
                  const narrativeReview = await reviewNarrativeAgainstWriterPacket({
                    api: resolveAnalysisApi(settings),
                    preset: activePreset,
                    packet: preparedTurn.writerPacket,
                    narrative: parseStateRef.current.parsed.maintext || fullText,
                    abortSignal: abortController.signal,
                  });
                  if (!narrativeReview.approved) {
                    const detail = narrativeReview.violations.map(item => item.message).join('\n');
                    actions.setStreaming(false);
                    actions.setIsWaitingForAI(false);
                    actions.setTurnRecovery({
                      phase: 'failed_stream',
                      userInput,
                      errorMessage: `正文越过事实或角色边界，已阻止写入存档：\n${detail}`,
                    });
                    return;
                  }
                } catch (reviewError) {
                  actions.setStreaming(false);
                  actions.setIsWaitingForAI(false);
                  actions.setTurnRecovery({
                    phase: 'failed_stream',
                    userInput,
                    errorMessage: `正文审查失败，未播放也未写入存档：${reviewError instanceof Error ? reviewError.message : String(reviewError)}`,
                  });
                  return;
                }
              }

              if (preparedTurn.reviewPolicy.state) {
                try {
                const stateResult = await runStateAgent({
                  api: resolveAnalysisApi(settings),
                  preset: activePreset,
                  currentVariables: tavern.variables,
                  gameStatus: game.gameStatus,
                  playerInput: userInput,
                  narrative: parseStateRef.current.parsed.maintext || fullText,
                  deterministicCosts: resolvePendingCosts() ?? undefined,
                  saturationPivot: preparedTurn.brief.saturationPivot
                    ? {
                        blockedActorId: preparedTurn.brief.saturationPivot.blockedActorId,
                        redirectedActorId: preparedTurn.brief.saturationPivot.redirectedActorId,
                        requiredSuspicionGain: preparedTurn.brief.saturationPivot.requiredSuspicionGain,
                      }
                    : undefined,
                  abortSignal: abortController.signal,
                });
                if (stateResult.summary) {
                  parseStateRef.current.parsed.summary = stateResult.summary;
                  actions.setParsedContent({ summary: stateResult.summary });
                }
                if (stateResult.rejected.length > 0 || stateResult.clamped.length > 0) {
                  console.warn(
                    '[state-agent] 拒绝:',
                    stateResult.rejected,
                    '钳制:',
                    stateResult.clamped,
                  );
                }
                  await finalize('dual', stateResult.vars, completedScene);
                } catch (stateError) {
                actions.addNotification({
                  type: 'warning',
                  message: `状态分析失败，本回合仅结算固定成本：${stateError instanceof Error ? stateError.message : String(stateError)}`,
                  duration: 6000,
                });
                  await finalize('primary', {}, completedScene);
                }
              } else {
                await finalize('primary', {}, completedScene);
              }
            } else {
              const augmented = await maybeAugmentWithSecondary();
              await finalize(augmented ? 'dual' : 'primary', {}, completedScene);
            }
          },
          onError: (error) => {
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);
            actions.setApiError(error.message);
            actions.setTurnRecovery({ phase: 'failed_stream', userInput, errorMessage: error.message });
          },
        },
        abortController.signal,
        {
          onRetry: (attempt, retryError) => {
            actions.addNotification({
              type: 'warning',
              message: `连接失败，正在自动重试（第 ${attempt} 次）: ${retryError.message}`,
              duration: 4000,
            });
          },
        }
      );
    } catch (error) {
      actions.setStreaming(false);
      actions.setIsWaitingForAI(false);
      const message = error instanceof Error ? error.message : '未知错误';
      actions.setApiError(message);
      // 玩家主动中止（切换会话/轮回重置等）不进入恢复流程
      if (!(error instanceof ApiCallError && error.kind === 'abort')) {
        actions.setTurnRecovery({ phase: 'failed_stream', userInput, errorMessage: message });
      }
    } finally {
      sendingLockRef.current = false;
    }
  }, []);

  const selectOption = useCallback((optionText: string) => {
    sendMessage(optionText);
  }, [sendMessage]);

  const reroll = useCallback(async () => {
    const currentStore = useGameStore.getState();
    const { tavern, actions } = currentStore;
    const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);
    if (!activeChat || activeChat.messages.length === 0) {
      actions.addNotification({ type: 'warning', message: '暂无历史记录可供重roll', duration: 3000 });
      return;
    }

    // 找到最后一条 user 消息
    const lastUserMsg = [...activeChat.messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) {
      actions.addNotification({ type: 'warning', message: '未找到用户输入记录', duration: 3000 });
      return;
    }

    // 移除该 user 消息之后的所有消息（assistant 回复等）
    const userMsgIndex = activeChat.messages.findIndex(m => m.id === lastUserMsg.id);
    const trimmedMessages = activeChat.messages.slice(0, userMsgIndex + 1);
    const messagesBeforeTurn = trimmedMessages.slice(0, -1);
    const rollback = resolveTurnRollback(lastUserMsg, {
      gameStatus: currentStore.game.gameStatus,
      currentState: currentStore.game.currentState,
      currentScene: rebuildSceneFromChat({ ...activeChat, messages: messagesBeforeTurn }),
      currentLineIndex: 0,
      sceneComplete: true,
      variables: tavern.variables,
    });
    const rollbackVariables = rollback.variables;
    const rollbackStatus = rollback.gameStatus;
    const rollbackScene = rollback.currentScene;

    // 清理流式状态
    actions.setStreamBuffer('');
    actions.setParsedContent({
      thinking: '',
      maintext: '',
      options: [],
      summary: '',
      vars: {},
      observe: '',
      investigateItems: [],
      actionItems: [],
    });

    // 重roll后上下文/历史已变化，旧预规划、失败回合缓存与清单补全回调均不可复用
    invalidatePreplans();
    cachedPreparedTurn = null;
    checklistTokenRef.current = null;
    actions.clearTurnRecovery();

    // 更新 chat（移除 assistant 回复）并回滚对应历史快照
    // 失败回合没有 assistant 回复也没有新快照，此时不能误删上一成功回合的快照
    const removedAssistant = activeChat.messages.slice(userMsgIndex + 1).some(m => m.role === 'assistant');
    await persistActiveChat({ messages: trimmedMessages, variables: rollbackVariables });
    useGameStore.setState(state => ({
      tavern: {
        ...state.tavern,
        variables: rollbackVariables,
      },
      game: {
        ...state.game,
        currentScene: rollbackScene,
        currentLineIndex: rollback.currentLineIndex,
        sceneComplete: rollback.sceneComplete,
        currentState: rollback.currentState,
        gameStatus: {
          ...rollbackStatus,
          time: new Date(rollbackStatus.time),
          items: [...rollbackStatus.items],
        },
        endingCheckContext: variablesToEndingContext(
          rollbackVariables,
          state.game.endingsSeen,
        ) as typeof state.game.endingCheckContext,
        pendingCycleReset: null,
        endingPanel: {
          ...state.game.endingPanel,
          visible: false,
          activeEndingId: null,
          pendingEndingId: null,
          isAnimating: false,
        },
      },
    }));
    if (removedAssistant) {
      actions.removeLastHistorySnapshot();
    }

    // 重新发送同样的输入
    await sendMessage(lastUserMsg.content, { isReroll: true });
  }, [sendMessage]);

  /** 重试失败回合：复用已持久化的 user 消息与编排缓存 */
  const retryTurn = useCallback(async (opts?: { forceLegacy?: boolean }) => {
    const recovery = store.api.turnRecovery;
    if (recovery.phase === 'idle' || !recovery.userInput) return;
    await sendMessage(recovery.userInput, { isRetry: true, forceLegacy: opts?.forceLegacy });
  }, [store, sendMessage]);

  /** 放弃失败回合：撤回孤儿 user 消息，恢复到失败前状态 */
  const dismissRecovery = useCallback(async () => {
    const { tavern, actions } = store;
    if (store.api.turnRecovery.phase === 'idle') return;
    const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);
    if (activeChat && activeChat.messages.length > 0
      && activeChat.messages[activeChat.messages.length - 1].role === 'user') {
      await persistActiveChat({ messages: activeChat.messages.slice(0, -1) });
    }
    cachedPreparedTurn = null;
    checklistTokenRef.current = null;
    actions.setApiError(null);
    actions.clearTurnRecovery();
  }, [store]);

  const performAction = useCallback((actionType: 'observe' | 'investigate' | 'actions', itemIndex?: number) => {
    const { game, actions } = store;
    const scene = game.currentScene;

    // 如果当前场景有本地数据，直接展示，不调用 API
    if (actionType === 'observe' && scene?.observe) {
      actions.setActionPanel({ visible: true, type: 'observe', content: scene.observe, selectedIndex: null });
      return;
    }

    if (actionType === 'investigate' && scene?.investigateItems && scene.investigateItems.length > 0) {
      if (itemIndex !== undefined) {
        // 选择了具体调查项：构造 prompt 发送给 LLM 获取详细结果
        const item = scene.investigateItems[itemIndex];
        const prompt = `[系统] 玩家选择了调查："${item.desc}"
当前场景：${game.currentState.background || '未知'}
嫌疑人指向：${item.suspect}
结果风格：${item.style}

请返回详细的调查结果，包含发现、疑点、可能的线索。
这是一个完整叙事回合。请按项目主输出协议返回 maintext、至少两个 option、sum 和空 vars；不要只返回 action 标签。`;
        const parsedCost = parseTimeCost(item.time);
        const chatId = store.tavern.activeChatId;
        pendingActionCost = chatId
          ? {
              chatId,
              input: prompt,
              costs: {
                timeMinutes: parsedCost > 0 ? clampTimeCost(parsedCost) : undefined,
                stamina: Math.max(0, Number(item.stamina) || 0),
                sanity: Math.max(0, Number(item.sanity) || 0),
              },
            }
          : null;
        sendMessage(prompt);
        actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
      } else {
        // 显示调查列表（序列化为文本供面板展示）
        const listText = scene.investigateItems.map((item, i) =>
          `[${i + 1}] ${item.desc}\n    嫌疑人：${item.suspect}  风格：${item.style}  耗时：${item.time}  体力-${item.stamina}  理智-${item.sanity}`
        ).join('\n\n');
        actions.setActionPanel({ visible: true, type: 'investigate', content: listText, selectedIndex: null });
      }
      return;
    }

    if (actionType === 'actions' && scene?.actionItems && scene.actionItems.length > 0) {
      if (itemIndex !== undefined) {
        // 选择了具体行动项：构造 prompt 发送给 LLM 获取详细结果
        const item = scene.actionItems[itemIndex];
        const parsedCost = parseTimeCost(item.time);
        const narrativeContext = resolveActionNarrativeContext(
          item.desc,
          game.gameStatus.time,
          parsedCost,
          {
            currentLocationId: typeof store.tavern.variables.location === 'string'
              ? store.tavern.variables.location
              : resolveMysteryLocation(game.currentState.background),
            cycleCount: Number(store.tavern.variables.cycleCount ?? game.endingCheckContext.cycleCount ?? 1),
            knowledgeEvents: store.tavern.variables.knowledgeEvents,
          },
        );
        const prompt = `[系统] 玩家执行了行动："${item.desc}"
当前场景：${game.currentState.background || '未知'}
结果风格：${item.style}

请描述行动过程、结果、场景变化（如果有）。
如果行动导致场景切换，在文本末尾加上：[变化] 场景切换 → 新场景名
${narrativeContext ? `\n${narrativeContext.directive}\n` : ''}
这是一个完整叙事回合。请按项目主输出协议返回 maintext、至少两个 option、sum 和空 vars；不要只返回 action 标签。`;
        const chatId = store.tavern.activeChatId;
        pendingActionCost = chatId
          ? {
              chatId,
              input: prompt,
              costs: {
                timeMinutes: parsedCost > 0 ? clampTimeCost(parsedCost) : undefined,
                stamina: Math.max(0, Number(item.stamina) || 0),
                sanity: Math.max(0, Number(item.sanity) || 0),
              },
              narrativeContext: narrativeContext ?? undefined,
            }
          : null;
        sendMessage(prompt);
        actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
      } else {
        // 显示行动列表
        const listText = scene.actionItems.map((item, i) =>
          `[${i + 1}] ${item.desc}\n    风格：${item.style}  耗时：${item.time}  体力-${item.stamina}  理智-${item.sanity}`
        ).join('\n\n');
        actions.setActionPanel({ visible: true, type: 'act', content: listText, selectedIndex: null });
      }
      return;
    }

    // 没有本地数据时，发送通用消息给 LLM
    const message = `${store.tavern.settings?.userName || '玩家'}执行了${actionType}`;
    sendMessage(message);
  }, [sendMessage, store]);

  return { sendMessage, selectOption, performAction, reroll, retryTurn, dismissRecovery };
}
