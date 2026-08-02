import { maintextToScene } from '../engine/scene-parser';
import { invalidatePreplans } from '../agents/mystery';
import type { ChatMessage } from '../sillytavern/types';
import { persistActiveChat } from './chatPersistence';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import { createDefaultGameStatus } from './gameSession';
import { resolveSceneEnvironment } from './sceneEnvironment';

export const STAY_OPTION_TEXT = '不出门，陪文穗过完今天';
export const GOODBYE_OPTION_TEXT = '对文穗说再见';

export type CycleResetReason = 'stamina' | 'sanity' | 'day-end' | 'stay';

export interface CycleTransitionContext {
  lastPlayerChoice?: string;
  lastTurnSummary?: string;
}

/** 跨轮继承的字段(线索/认知/累计进度) */
const INHERITED_KEYS = [
  'unlockedClues',
  'organizedClues',
  'cultClues',
  'worldGlitchClues',
  'fakeEvidence',
  'letterFragments',
  'routesLockedEver',
  'knowledgeEvents',
  'mysteryKnowledge',
  'suspicion',
] as const;

const DAY_END = new Date(2024, 8, 10, 0, 0);

/** 判断本回合结束后是否触发轮回重置(体力/理智耗尽或一天结束) */
export function checkCycleFailure(status: { stamina: number; sanity: number; time: Date }): CycleResetReason | null {
  if (status.stamina <= 0) return 'stamina';
  if (status.sanity <= 0) return 'sanity';
  if (status.time instanceof Date && !Number.isNaN(status.time.getTime()) && status.time.getTime() >= DAY_END.getTime()) {
    return 'day-end';
  }
  return null;
}

/**
 * 轮回结算: 继承线索/认知/累计进度，重置当日状态，cycleCount+1。
 * stayed=true 表示本轮以「陪文穗过完今天」结束，stayStreak 累加，否则归零。
 */
export function settleCycleVariables(
  current: Record<string, any>,
  opts: { stayed?: boolean } = {},
): Record<string, any> {
  const next = createDefaultVariables();
  for (const key of INHERITED_KEYS) {
    if (current[key] !== undefined) next[key] = current[key];
  }
  next.cycleCount = Number(current.cycleCount ?? 1) + 1;
  next.stayStreak = opts.stayed ? Number(current.stayStreak ?? 0) + 1 : 0;
  next.stayedEver = Boolean(current.stayedEver) || next.stayStreak >= 3;
  next.loopSuspicionStart = { ...(next.suspicion ?? {}) };
  next.time = '2024-09-09T08:00:00';
  next.stamina = 100;
  next.sanity = 70;
  return next;
}

/** 元层选项: STAY 需锁定过≥1条路线且见过≥3个结局且在家；TRUE 需三线锁定且曾 STAY */
export function getCycleMetaOptions(
  variables: Record<string, any>,
  endingsSeen: string[],
): string[] {
  const ctx = variablesToEndingContext(variables, endingsSeen);
  const atHome = (variables.location ?? 'home') === 'home';
  const options: string[] = [];
  if (atHome && ctx.routesLockedCount >= 1 && endingsSeen.length >= 3) {
    options.push(STAY_OPTION_TEXT);
  }
  if (atHome && ctx.routesLockedCount >= 3 && ctx.stayedEver) {
    options.push(GOODBYE_OPTION_TEXT);
  }
  return options;
}

const REASON_LINES: Record<CycleResetReason, string> = {
  stamina: '身体先撑不住了。视野暗下去的最后一刻，你听见的还是雨声。',
  sanity: '思绪在某个瞬间断了线。你分不清是自己闭上了眼，还是世界闭上了眼。',
  'day-end': '午夜零点。雨没有停，但这一天到头了。',
  stay: '你留了下来。这一天像糖一样慢慢化完。然后，闹钟又响了。',
};

export function buildCycleOpeningMaintext(
  cycleCount: number,
  reason: CycleResetReason,
  context: CycleTransitionContext = {},
): string {
  const choice = context.lastPlayerChoice?.trim().slice(0, 100);
  const summary = context.lastTurnSummary?.trim().slice(0, 120);
  const consequenceBridge = choice
    ? `对话|旁白|tense|你确实尝试了“${choice}”。这次行动的后果留在了这一天里，却没能阻止时间走到尽头。\n`
    : '';
  const memoryBridge = summary
    ? `\n对话|旁白|calm|重置前最后发生的事仍留在你的记忆里：${summary}`
    : '';
  return `${consequenceBridge}场景|black
效果|loop-transition
音乐|silence
对话|旁白|calm|${REASON_LINES[reason]}
场景|bedroom1-day
对话|旁白|calm|9月9日，早上8:00。闹钟响了。暴雨的第五天——和之前的每一次一模一样。
对话|旁白|calm|被子的另一半叠得整整齐齐。桌上会有还温着的早餐，和一张纸条。你已经知道上面写着什么。
对话|旁白|calm|这是第 ${cycleCount} 次。你记得的一切都还在。但这个世界不记得。${memoryBridge}
对话|旁白|calm|昨天约好的人、等候的位置和正在执行的计划都已被重置作废。你必须依据保留下来的记忆，重新决定今天怎么做。`;
}

function transitionContextFromMessages(messages: ChatMessage[]): CycleTransitionContext {
  const user = [...messages].reverse().find(message => message.role === 'user');
  const assistant = [...messages].reverse().find(message => message.role === 'assistant');
  const summary = assistant?.content.match(/<sum>([\s\S]*?)<\/sum>/i)?.[1];
  return { lastPlayerChoice: user?.content, lastTurnSummary: summary };
}

/**
 * 进入下一轮: 注入轮回过场与开局消息，重置运行时状态。
 * variables 必须是已结算(settleCycleVariables)后的变量。
 */
export async function startNextCycle(opts: {
  variables: Record<string, any>;
  reason: CycleResetReason;
}): Promise<void> {
  const state = useGameStore.getState();
  const { actions } = state;
  const variables = opts.variables;
  const cycleCount = Number(variables.cycleCount ?? 1);

  // 轮回重置后世界状态归零，作废阅读期预跑的编排结果
  invalidatePreplans();

  const activeChat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);
  const maintext = buildCycleOpeningMaintext(
    cycleCount,
    opts.reason,
    activeChat ? transitionContextFromMessages(activeChat.messages) : {},
  );
  const assistantMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: `<maintext>\n${maintext}\n</maintext>\n<sum>第${cycleCount}轮开始:回到9月9日早上8:00，线索与记忆保留，当日状态重置，旧计划失效</sum>\n<vars>{}</vars>`,
    timestamp: Date.now(),
    variables,
  };

  if (activeChat) {
    await persistActiveChat({ messages: [...activeChat.messages, assistantMsg], variables });
  }

  const scene = maintextToScene(maintext);
  const first = scene.lines[0];

  useGameStore.setState(s => ({
    tavern: { ...s.tavern, variables },
    game: {
      ...s.game,
      currentScene: scene,
      currentLineIndex: 0,
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
      },
    },
  }));

  actions.addNotification({ type: 'info', message: `第 ${cycleCount} 次轮回开始了`, duration: 2600 });
}

/** 处理元层选项。返回 true 表示已消费(不发送给 LLM)。 */
export async function handleCycleMetaOption(option: string): Promise<boolean> {
  const state = useGameStore.getState();
  const { actions } = state;

  if (option === GOODBYE_OPTION_TEXT) {
    const variables = { ...state.tavern.variables, finalChoice: 'goodbye' };
    actions.setVariables(variables);
    actions.setEndingPanel({ isPreview: false });
    actions.setPendingEnding('TRUE');
    actions.setSceneComplete(true);
    return true;
  }

  if (option === STAY_OPTION_TEXT) {
    const settled = settleCycleVariables(state.tavern.variables, { stayed: true });
    if (settled.stayStreak >= 3 && !state.game.endingsSeen.includes('STAY')) {
      actions.setVariables(settled);
      actions.setEndingPanel({ isPreview: false });
      actions.setPendingEnding('STAY');
      actions.setSceneComplete(true);
    } else {
      await startNextCycle({ variables: settled, reason: 'stay' });
    }
    return true;
  }

  return false;
}
