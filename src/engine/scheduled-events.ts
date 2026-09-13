import { crossesThreshold } from './game-clock';
import type { DynamicRecord } from '../sillytavern/types';

export const DEATH_NEWS_TIME = '2024-09-09T16:00:00';

export interface ScheduledBoundary {
  id: string;
  at: string;
}

function parseBoundaryClock(value: string): number {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new TypeError('scheduled boundary clock must be valid');
  return time;
}

function toLocalISO(time: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
    + `T${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

/**
 * Return the earliest deterministic blocker. Task 6 maps active, validated
 * commitments into `commitmentBoundaries`; this module does not read memory.
 */
export function nextScheduledBoundary(
  time: string,
  variables: DynamicRecord,
  commitmentBoundaries: ScheduledBoundary[] = [],
): ScheduledBoundary | undefined {
  const now = parseBoundaryClock(time);
  const candidates: Array<ScheduledBoundary & { priority: number; clock: number }> = [];

  const midnight = new Date(now);
  const resetIsDue = midnight.getHours() === 0
    && midnight.getMinutes() === 0
    && midnight.getSeconds() === 0
    && midnight.getMilliseconds() === 0;
  if (!resetIsDue) midnight.setHours(24, 0, 0, 0);
  const midnightAt = resetIsDue ? time : toLocalISO(midnight);
  candidates.push({ id: 'midnight', at: midnightAt, priority: 0, clock: parseBoundaryClock(midnightAt) });

  if (variables.deathNews !== 'delivered') {
    const deathClock = parseBoundaryClock(DEATH_NEWS_TIME);
    const dueNow = variables.deathNews === 'pending' || deathClock <= now;
    const at = dueNow ? time : DEATH_NEWS_TIME;
    candidates.push({ id: 'death-news', at, priority: 1, clock: parseBoundaryClock(at) });
  }

  for (const boundary of commitmentBoundaries) {
    if (!boundary || typeof boundary.id !== 'string' || boundary.id.length === 0 || boundary.id.trim() !== boundary.id) {
      throw new TypeError('scheduled boundary id must be a stable non-empty string');
    }
    const clock = parseBoundaryClock(boundary.at);
    candidates.push({
      id: boundary.id,
      at: clock <= now ? time : boundary.at,
      priority: 2,
      clock: Math.max(now, clock),
    });
  }

  const next = candidates.sort((left, right) => (
    left.clock - right.clock || left.priority - right.priority || left.id.localeCompare(right.id)
  ))[0];
  return next ? { id: next.id, at: next.at } : undefined;
}

/**
 * 定时事件表。引擎只管「何时必须发生」，怎么演全交给写手。
 * 目前仅一条 death-news；将来扩展文穗时刻表时在此增加记录。
 */
export function checkScheduledEvents(
  prevTimeISO: string,
  nextTimeISO: string,
  variables: DynamicRecord,
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

export function buildScheduledDirectives(variables: DynamicRecord): string[] {
  if (variables.deathNews === 'pending') return [DEATH_NEWS_DIRECTIVE];
  if (variables.deathNews === 'delivered') return [COLLAPSE_DIRECTIVE];
  return [];
}
