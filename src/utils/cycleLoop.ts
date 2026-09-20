import { maintextToScene } from '../engine/scene-parser';
import { invalidatePreplans } from '../agents/mystery';
import type { ChatMessage, DynamicRecord } from '../sillytavern/types';
import { persistActiveChat } from './chatPersistence';
import { isRecord, variablesToEndingContext } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import { createDefaultGameStatus } from './gameSession';
import { resolveSceneEnvironment } from './sceneEnvironment';
import { settleCycleVariables } from '../engine/cycle-settlement';
import { acceptedCycleConsequence, buildCycleKeyScene, cycleProse, presentedCycleBeatIds } from '../engine/cycle-key-scenes';
import { buildTurnCommit } from '../memory/world-memory';
import { buildNarrativeSummary } from '../memory/narrative-summary';
import { buildMetaEndingTransitionMaintext } from '../engine/conclusion-transition';

export { settleCycleVariables } from '../engine/cycle-settlement';

export const STAY_OPTION_TEXT = '留在家里，回忆与文穗相处的日子';
export const GOODBYE_OPTION_TEXT = '在记忆中对文穗说再见';
const LEGACY_STAY_OPTION_TEXT = '不出门，陪文穗过完今天';
const LEGACY_GOODBYE_OPTION_TEXT = '对文穗说再见';

import type { CycleResetReason } from '../engine/cycle-failure';
export { checkCycleFailure, type CycleResetReason } from '../engine/cycle-failure';

export interface CycleTransitionContext {
  lastPlayerChoice?: string;
  lastTurnSummary?: string;
}

/**
 * 轮回结算: 继承线索/认知/累计进度，重置当日状态，cycleCount+1。
 * stayed=true 表示本轮以「陪文穗过完今天」结束，stayStreak 累加，否则归零。
 */
/** 元层选项: STAY 需锁定过≥1条路线且见过≥3个结局且在家；TRUE 需三线锁定且曾 STAY */
export function getCycleMetaOptions(
  variables: DynamicRecord,
  endingsSeen: string[],
): string[] {
  const ctx = variablesToEndingContext(variables, endingsSeen);
  const atHome = (variables.location ?? 'home') === 'home';
  const options: string[] = [];
  if (atHome && Number(ctx.routesLockedCount) >= 1 && endingsSeen.length >= 3) {
    options.push(STAY_OPTION_TEXT);
  }
  if (atHome && Number(ctx.routesLockedCount) >= 3 && Boolean(ctx.stayedEver)) {
    options.push(GOODBYE_OPTION_TEXT);
  }
  return options;
}

const REASON_LINES: Record<CycleResetReason, string> = {
  stamina: '身体先撑不住了。视野暗下去的最后一刻，你听见的还是雨声。',
  sanity: '思绪在某个瞬间断了线。你分不清是自己闭上了眼，还是世界闭上了眼。',
  'day-end': '午夜零点。雨没有停，但这一天到头了。',
  stay: '你留在家里，反复回忆与文穗相处的旧日。回忆没有把她带回眼前。这一天过去以后，闹钟又响了。',
};

export function buildCycleOpeningMaintext(
  cycleCount: number,
  reason: CycleResetReason,
  context: CycleTransitionContext = {},
): string {
  const summary = context.lastTurnSummary ? cycleProse(context.lastTurnSummary) : undefined;
  const memoryBridge = summary
    ? `\n对话|旁白|calm|重置前最后发生的事仍留在你的记忆里：${summary}`
    : '';
  return `场景|black
效果|loop-transition
音乐|silence
对话|旁白|calm|${REASON_LINES[reason]}
场景|bedroom1-day
对话|旁白|calm|9月9日，早上8:00。闹钟响了。暴雨的第五天——和之前的每一次一模一样。
对话|旁白|calm|被子的另一半叠得整整齐齐。你看着熟悉的桌沿，试着把记得的事与眼前的事分开。
对话|旁白|calm|这是第 ${cycleCount} 次。你记得之前经历的一天，窗外的雨声又落在同一个早晨。${memoryBridge}
对话|旁白|calm|昨天约好的人、等候的位置和正在执行的计划都已被重置作废。你必须依据保留下来的记忆，重新决定今天怎么做。`;
}

const pendingCycleStarts = new Map<string, Promise<void>>();

/**
 * 进入下一轮: 注入轮回过场与开局消息，重置运行时状态。
 * variables 必须是已结算(settleCycleVariables)后的变量。
 */
export function startNextCycle(opts: {
  variables: DynamicRecord;
  reason: CycleResetReason;
}): Promise<void> {
  const chatId = useGameStore.getState().tavern.activeChatId;
  const key = `${chatId ?? 'no-chat'}:cycle:${Number(opts.variables.cycleCount ?? 1)}`;
  const pending = pendingCycleStarts.get(key);
  if (pending) return pending;
  const task = commitNextCycle(opts).finally(() => { pendingCycleStarts.delete(key); });
  pendingCycleStarts.set(key, task);
  return task;
}

async function commitNextCycle(opts: { variables: DynamicRecord; reason: CycleResetReason }): Promise<void> {
  const state = useGameStore.getState();
  const { actions } = state;
  let variables = opts.variables;
  const cycleCount = Number(opts.variables.cycleCount ?? 1);
  const activeChat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);
  const messageId = `cycle-opening:${activeChat?.id ?? 'no-chat'}:${cycleCount}`;
  const existing = activeChat?.messages.find(message => message.id === messageId);
  if (existing && Number(state.tavern.variables.cycleCount) >= cycleCount) return;
  if (Number(state.tavern.variables.cycleCount) > cycleCount) return;

  // 轮回重置后世界状态归零，作废阅读期预跑的编排结果
  invalidatePreplans();

  const keyScene = buildCycleKeyScene({ nextVariables: variables, previousVariables: state.tavern.variables, messages: activeChat?.messages ?? [] });
  const startsNewVersion = variables.storyProgress?.versionStartCycle === cycleCount;
  const opening = buildCycleOpeningMaintext(
    cycleCount,
    opts.reason,
    cycleCount === 4 || startsNewVersion ? {} : { lastTurnSummary: acceptedCycleConsequence(state.tavern.variables, activeChat?.messages ?? []) },
  );
  const maintext = existing?.content.match(/<maintext>([\s\S]*?)<\/maintext>/i)?.[1]?.trim()
    ?? `${opening}${keyScene.maintext ? `\n${keyScene.maintext}` : ''}`;
  const scene = { ...maintextToScene(maintext), sourceMessageId: messageId };
  if (existing) variables = existing.variables;
  else {
    const mysteryKnowledge = { ...(isRecord(variables.mysteryKnowledge) ? variables.mysteryKnowledge : {}) };
    for (const id of keyScene.grantedFactIds) {
      if (mysteryKnowledge[id] !== 'confirmation') mysteryKnowledge[id] = 'clue';
    }
    variables = { ...variables, mysteryKnowledge,
      unlockedClues: [...new Set([...(Array.isArray(variables.unlockedClues) ? variables.unlockedClues : []), ...keyScene.grantedFactIds])],
      storyProgress: { ...variables.storyProgress, presentedBeatIds: [
        ...presentedCycleBeatIds(variables), ...(keyScene.beatId ? [keyScene.beatId] : []),
      ], ...(keyScene.beatId ? { recalledSourcesByBeat: {
        ...variables.storyProgress?.recalledSourcesByBeat, [keyScene.beatId]: keyScene.recalledSources,
      } } : {}) },
    };
    if (keyScene.grantedFactIds.length) {
      const commit = buildTurnCommit({ turnId: messageId, turnIndex: activeChat?.messages.length ?? 0,
        createdAt: Date.now(), occurredAt: '2024-09-09T08:00:00', locationId: 'home', cycleCount,
        summary: '玩家读到文穗事前留下的自主边界便条；便条不能核实当前身份、存活或实际行程。',
        scene, beforeVariables: opts.variables, settledVariables: variables });
      commit.worldMemory.events = commit.worldMemory.events.map(event => event.turnId === messageId ? { ...event, kind: 'fact' } : event);
      variables = { ...variables, worldMemory: commit.worldMemory };
    }
  }
  const summary = `第${cycleCount}个重复日开始：9月9日08:00，玩家回到公寓，线索与记忆保留，当日状态重置、旧计划失效。${keyScene.summary}`;
  const resetTime = createDefaultGameStatus().time;
  const assistantMsg: ChatMessage = {
    id: messageId,
    role: 'assistant',
    content: `<maintext>\n${maintext}\n</maintext>\n<sum>${summary}</sum>\n<vars>{}</vars>`,
    timestamp: Date.now(),
    variables,
    narrativeSummary: buildNarrativeSummary({ text: summary, scene, startedAt: resetTime, endedAt: resetTime,
      cycleCount, startLocationId: 'home', endLocationId: 'home' }),
  };

  const controller = new AbortController();
  const stillCurrent = () => useGameStore.getState().tavern.activeChatId === state.tavern.activeChatId
    && useGameStore.getState().tavern.variables === state.tavern.variables;
  const unsubscribe = useGameStore.subscribe(() => { if (!stillCurrent()) controller.abort(); });
  const guard = { signal: controller.signal, assertCurrent: () => {
    if (controller.signal.aborted || !stillCurrent()) throw new DOMException('轮回保存期间已切换会话或状态', 'AbortError');
  } };
  try {
    if (activeChat && !existing) await persistActiveChat({ messages: [...activeChat.messages, assistantMsg], variables }, guard);
    guard.assertCurrent();
  } finally { unsubscribe(); }
  const first = scene.lines[0];

  useGameStore.setState(s => ({
    tavern: { ...s.tavern, variables },
    game: {
      ...s.game,
      currentScene: scene,
      currentLineIndex: 0,
      dialogueProgress: null,
      gameStatus: createDefaultGameStatus(),
      currentState: {
        background: first?.background || 'bedroom1-day',
        bgm: first?.bgm || null,
        character: null,
        speaker: first?.speaker || null,
        mood: 'calm',
        effect: 'loop-transition',
        environment: resolveSceneEnvironment(first?.background || 'bedroom1-day'),
        item: null,
      },
      isTyping: false,
      isWaitingForAI: false,
      sceneComplete: false,
      pendingCycleReset: null,
      actionPanel: { visible: false, type: null, content: '', selectedIndex: null },
      endingCheckContext: variablesToEndingContext(variables, s.game.endingsSeen) as typeof s.game.endingCheckContext,
      endingPanel: { visible: false, activeEndingId: null, pendingEndingId: null, isPreview: false, isAnimating: false },
    },
    api: {
      ...s.api,
      isStreaming: false,
      streamBuffer: '',
      error: null,
      parsedContent: {
        thinking: '',
        maintext: '',
        options: [],
        summary: '',
        vars: {},
        observe: '',
        investigateItems: [],
        actionItems: [],
        actionOutcome: undefined,
        optionBindings: undefined,
      },
    },
  }));

  actions.addNotification({ type: 'info', message: `第 ${cycleCount} 次轮回开始了`, duration: 2600 });
}

/** 处理元层选项。返回 true 表示已消费(不发送给 LLM)。 */
export async function handleCycleMetaOption(option: string): Promise<boolean> {
  const state = useGameStore.getState();
  const { actions } = state;

  if (option === GOODBYE_OPTION_TEXT || option === LEGACY_GOODBYE_OPTION_TEXT) {
    const variables = { ...state.tavern.variables, finalChoice: 'goodbye' };
    actions.setVariables(variables);
    actions.setEndingPanel({ isPreview: false });
    actions.setPendingEnding('TRUE');
    actions.setCurrentScene(maintextToScene(buildMetaEndingTransitionMaintext('TRUE')));
    return true;
  }

  if (option === STAY_OPTION_TEXT || option === LEGACY_STAY_OPTION_TEXT) {
    const settled = settleCycleVariables(state.tavern.variables, { stayed: true });
    if (Number(settled.stayStreak) >= 3 && !state.game.endingsSeen.includes('STAY')) {
      actions.setVariables(settled);
      actions.setEndingPanel({ isPreview: false });
      actions.setPendingEnding('STAY');
      actions.setCurrentScene(maintextToScene(buildMetaEndingTransitionMaintext('STAY')));
    } else {
      await startNextCycle({ variables: settled, reason: 'stay' });
    }
    return true;
  }

  return false;
}
