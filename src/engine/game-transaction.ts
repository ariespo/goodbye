import type { DynamicRecord, Ending, GameStatus } from '../sillytavern/types';
import { checkEndingConditions } from '../sillytavern/ending-checker';
import { mergeVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { checkCycleFailure, type CycleResetReason } from '../utils/cycleLoop';
import { advanceClock, clampTimeCost, laterTime } from './game-clock';
import { checkScheduledEvents } from './scheduled-events';

export interface GameResourceCosts {
  timeMinutes?: number;
  stamina?: number;
  sanity?: number;
}

export interface GameTransactionInput {
  variables: DynamicRecord;
  gameStatus: GameStatus;
  variablePatch?: DynamicRecord;
  costs?: GameResourceCosts;
  endings?: Ending[];
  endingsSeen?: string[];
  hasEndingInProgress?: boolean;
  /** 叙事回合开始前已有待送达死讯；回合成功后由引擎确认已送达。 */
  deliverPendingDeathNews?: boolean;
}

export interface GameTransactionResult {
  previousVariables: DynamicRecord;
  previousGameStatus: GameStatus;
  variables: DynamicRecord;
  gameStatus: GameStatus;
  scheduledEventPatch: DynamicRecord;
  ending: Ending | null;
  failure: CycleResetReason | null;
}

function finiteNonNegative(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function finiteStatus(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
}

function resolvePreviousTime(variables: DynamicRecord, status: GameStatus): string {
  if (typeof variables.time === 'string' && !Number.isNaN(new Date(variables.time).getTime())) {
    return variables.time;
  }
  return status.time.toISOString();
}

/**
 * 所有会改变游戏数值的路径都应经过这里：
 * 合并受信状态补丁 → 扣除确定性成本 → 推进时钟 → 定时事件 → 结局/轮回失败判定。
 */
export function settleGameTransaction(input: GameTransactionInput): GameTransactionResult {
  const previousVariables = { ...input.variables };
  const previousGameStatus = {
    ...input.gameStatus,
    time: new Date(input.gameStatus.time),
    items: [...input.gameStatus.items],
  };
  const patch = { ...(input.variablePatch ?? {}) };
  const requestedTime = typeof patch.time === 'string' ? patch.time : null;
  delete patch.time;

  let variables = mergeVariables(input.variables, patch);
  const staminaBeforeCost = finiteStatus(variables.stamina, input.gameStatus.stamina, 0, 120);
  const sanityBeforeCost = finiteStatus(variables.sanity, input.gameStatus.sanity, 0, 100);
  const stamina = Math.max(0, staminaBeforeCost - finiteNonNegative(input.costs?.stamina));
  const sanity = Math.max(0, sanityBeforeCost - finiteNonNegative(input.costs?.sanity));

  const previousTime = resolvePreviousTime(input.variables, input.gameStatus);
  const rawMinutes = finiteNonNegative(input.costs?.timeMinutes);
  const advancedTime = rawMinutes > 0
    ? advanceClock(previousTime, clampTimeCost(rawMinutes))
    : previousTime;
  const time = requestedTime ? laterTime(advancedTime, requestedTime) : advancedTime;

  const scheduledEventPatch = checkScheduledEvents(previousTime, time, variables);
  variables = {
    ...variables,
    stamina,
    sanity,
    time,
    ...scheduledEventPatch,
  };
  if (
    input.deliverPendingDeathNews
    && input.variables.deathNews === 'pending'
    && !scheduledEventPatch.deathNews
  ) {
    variables.deathNews = 'delivered';
  }

  const gameStatus: GameStatus = {
    ...input.gameStatus,
    stamina,
    sanity,
    time: new Date(time),
  };

  const ending = !input.hasEndingInProgress && input.endings
    ? checkEndingConditions(
        variablesToEndingContext(variables, input.endingsSeen ?? []),
        input.endings,
        input.endingsSeen ?? [],
      )
    : null;
  const failure = ending ? null : checkCycleFailure(gameStatus);

  return {
    previousVariables,
    previousGameStatus,
    variables,
    gameStatus,
    scheduledEventPatch,
    ending,
    failure,
  };
}
