import { advanceClock, crossesThreshold } from './game-clock';
import type { DynamicRecord } from '../sillytavern/types';
import {
  projectPublicInvestigationOpportunities,
  type InvestigationOpportunity,
  type PublicInvestigationOpportunity,
} from './investigation-opportunities';

export const DEATH_NEWS_TIME = '2024-09-09T16:00:00';
/** Stable event ID denotes receipt, never confirmation of identity or death timing. */
export const PRELIMINARY_DEATH_NEWS = '警方通过正式电话向玩家送达初步死亡通报：发现一名疑似文穗的死者。死者身份、死亡时刻与死因仍待核实；通报没有给出凶手或案发经过。';

export interface ScheduledBoundary {
  id: string;
  at: string;
}

export interface PlanQuietWaitInput {
  time: string;
  variables: DynamicRecord;
  requestedMinutes?: number;
  commitmentBoundaries?: ScheduledBoundary[];
  opportunities?: readonly InvestigationOpportunity[];
}

export type QuietWaitDecision =
  | {
      kind: 'deliver-boundary';
      requestedMinutes: 0;
      endTime: string;
      boundary: ScheduledBoundary;
      expiringOpportunities: PublicInvestigationOpportunity[];
    }
  | {
      kind: 'wait';
      requestedMinutes: number;
      endTime: string;
      boundary?: ScheduledBoundary;
      expiringOpportunities: PublicInvestigationOpportunity[];
    };

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

export function planQuietWait(input: PlanQuietWaitInput): QuietWaitDecision {
  const now = parseBoundaryClock(input.time);
  if (
    input.requestedMinutes !== undefined
    && (!Number.isSafeInteger(input.requestedMinutes) || input.requestedMinutes <= 0)
  ) {
    throw new RangeError('requested wait minutes must be a positive whole number');
  }
  const boundary = nextScheduledBoundary(
    input.time,
    input.variables,
    input.commitmentBoundaries ?? [],
  );
  if (!boundary) throw new Error('quiet wait requires a scheduled boundary');
  const boundaryMinutes = Math.floor((parseBoundaryClock(boundary.at) - now) / 60_000);
  if (boundaryMinutes <= 0) {
    return {
      kind: 'deliver-boundary',
      requestedMinutes: 0,
      endTime: input.time,
      boundary,
      expiringOpportunities: [],
    };
  }

  const requestedMinutes = Math.min(input.requestedMinutes ?? boundaryMinutes, boundaryMinutes);
  const endTime = advanceClock(input.time, requestedMinutes);
  const end = parseBoundaryClock(endTime);
  const expiring = (input.opportunities ?? []).filter(opportunity => {
    if (!opportunity.availableUntil) return false;
    const availableUntil = parseBoundaryClock(opportunity.availableUntil);
    return availableUntil > now && availableUntil <= end;
  });
  return {
    kind: 'wait',
    requestedMinutes,
    endTime,
    ...(requestedMinutes === boundaryMinutes ? { boundary } : {}),
    expiringOpportunities: projectPublicInvestigationOpportunities(expiring),
  };
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
  `【定时事件·必须执行】时间已到16:00，必须在本回合演出初步通报送达。${PRELIMINARY_DEATH_NEWS}以具体反应呈现消息的冲击；旁白不能把初步通报写成文穗死亡、当天死亡或死亡时刻的系统确认。资源变化只服从程序结算。`;

const AFTERMATH_DIRECTIVE =
  '【初步通报余波】玩家已收到涉及文穗的初步死亡通报；死者身份、死亡时刻与死因仍待各自证据核实。允许真实的哀痛、基于现有信息的有限跟进、休息或明确等待；不能凭通报保证救援成败，也不得用气氛要求资源下降或封死其他合理选择。';

export function buildScheduledDirectives(variables: DynamicRecord): string[] {
  if (variables.deathNews === 'pending') return [DEATH_NEWS_DIRECTIVE];
  if (variables.deathNews === 'delivered') return [AFTERMATH_DIRECTIVE];
  return [];
}
