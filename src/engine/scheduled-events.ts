import { crossesThreshold } from './game-clock';

export const DEATH_NEWS_TIME = '2024-09-09T16:00:00';

/**
 * 定时事件表。引擎只管「何时必须发生」，怎么演全交给写手。
 * 目前仅一条 death-news；将来扩展文穗时刻表时在此增加记录。
 */
export function checkScheduledEvents(
  prevTimeISO: string,
  nextTimeISO: string,
  variables: Record<string, any>,
): { deathNews?: 'pending' } {
  if (!variables.deathNews && crossesThreshold(prevTimeISO, nextTimeISO, DEATH_NEWS_TIME)) {
    return { deathNews: 'pending' };
  }
  return {};
}

const DEATH_NEWS_DIRECTIVE =
  '【定时事件·必须执行】时间已过16:00：文穗的死讯必须在本回合送达玩家（警方电话、警察上门、邻居传话等形式自选，地点不合适就让消息追到玩家所在处）。死讯到达后叙事基调转为崩溃，理智应明显下降。';

const COLLAPSE_DIRECTIVE =
  '【崩溃段】玩家已得知文穗的死讯。维持崩溃与失序氛围：理智持续下滑，调查/行动项收窄为与死讯相关或麻木的日常动作，NPC 反应事件余波。不要提供任何能拯救文穗的选项，时间将自然推进到午夜触发轮回。';

export function buildScheduledDirectives(variables: Record<string, any>): string[] {
  if (variables.deathNews === 'pending') return [DEATH_NEWS_DIRECTIVE];
  if (variables.deathNews === 'delivered') return [COLLAPSE_DIRECTIVE];
  return [];
}
