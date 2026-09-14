import { buildTurnPreparation, preparationContextKey, resolveAnalysisApi, resolveMysteryLocation, readPlayerKnowledge } from '../agents/mystery/turn-preparation';
import { assertTurnActive, runStateWithFallback } from '../utils/turn-lifecycle';
import { beginTurnMetrics } from '../agents/mystery/turn-metrics';
import { buildStateEvidenceAuthority } from '../agents/state/state-evidence';
import { validateNarrativeContract } from '../engine/narrative-contract';
import { selectPresentedActionFacts, type ActionAuthorityContext } from '../agents/mystery/action-authority';

import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { ApiCallError, streamChatCompletion } from '../sillytavern/api-router';
import { maintextToScene, mergeParsedIntoScene } from '../engine/scene-parser';

import { sanitizeVarsPatch } from '../sillytavern/vars-validator';
import { createParseState, parseChunk } from '../sillytavern/stream-parser';
import {
  createOutputProtocol,
  formatValidationErrors,
  repairRecoverableOutput,
  type ValidationError,
} from '../sillytavern/output-protocol';
import type { ChatMessage, DynamicRecord } from '../sillytavern/types';
import { persistActiveChat } from '../utils/chatPersistence';

import {
  npcPlayerKnowledgeError,
} from '../data/npcPlayerKnowledge';
import { parseTimeCost, clampTimeCost } from '../engine/game-clock';

import { settleGameTransaction, type GameResourceCosts } from '../engine/game-transaction';

import {
  addKnowledgeEvent,
  addPresentedAuthorizedKnowledgeEvents,
  normalizeKnowledgeEvents,
} from '../data/playerKnowledge';
import {
  buildRetryPromptFromNarrativeFailure,
  consumePreplan,
  factResidualsForRetry,
  invalidatePreplans,
  mergeProtocolRepairResiduals,
  mergeRepairResiduals,
  MYSTERY_TRUTH_GRAPH,
  MysteryPipelineBlockedError,
  prepareMysteryTurn,
  repairNarrativeAgainstWriterPacket,
  repairNarrativeFormatAgainstWriterPacket,
  snapshotFactRepairFormatFailure,
  snapshotFormatRepairCallFailure,
  snapshotNarrativeReviewCallFailure,
  recentAcceptedNarratives,
  removeExactRepeatedLines,
  removeUngroundedNarrativeLines,
  reviewNarrativeAgainstWriterPacket,
  reviewNarrativeStyle,
  REVEAL_LEVELS,
  startPreplan,
  type FactReview,
  type FactReviewViolation,
  type PreparedMysteryTurn,
} from '../agents/mystery';

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

import {
  applyActionNarrativeKnowledgeFallback,
  actionNarrativeContextError,
  resolveActionNarrativeContext,
  type ActionNarrativeContext,
} from '../engine/action-narrative-context';
import { buildTurnCommit } from '../memory/world-memory';
import type { Scene } from '../sillytavern/types';

const outputProtocol = createOutputProtocol({
  requiredTags: ['maintext', 'option', 'sum'],
  requireMinOptions: 2,
  validateVarsJson: true,
  checkUnclosedTags: true,
});



function combineNarrativeReviews(reviews: FactReview[]): FactReview {
  const violations = reviews.flatMap(review => review.violations);
  return {
    approved: reviews.every(review => review.approved) && violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : reviews.flatMap(review => review.corrections),
    assertionAudit: reviews.find(review => review.assertionAudit)?.assertionAudit,
  };
}
function mergeAuthorizedKnowledge(
  variables: DynamicRecord,
  prepared: PreparedMysteryTurn | null,
  presentedKnowledgeEventIds: readonly string[] = [],
  additionalAuthorizedEventIds: readonly string[] = [],
): DynamicRecord {
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

function finitePositive(value: unknown): boolean {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

// 失败回合的编排结果缓存：重试时输入未变则跳过导演/审查重跑
let cachedPreparedTurn: { contextKey: string; turn: PreparedMysteryTurn } | null = null;

interface CachedNarrativeFailure {
  chatId: string | null;
  input: string;
  draft: string;
  reviewPending?: boolean;
  review?: FactReview;
  formatErrors?: ValidationError[];
  priorResiduals?: FactReviewViolation[];
  priorFormatResiduals?: ValidationError[];
}

// 保留失败正文和精确审查意见；玩家重试时从原稿继续修复，而不是重新抽样同一 WriterPacket。
let cachedNarrativeFailure: CachedNarrativeFailure | null = null;

// 玩家点击调查/行动项时缓存其标注耗时；重试同一输入时仍可命中
let pendingActionCost: {
  chatId: string;
  input: string;
  costs: GameResourceCosts;
  narrativeContext?: ActionNarrativeContext;
  originalInput?: string;
  selection?: ActionAuthorityContext['selection'];
  resumeActionId?: string;
} | null = null;

export interface SendMessageOptions {
  /** 仅恢复当前轮回中匹配的未完成行动；不接受调用方提供的剩余成本。 */
  resumeActionId?: string;
  isReroll?: boolean;
  /** 重试失败回合：复用已持久化的 user 消息，不重复追加 */
  isRetry?: boolean;
  /** 放弃失败草稿，明确要求写手重新生成。 */
  forceRegenerate?: boolean;
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
    const abortController = new AbortController();
    liveStore.api.abortController?.abort();
    actions.setAbortController(abortController);
    let turnCommitted = false;
    const ownsTurn = () => {
      const current = useGameStore.getState();
      return current.tavern.activeChatId === tavern.activeChatId
        && current.api.abortController === abortController;
    };
    const assertCurrent = () => assertTurnActive(abortController.signal, () => ownsTurn()
      && (turnCommitted || useGameStore.getState().tavern.variables === tavern.variables));
    const writeGuard = { signal: abortController.signal, assertCurrent };
    const metrics = beginTurnMetrics();
    const endPreparation = metrics.startStage('preparation');
    let endWriter = () => {};
    const isReroll = opts?.isReroll ?? false;
    const isRetry = opts?.isRetry ?? false;
    const forceRegenerate = opts?.forceRegenerate ?? false;

    if (!isRetry || forceRegenerate) {
      cachedNarrativeFailure = null;
    }

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
      const selectedAction = pendingActionCost?.chatId === tavern.activeChatId && pendingActionCost.input === userInput
        ? pendingActionCost : null;
      const savedRequest = (isRetry || isReroll) ? [...baseMessages].reverse().find(message => message.role === 'user')?.actionRequest : undefined;
      const actionRequest: ChatMessage['actionRequest'] = savedRequest ?? {
        originalInput: selectedAction?.originalInput,
        selection: selectedAction?.selection,
        narrativeContext: selectedAction?.narrativeContext,
        inputOrigin: selectedAction ? 'menu' : 'player',
        resumeActionId: opts?.resumeActionId ?? selectedAction?.resumeActionId,
      };

      // 玩家放弃失败回合、未撤回就直接输入新内容：先自动撤回孤儿 user 消息
      if (!isRetry && !isReroll && liveStore.api.turnRecovery.phase !== 'idle') {
        if (baseMessages.length > 0 && baseMessages[baseMessages.length - 1].role === 'user') {
          baseMessages = baseMessages.slice(0, -1);
          if (activeChat) {
            await persistActiveChat({ messages: baseMessages }, writeGuard);
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
          actionRequest: structuredClone(actionRequest),
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
          await persistActiveChat({ messages }, writeGuard);
        }
      }

      actions.setIsWaitingForAI(true);
      actions.setApiError(null);
      actions.setStreaming(true);
      parseStateRef.current = createParseState();

      const pendingNarrativeContext = actionRequest.narrativeContext ?? null;
      const preparation = buildTurnPreparation({
        userInput, settings, activePreset, variables: tavern.variables,
        gameStatus: game.gameStatus, currentState: game.currentState, endingCheckContext: game.endingCheckContext,
        history: excludeCurrentInputFromHistory(messages, userInput), pendingNarrativeContext,
        hasPendingAction: actionRequest.inputOrigin === 'menu',
        actionSelection: actionRequest.selection, originalActionInput: actionRequest.originalInput,
        resumeActionId: actionRequest.resumeActionId,
      });
      const { intentPolicy, hadPendingDeathNews, playerIdentity, introducesPlayerName } = preparation;
      let { actionNarrativeContext, narrativeVariables, mysteryLocation, activeNpcIds, knownByNpcIds, npcPlayerKnowledge } = preparation;

      let preparedTurn: PreparedMysteryTurn | null = null;
      let resumedNarrativeFailure: CachedNarrativeFailure | null = null;
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
      let requestMessages: PreparedMysteryTurn['writerMessages'] = [];
      {
        const preplanKey = preparationContextKey(tavern.activeChatId, preparation.request, settings.api);
        try {
          if (isRetry && cachedPreparedTurn?.contextKey === preplanKey) {
            preparedTurn = cachedPreparedTurn.turn;
          } else {
            cachedNarrativeFailure = null;
          }
          preparedTurn ??= await consumePreplan(userInput, preplanKey, abortController.signal);
          preparedTurn ??= await prepareMysteryTurn({ ...preparation.request, abortSignal: abortController.signal });
          assertCurrent();
          if (preparedTurn.executedContext) {
            ({ actionNarrativeContext, narrativeVariables, mysteryLocation, activeNpcIds, knownByNpcIds, npcPlayerKnowledge } = preparedTurn.executedContext);
          }
          endPreparation();
          requestMessages = preparedTurn.writerMessages;
          cachedPreparedTurn = { contextKey: preplanKey, turn: preparedTurn };
          if (isRetry && !forceRegenerate
            && cachedNarrativeFailure
            && cachedNarrativeFailure.chatId === tavern.activeChatId
            && cachedNarrativeFailure.input === userInput) {
            resumedNarrativeFailure = cachedNarrativeFailure;
            if (!resumedNarrativeFailure.reviewPending) {
              const systemMessage = preparedTurn.writerMessages[0];
              const repairPrompt = buildRetryPromptFromNarrativeFailure(
                preparedTurn.writerPacket,
                resumedNarrativeFailure,
              );
              requestMessages = [systemMessage, { role: 'user', content: repairPrompt }];
            }
          }
        } catch (pipelineError) {
          assertCurrent();
          preparedTurn = null;
          if (pipelineError instanceof MysteryPipelineBlockedError) {
            // 不硬终止：进入可恢复状态，玩家可以安全重试或撤回输入。
            actions.setStreaming(false);
            actions.setIsWaitingForAI(false);
            actions.setTurnRecovery({
              phase: 'blocked_pipeline',
              userInput,
              errorMessage: pipelineError.message,
            });
            return;
          }
          actions.setStreaming(false);
          actions.setIsWaitingForAI(false);
          actions.setTurnRecovery({
            phase: 'blocked_pipeline',
            userInput,
            errorMessage: `多 Agent 编排失败：${pipelineError instanceof Error ? pipelineError.message : String(pipelineError)}`,
          });
          return;
        }
      }

      let fullText = '';
      let acceptedNarrativeReview: FactReview | undefined;
      const earnedPresentedTurn = (): PreparedMysteryTurn | null => {
        const turn = preparedTurn;
        const resolution = turn?.writerPacket.resolvedAction;
        return turn && resolution ? { ...turn, writerPacket: selectPresentedActionFacts(
          turn.writerPacket, acceptedNarrativeReview, resolution.completedSourceIds,
        ) } : turn;
      };
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
        stateAgentPatch: DynamicRecord = {},
        acceptedScene: Scene,
      ) => {
        assertCurrent();
        const endCommit = metrics.startStage('commit');
        const parsed = parseStateRef.current.parsed;
        const explicitCosts = resolvePendingCosts();
        let variablePatch: DynamicRecord;
        let reportedTimeCost: unknown;

        if (preparedTurn) {
          // 代理模式只信任独立 State Agent；Writer 的 <vars> 永远不进入状态。
          variablePatch = { ...stateAgentPatch };
          reportedTimeCost = preparedTurn.writerPacket.plan.timeCostMinutes;
          // 清单固定成本由引擎扣除，避免 State Agent 重复计算。
          if (finitePositive(explicitCosts?.stamina)) delete variablePatch.stamina;
          if (finitePositive(explicitCosts?.sanity)) delete variablePatch.sanity;
        } else {
          const { timeCost, ...writerPatch } = parsed.vars ?? {};
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
          earnedPresentedTurn(),
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
        const resolution = preparedTurn?.writerPacket.resolvedAction;
        if (resolution && resolution.endLocationId !== resolution.startLocationId) {
          variablePatch.knowledgeEvents = addKnowledgeEvent(authorizedVariables.knowledgeEvents, `visit:${resolution.endLocationId}`);
        }
        if (introducesPlayerName) {
          variablePatch.playerNameKnownByNpcIds = [...knownByNpcIds];
        }
        const transaction = settleGameTransaction({
          variables: authorizedVariables,
          gameStatus: game.gameStatus,
          variablePatch,
          resolvedAction: resolution,
          pendingActionAuthorization: preparedTurn?.pendingActionAuthorization,
          pendingActionSceneContext: preparedTurn?.pendingActionSceneContext,
          costs: {
            timeMinutes: finitePositive(explicitCosts?.timeMinutes) ? explicitCosts!.timeMinutes : llmCost ?? 10,
            stamina: explicitCosts?.stamina,
            sanity: (explicitCosts?.sanity ?? 0) + intentPolicy.sanityPenalty || undefined,
          },
          endings: game.endings,
          endingsSeen: game.endingsSeen,
          hasEndingInProgress: game.endingPanel.visible || !!game.endingPanel.pendingEndingId,
          deliverPendingDeathNews: hadPendingDeathNews,
          narrativeTurn: true,
          narrativeText: parsed.maintext || fullText,
        });
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
          approvedBackgroundFactProposals: preparedTurn?.writerPacket.approvedBackgroundFactProposals ?? [],
          narrativeText: parsed.maintext || fullText,
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
        const allowPreplan = !transaction.ending && !transaction.failure;

        const assistantMessage: ChatMessage = {
          id: turnId,
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
          variables: mergedVariables,
          parsed: {
            ...parsed,
            options: [...parsed.options],
            vars: { ...parsed.vars },
            investigateItems: parsed.investigateItems?.map(item => ({ ...item })),
            actionItems: parsed.actionItems?.map(item => ({ ...item })),
          },
          apiUsed: apiUsed === 'dual' ? 'secondary' : 'primary',
        };

        const finalMessages = [...messages, assistantMessage];
        if (activeChat) {
          try {
            await metrics.stage('persistence', () => persistActiveChat({ messages: finalMessages, variables: mergedVariables }, writeGuard));
          } catch (persistError) {
            assertCurrent();
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
        assertCurrent();
        const committedScene = mergeParsedIntoScene(prevScene, {
          ...acceptedScene,
          knowledgeAlreadyCommitted: true,
        }, parsed);
        commitGameTransaction(transaction, committedScene);
        turnCommitted = true;
        pendingActionCost = null;

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
        actions.setStreaming(false);
        actions.setIsWaitingForAI(false);

        endCommit();
        metrics.markPlayable();
        metrics.finish('success');

        cachedPreparedTurn = null;
        cachedNarrativeFailure = null;

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
          }).then(async checklist => {
            const tags = serializeChecklistToTags(checklist, existing);
            if (!tags.trim() || checklistTokenRef.current !== token || abortController.signal.aborted
              || useGameStore.getState().api.abortController !== abortController) return;
            const checklistReview = await reviewNarrativeAgainstWriterPacket({
              api: resolveAnalysisApi(settings),
              preset: activePreset,
              packet: preparedTurn.writerPacket,
              narrative: tags,
              abortSignal: abortController.signal,
            });
            if (!checklistReview.approved) return;
            // 竞态防护：下一回合/重roll/切会话已发生则丢弃
            if (checklistTokenRef.current !== token || abortController.signal.aborted
              || useGameStore.getState().api.abortController !== abortController) return;
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
            const updatedContent = insertTagsIntoMaintext(lastAssistant.content, tags);
            if (updatedContent !== lastAssistant.content) {
              const updatedMessages = chat.messages.map(m => (m.id === token ? { ...m, content: updatedContent } : m));
              await persistActiveChat({ messages: updatedMessages }, {
                signal: abortController.signal,
                assertCurrent: () => {
                  const latest = useGameStore.getState();
                  const latestChat = latest.tavern.chats.find(item => item.id === latest.tavern.activeChatId);
                  const latestAssistant = latestChat
                    ? [...latestChat.messages].reverse().find(message => message.role === 'assistant') : null;
                  if (abortController.signal.aborted || latest.api.abortController !== abortController
                    || checklistTokenRef.current !== token || latestChat?.id !== chat.id || latestAssistant?.id !== token) {
                    throw new DOMException('场景清单已失效', 'AbortError');
                  }
                },
              });
            }
          }).catch(error => {
            console.warn('[scene-list] 场景清单补全失败:', error);
          });
        }

        // 预规划: 玩家阅读期间按最可能的输入(第一个选项)后台预跑导演/审查
        const firstOption = parsed.options?.[0]?.trim();
        if (allowPreplan && firstOption) {
          try {
            const committed = useGameStore.getState();
            const terminalBackground = committedScene.lines.reduce(
              (background, line) => line.background ?? background, committed.game.currentState.background,
            );
            const speculative = buildTurnPreparation({
              userInput: firstOption, settings, activePreset, variables: mergedVariables,
              gameStatus: nextStatus, currentState: { ...committed.game.currentState, background: terminalBackground },
              endingCheckContext: committed.game.endingCheckContext, history: finalMessages,
            });
            startPreplan({ input: firstOption,
              contextKey: preparationContextKey(tavern.activeChatId, speculative.request, settings.api), options: speculative.request });
          } catch {
            // An optional preplan budget failure must not undo a committed turn.
            invalidatePreplans();
          }
        }
      };

      const completeNarrative = async () => {
            endWriter();
            assertCurrent();
            const validateNarrativeCandidate = (rawNarrative: string) => {
              assertCurrent();
              const candidateText = repairRecoverableOutput(rawNarrative).text;
              const candidateParseState = parseChunk(createParseState(), candidateText, { strict: true });
              const candidateValidationErrors = outputProtocol.validate(
                candidateText,
                candidateParseState.parsed,
              );
              if (candidateParseState.errors.length > 0) {
                candidateValidationErrors.push(...candidateParseState.errors.map(message => ({
                  code: 'STREAM_PARSE_ERROR',
                  message,
                })));
              }

              const candidateScene = candidateParseState.parsed.maintext
                ? parseNarrativeScene(candidateParseState.parsed.maintext)
                : null;
              const explicitMinutes = resolvePendingCosts()?.timeMinutes;
              candidateValidationErrors.push(...validateNarrativeContract(candidateScene, {
                time: game.gameStatus.time,
                timeMinutes: finitePositive(explicitMinutes) ? Number(explicitMinutes)
                  : Number(preparedTurn?.writerPacket.plan.timeCostMinutes) || 10,
                pendingDeathNews: hadPendingDeathNews,
                resolvedAction: preparedTurn?.writerPacket.resolvedAction,
              }));
              if (candidateScene && actionNarrativeContext) {
                const contextError = actionNarrativeContextError(actionNarrativeContext, candidateScene);
                if (contextError) {
                  candidateValidationErrors.push({ code: 'ACTION_CONTEXT_MISMATCH', message: contextError });
                }
              }
              if (candidateScene) {
                const playerAddressError = npcPlayerKnowledgeError(
                  candidateScene.lines,
                  playerIdentity,
                  preparedTurn?.writerPacket.npcPlayerKnowledge ?? npcPlayerKnowledge,
                );
                if (playerAddressError) {
                  candidateValidationErrors.push({
                    code: 'NPC_PLAYER_KNOWLEDGE_MISMATCH',
                    message: playerAddressError,
                  });
                }
              }

              return {
                text: candidateText,
                parseState: candidateParseState,
                scene: candidateScene,
                validationErrors: candidateValidationErrors,
              };
            };
            let protocolResiduals: ValidationError[] = resumedNarrativeFailure?.priorFormatResiduals ?? [];
            if (resumedNarrativeFailure?.formatErrors) {
              protocolResiduals = mergeProtocolRepairResiduals(
                protocolResiduals,
                resumedNarrativeFailure.formatErrors,
              );
            }
            const repairProtocol = async (rawNarrative: string) => metrics.stage('protocol', async () => {
              let candidate = validateNarrativeCandidate(rawNarrative);
              if (!preparedTurn) return candidate;
              for (let attempt = 0;
                attempt < 2 && (candidate.validationErrors.length > 0 || !candidate.scene);
                attempt += 1) {
                const errors = candidate.validationErrors.length > 0
                  ? candidate.validationErrors
                  : [{ code: 'MISSING_SCENE', message: '正文没有生成可播放场景。' }];
                const repaired = await metrics.stage('repair', () => repairNarrativeFormatAgainstWriterPacket({
                  api: resolveAnalysisApi(settings),
                  preset: activePreset,
                  packet: preparedTurn.writerPacket,
                  rejectedNarrative: candidate.text,
                  errors,
                  priorResiduals: protocolResiduals,
                  formatPrompt: settings.formatPromptTemplate,
                  abortSignal: abortController.signal,
                }));
                protocolResiduals = mergeProtocolRepairResiduals(protocolResiduals, errors);
                candidate = validateNarrativeCandidate(repaired);
              }
              return candidate;
            });

            let acceptedCandidate;
            try {
              acceptedCandidate = await repairProtocol(fullText);
              assertCurrent();
            } catch (formatRepairError) {
              assertCurrent();
              cachedNarrativeFailure = {
                chatId: tavern.activeChatId,
                input: userInput,
                ...snapshotFormatRepairCallFailure({
                  draft: fullText,
                  error: formatRepairError,
                  priorFormatResiduals: protocolResiduals,
                }),
              };
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setTurnRecovery({
                phase: 'failed_stream',
                userInput,
                errorMessage: `正文格式修复调用失败，已保留原稿：${formatRepairError instanceof Error ? formatRepairError.message : String(formatRepairError)}`,
                repairable: true,
              });
              return;
            }

            fullText = acceptedCandidate.text;
            parseStateRef.current = acceptedCandidate.parseState;
            let completedScene: Scene | null = acceptedCandidate.scene;
            actions.setStreamBuffer(fullText);
            actions.setParsedContent(parseStateRef.current.parsed);

            if (acceptedCandidate.validationErrors.length > 0 || !completedScene) {
              const errors = acceptedCandidate.validationErrors.length > 0
                ? acceptedCandidate.validationErrors
                : [{ code: 'MISSING_SCENE', message: 'AI 正文没有生成可播放场景。' }];
              const detail = formatValidationErrors(errors);
              cachedNarrativeFailure = {
                chatId: tavern.activeChatId,
                input: userInput,
                draft: fullText,
                formatErrors: errors,
                priorFormatResiduals: protocolResiduals,
              };
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setApiError('AI 输出格式不合法:\n' + detail);
              actions.setTurnRecovery({
                phase: 'failed_stream',
                userInput,
                errorMessage: `正文连续修复后格式仍不合法，已保留最新原稿：\n${detail}`,
                repairable: true,
              });
              return;
            }

            if (preparedTurn) {
              if (preparedTurn.reviewPolicy.narrative || preparedTurn.reviewPolicy.style) {
                let narrativeReview: FactReview | undefined;
                let narrativeResiduals: FactReviewViolation[] = factResidualsForRetry(resumedNarrativeFailure);
                try {
                  const withoutUngroundedLines = removeUngroundedNarrativeLines(preparedTurn.writerPacket, fullText);
                  if (withoutUngroundedLines !== fullText) {
                    const groundedCandidate = validateNarrativeCandidate(withoutUngroundedLines);
                    if (groundedCandidate.validationErrors.length === 0 && groundedCandidate.scene) {
                      fullText = groundedCandidate.text;
                      parseStateRef.current = groundedCandidate.parseState;
                      completedScene = groundedCandidate.scene;
                    }
                  }
                  const recentNarratives = recentAcceptedNarratives(messages);
                  let narrative = parseStateRef.current.parsed.maintext || fullText;
                  const styleExemptTexts = [
                    ...preparedTurn.writerPacket.authorizedFacts.map(fact => fact.text),
                    ...preparedTurn.writerPacket.playerKnownFacts.map(fact => fact.text),
                    ...preparedTurn.writerPacket.authorizedKnowledgeEvents.map(event => event.evidence),
                    ...preparedTurn.writerPacket.authorizedBackgroundFacts.map(fact => fact.text),
                    ...preparedTurn.writerPacket.approvedBackgroundFactProposals.map(fact => fact.text),
                  ];
                  const withoutExactRepeats = removeExactRepeatedLines(narrative, recentNarratives, styleExemptTexts);
                  if (withoutExactRepeats !== narrative) {
                    const dedupedCandidate = validateNarrativeCandidate(fullText.replace(narrative, withoutExactRepeats));
                    if (dedupedCandidate.validationErrors.length === 0 && dedupedCandidate.scene) {
                      fullText = dedupedCandidate.text;
                      parseStateRef.current = dedupedCandidate.parseState;
                      completedScene = dedupedCandidate.scene;
                      narrative = dedupedCandidate.parseState.parsed.maintext || dedupedCandidate.text;
                    }
                  }
                  const approvedReview: FactReview = { approved: true, violations: [], corrections: [] };
                  const reviewCandidate = async (candidateNarrative: string, candidateOutput: string) => {
                    const [candidateFactReview, candidateStyleReview] = await Promise.all([
                      preparedTurn.reviewPolicy.narrative
                        ? metrics.stage('fact-review', () => reviewNarrativeAgainstWriterPacket({
                            api: resolveAnalysisApi(settings),
                            preset: activePreset,
                            packet: preparedTurn.writerPacket,
                            narrative: candidateOutput,
                            abortSignal: abortController.signal,
                          }))
                        : Promise.resolve(approvedReview),
                      metrics.stage('style-review', () => reviewNarrativeStyle({
                        api: resolveAnalysisApi(settings),
                        preset: activePreset,
                        narrative: candidateNarrative,
                        recentNarratives,
                        exemptTexts: styleExemptTexts,
                        abortSignal: abortController.signal,
                      })),
                    ]);
                    assertCurrent();
                    return combineNarrativeReviews([candidateFactReview, candidateStyleReview]);
                  };

                  narrativeReview = await reviewCandidate(narrative, fullText);
                  assertCurrent();
                  for (let attempt = 0; attempt < 3 && narrativeReview && !narrativeReview.approved; attempt += 1) {
                    const rejectedReview = narrativeReview;
                    const repairedNarrative = await metrics.stage('repair', () => repairNarrativeAgainstWriterPacket({
                      api: resolveAnalysisApi(settings),
                      preset: activePreset,
                      packet: preparedTurn.writerPacket,
                      rejectedNarrative: fullText,
                      review: rejectedReview,
                      priorResiduals: narrativeResiduals,
                      formatPrompt: settings.formatPromptTemplate,
                      abortSignal: abortController.signal,
                    }));
                    assertCurrent();
                    narrativeResiduals = mergeRepairResiduals(narrativeResiduals, rejectedReview.violations);
                    let repairCandidate;
                    try {
                      repairCandidate = await repairProtocol(repairedNarrative);
                      assertCurrent();
                    } catch (formatRepairError) {
              assertCurrent();
                      cachedNarrativeFailure = {
                        chatId: tavern.activeChatId,
                        input: userInput,
                        ...snapshotFormatRepairCallFailure({
                          draft: repairedNarrative,
                          error: formatRepairError,
                          priorFormatResiduals: protocolResiduals,
                          review: rejectedReview,
                          priorResiduals: narrativeResiduals,
                        }),
                      };
                      actions.setStreaming(false);
                      actions.setIsWaitingForAI(false);
                      actions.setTurnRecovery({
                        phase: 'failed_stream',
                        userInput,
                        errorMessage: `正文格式修复调用失败，已保留原稿：${formatRepairError instanceof Error ? formatRepairError.message : String(formatRepairError)}`,
                        repairable: true,
                      });
                      return;
                    }
                    const groundedRepair = removeUngroundedNarrativeLines(
                      preparedTurn.writerPacket,
                      repairCandidate.text,
                    );
                    assertCurrent();
                    if (groundedRepair !== repairCandidate.text) {
                      const candidate = validateNarrativeCandidate(groundedRepair);
                      if (candidate.validationErrors.length === 0 && candidate.scene) repairCandidate = candidate;
                    }
                    const repairMaintext = repairCandidate.parseState.parsed.maintext || repairCandidate.text;
                    const dedupedRepair = removeExactRepeatedLines(
                      repairMaintext,
                      recentNarratives,
                      styleExemptTexts,
                    );
                    if (dedupedRepair !== repairMaintext) {
                      const candidate = validateNarrativeCandidate(repairCandidate.text.replace(repairMaintext, dedupedRepair));
                      if (candidate.validationErrors.length === 0 && candidate.scene) repairCandidate = candidate;
                    }
                    fullText = repairCandidate.text;
                    parseStateRef.current = repairCandidate.parseState;
                    completedScene = repairCandidate.scene;

                    if (repairCandidate.validationErrors.length > 0 || !completedScene) {
                      const errors = repairCandidate.validationErrors.length > 0
                        ? repairCandidate.validationErrors
                        : [{ code: 'MISSING_SCENE', message: 'AI 正文没有生成可播放场景。' }];
                      const detail = formatValidationErrors(errors);
                      cachedNarrativeFailure = {
                        chatId: tavern.activeChatId,
                        input: userInput,
                        ...snapshotFactRepairFormatFailure({
                          draft: fullText,
                          errors,
                          priorFormatResiduals: protocolResiduals,
                          review: rejectedReview,
                          priorResiduals: narrativeResiduals,
                        }),
                      };
                      actions.setStreaming(false);
                      actions.setIsWaitingForAI(false);
                      actions.setTurnRecovery({
                        phase: 'failed_stream',
                        userInput,
                        errorMessage: `正文修复后的格式仍不合法，已保留最新原稿：\n${detail}`,
                        repairable: true,
                      });
                      return;
                    }

                    narrativeReview = await reviewCandidate(
                      repairCandidate.parseState.parsed.maintext || repairCandidate.text,
                      repairCandidate.text,
                    );
                  }

                  if (narrativeReview && !narrativeReview.approved) {
                    const detail = narrativeReview.violations.map(item => item.message).join('\n');
                    cachedNarrativeFailure = {
                      chatId: tavern.activeChatId,
                      input: userInput,
                      draft: fullText,
                      review: narrativeReview,
                      priorResiduals: narrativeResiduals,
                    };
                    actions.setStreaming(false);
                    actions.setIsWaitingForAI(false);
                    actions.setTurnRecovery({
                      phase: 'failed_stream',
                      userInput,
                      errorMessage: `正文连续修复后仍存在事实、角色或文风问题，已保留最新原稿：\n${detail}`,
                      repairable: true,
                    });
                    return;
                  }

                  acceptedNarrativeReview = narrativeReview;
                  actions.setStreamBuffer(fullText);
                  actions.setParsedContent(parseStateRef.current.parsed);
                } catch (reviewError) {
                  assertCurrent();
                  cachedNarrativeFailure = {
                    chatId: tavern.activeChatId,
                    input: userInput,
                    ...snapshotNarrativeReviewCallFailure({
                      draft: fullText,
                      error: reviewError,
                      priorResiduals: narrativeResiduals,
                    }),
                  };
                  actions.setStreaming(false);
                  actions.setIsWaitingForAI(false);
                  actions.setTurnRecovery({
                    phase: 'failed_stream',
                    userInput,
                    errorMessage: `正文审查失败，未播放也未写入存档：${reviewError instanceof Error ? reviewError.message : String(reviewError)}`,
                    repairable: true,
                  });
                  return;
                }
              }

              const evidenceAuthority = buildStateEvidenceAuthority(earnedPresentedTurn()!.writerPacket, MYSTERY_TRUTH_GRAPH,
                preparation.request.truthContext.playerKnowledge ?? {},
                preparation.request.truthContext.unlockedClueIds, preparedTurn.factAliases.aliasToFactId);
              if (preparedTurn.reviewPolicy.state || evidenceAuthority.newEvidence.length > 0) {
                const acceptedTurn = preparedTurn;
                const stateResult = await metrics.stage('state', () => runStateWithFallback(() => runStateAgent({
                  api: resolveAnalysisApi(settings),
                  preset: activePreset,
                  currentVariables: tavern.variables,
                  gameStatus: game.gameStatus,
                  playerInput: userInput,
                  narrative: parseStateRef.current.parsed.maintext || fullText,
                  deterministicCosts: preparedTurn?.writerPacket.resolvedAction ? undefined : resolvePendingCosts() ?? undefined,
                  resolvedAction: acceptedTurn.writerPacket.resolvedAction,
                  saturationPivot: acceptedTurn.brief.saturationPivot
                    ? {
                        blockedActorId: acceptedTurn.brief.saturationPivot.blockedActorId,
                        redirectedActorId: acceptedTurn.brief.saturationPivot.redirectedActorId,
                        requiredSuspicionGain: acceptedTurn.brief.saturationPivot.requiredSuspicionGain,
                      }
                    : undefined,
                  abortSignal: abortController.signal,

                  evidenceAuthority,
                }), stateError => {
                  actions.addNotification({ type: 'warning',
                    message: `状态分析失败，本回合仅结算固定成本：${stateError instanceof Error ? stateError.message : String(stateError)}`, duration: 6000 });
                  return null;
                }, assertCurrent));
                assertCurrent();
                // Only the already-reviewed narrative summary may enter durable memory.
                // State analyzes numeric changes; its free-form summary has no fact authority.
                if (stateResult && (stateResult.rejected.length || stateResult.clamped.length)) {
                  console.warn('[state-agent]', stateResult.rejected, stateResult.clamped);
                }
                await finalize(stateResult ? 'dual' : 'primary', stateResult?.vars ?? {}, completedScene);
              } else {
                await finalize('primary', {}, completedScene);
              }
            } else {
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setTurnRecovery({
                phase: 'blocked_pipeline',
                userInput,
                errorMessage: '受控剧情编排结果缺失，本回合未播放也未写入存档。',
              });
            }
      };

      if (resumedNarrativeFailure?.reviewPending) {
        // The Writer already produced a protocol-valid draft. A transient critic
        // failure resumes here so retry does not spend a call rewriting good text.
        fullText = resumedNarrativeFailure.draft;
        actions.setStreamBuffer(fullText);
        await completeNarrative();
      } else {
        endWriter = metrics.startStage('writer');
        await streamChatCompletion(
          settings.api,
          requestMessages,
          activePreset,
          {
            onToken: (token) => {
              assertCurrent();
              metrics.markFirstToken();
              fullText += token;
              actions.setStreamBuffer(fullText);
              // Deliberately do not parse or render partial output. The complete
              // turn must pass protocol, narrative and transaction validation first.
            },
            onComplete: completeNarrative,
            onError: (error) => {
              assertCurrent();
              actions.setStreaming(false);
              actions.setIsWaitingForAI(false);
              actions.setApiError(error.message);
              actions.setTurnRecovery({ phase: 'failed_stream', userInput, errorMessage: error.message });
            },
          },
          abortController.signal,
          {
            onRetry: (attempt, retryError) => {
              assertCurrent();
              actions.addNotification({
                type: 'warning',
                message: `连接失败，正在自动重试（第 ${attempt} 次）: ${retryError.message}`,
                duration: 4000,
              });
            },
          }
        );
      }
    } catch (error) {
      const cancelled = abortController.signal.aborted || !ownsTurn()
        || (error instanceof ApiCallError && error.kind === 'abort')
        || (error instanceof Error && error.name === 'AbortError');
      metrics.finish(cancelled ? 'cancelled' : 'failed');
      if (ownsTurn()) {
        actions.setStreaming(false);
        actions.setIsWaitingForAI(false);
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '未知错误';
          actions.setApiError(message);
          actions.setTurnRecovery({ phase: 'failed_stream', userInput, errorMessage: message });
        }
      }
    } finally {
      metrics.finish(turnCommitted ? 'success' : abortController.signal.aborted || !ownsTurn() ? 'cancelled' : 'failed');
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
  const retryTurn = useCallback(async () => {
    const recovery = store.api.turnRecovery;
    if (recovery.phase === 'idle' || !recovery.userInput) return;
    await sendMessage(recovery.userInput, { isRetry: true });
  }, [store, sendMessage]);

  /** 明确丢弃失败正文，但仍复用已通过的导演计划重新生成。 */
  const regenerateTurn = useCallback(async () => {
    const recovery = store.api.turnRecovery;
    if (recovery.phase === 'idle' || !recovery.userInput) return;
    cachedNarrativeFailure = null;
    await sendMessage(recovery.userInput, { isRetry: true, forceRegenerate: true });
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
    cachedNarrativeFailure = null;
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
              originalInput: item.desc,
              selection: { kind: 'investigation' },
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
              originalInput: item.desc,
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

  return { sendMessage, selectOption, performAction, reroll, retryTurn, regenerateTurn, dismissRecovery };
}
