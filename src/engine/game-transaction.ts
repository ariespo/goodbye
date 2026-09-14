import type { DynamicRecord, Ending, GameStatus } from '../sillytavern/types';
import { checkEndingConditions } from '../sillytavern/ending-checker';
import { mergeVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { checkCycleFailure, type CycleResetReason } from './cycle-failure';
import { advanceClock, clampTimeCost, laterTime } from './game-clock';
import { checkScheduledEvents } from './scheduled-events';
import { hasDeliveredDeathNews } from './narrative-contract';
import { getLocationById, resolveRegisteredLocation } from '../data/locations';
import type { ResolvedActionOutcome } from './action-resolution';
import { commitmentBoundariesFromVariables } from './commitment-boundaries';

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
  /** Only successful generated turns have a minimum clock advance; local UI operations may be free. */
  narrativeTurn?: boolean;
  narrativeText?: string;
  /** Program-owned immutable result; model patches and menu costs cannot override it. */
  resolvedAction?: ResolvedActionOutcome;
  pendingActionAuthorization?: import('../agents/mystery/pending-action-authorization').PendingActionAuthorization | null;
  pendingActionSceneContext?: import('./action-scene-continuity').ActionSceneContinuity | null;
  opportunityProgress?: import('./investigation-opportunities').OpportunityProgress;
  selectedOpportunity?: import('./investigation-opportunities').InvestigationOpportunity | null;
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

function assertResolutionCurrent(input: GameTransactionInput, resolved: ResolvedActionOutcome) {
  const continuity = input.variables.actionContinuity;
  if (continuity?.cycleCount === resolved.cycleCount
    && Array.isArray(continuity.settledResolutionIds)
    && continuity.settledResolutionIds.includes(resolved.id)) {
    throw new Error('行动结果已结算，不能重复提交。');
  }
  const beforeTime = new Date(resolvePreviousTime(input.variables, input.gameStatus)).getTime();
  const startTime = new Date(resolved.startTime).getTime();
  const endTime = new Date(resolved.endTime).getTime();
  if (!resolved.id || resolved.cycleCount !== Number(input.variables.cycleCount ?? 1)
    || !Number.isFinite(startTime) || startTime !== beforeTime
    || startTime !== input.gameStatus.time.getTime()
    || resolved.startLocationId !== (input.variables.location ?? 'home')
    || resolved.resources.before.stamina !== input.gameStatus.stamina
    || resolved.resources.before.sanity !== input.gameStatus.sanity) {
    throw new Error('行动结果已失效：轮回、时钟、地点或资源已改变。');
  }
  if (!Number.isFinite(endTime) || endTime < startTime
    || (endTime - startTime) / 60_000 !== resolved.executedMinutes
    || !getLocationById(resolved.endLocationId)
    || !Number.isFinite(resolved.resources.after.stamina)
    || resolved.resources.after.stamina < 0 || resolved.resources.after.stamina > 120
    || !Number.isFinite(resolved.resources.after.sanity)
    || resolved.resources.after.sanity < 0 || resolved.resources.after.sanity > 100) {
    throw new Error('行动结果无效：结束时间、地点或资源不合法。');
  }
}

function acknowledgesCurrentCommitmentBoundary(
  input: GameTransactionInput,
  resolved: ResolvedActionOutcome,
): boolean {
  const interruption = resolved.interruption;
  if (!interruption?.id.startsWith('commitment-boundary:')
    || resolved.executedMinutes !== 0
    || new Date(resolved.startTime).getTime() !== new Date(resolved.endTime).getTime()
    || new Date(interruption.at).getTime() !== new Date(resolved.startTime).getTime()) {
    return false;
  }
  return commitmentBoundariesFromVariables(input.variables).some(boundary => (
    boundary.id === interruption.id
    && new Date(boundary.at).getTime() === new Date(interruption.at).getTime()
  ));
}

/**
 * 所有会改变游戏数值的路径都应经过这里：
 * 合并受信状态补丁 → 扣除确定性成本 → 推进时钟 → 定时事件 → 结局/轮回失败判定。
 */
export function settleGameTransaction(input: GameTransactionInput): GameTransactionResult {
  const resolved = input.resolvedAction;
  if (resolved) assertResolutionCurrent(input, resolved);
  const previousVariables = { ...input.variables };
  const previousGameStatus = {
    ...input.gameStatus,
    time: new Date(input.gameStatus.time),
    items: [...input.gameStatus.items],
  };
  const patch = { ...(input.variablePatch ?? {}) };
  const requestedTime = typeof patch.time === 'string' ? patch.time : null;
  delete patch.time;
  if (resolved) {
    delete patch.stamina;
    delete patch.sanity;
    delete patch.actionContinuity;
    patch.location = resolved.endLocationId;
  }

  // Location is a registered-map ingress. Preserve a valid current anchor when
  // callers propose an unknown destination; old invalid saves recover to home.
  const currentLocation = typeof input.variables.location === 'string'
    ? input.variables.location
    : 'home';
  const locationResolution = resolveRegisteredLocation(patch.location, currentLocation);
  if (patch.location !== undefined) {
    if (locationResolution.accepted) patch.location = locationResolution.locationId;
    else delete patch.location;
  }

  let variables = mergeVariables(input.variables, patch);
  if (!getLocationById(variables.location)) {
    variables = { ...variables, location: resolveRegisteredLocation(undefined, currentLocation).locationId };
  }
  const staminaBeforeCost = finiteStatus(variables.stamina, input.gameStatus.stamina, 0, 120);
  const sanityBeforeCost = finiteStatus(variables.sanity, input.gameStatus.sanity, 0, 100);
  const stamina = resolved?.resources.after.stamina
    ?? Math.max(0, staminaBeforeCost - finiteNonNegative(input.costs?.stamina));
  let sanity = resolved?.resources.after.sanity
    ?? Math.max(0, sanityBeforeCost - finiteNonNegative(input.costs?.sanity));

  const previousTime = resolvePreviousTime(input.variables, input.gameStatus);
  const rawMinutes = Math.max(input.narrativeTurn ? 1 : 0, finiteNonNegative(input.costs?.timeMinutes));
  const advancedTime = rawMinutes > 0
    ? advanceClock(previousTime, clampTimeCost(rawMinutes))
    : previousTime;
  const time = resolved?.endTime ?? (requestedTime ? laterTime(advancedTime, requestedTime) : advancedTime);

  const scheduledEventPatch = checkScheduledEvents(previousTime, time, variables);
  variables = {
    ...variables,
    stamina,
    sanity,
    time,
    ...scheduledEventPatch,
  };
  if (resolved) {
    const prior = input.variables.actionContinuity?.cycleCount === resolved.cycleCount
      ? input.variables.actionContinuity : undefined;
    const priorIds: string[] = Array.isArray(prior?.settledResolutionIds) ? prior.settledResolutionIds : [];
    const priorEffects: string[] = Array.isArray(prior?.appliedEventEffectIds) ? prior.appliedEventEffectIds : [];
    const preservesWork = resolved.startLocationId === resolved.endLocationId
      && new Date(resolved.startTime).toDateString() === new Date(resolved.endTime).toDateString()
      && resolved.segments.every(segment => segment.step.kind === 'event' || segment.step.kind === 'wait');
    const retainedContinuation = preservesWork && prior?.continuation?.cycleCount === resolved.cycleCount
      && prior.continuation.expectedLocationId === resolved.endLocationId ? prior.continuation : null;
    const handlesDueCommitment = !!retainedContinuation && acknowledgesCurrentCommitmentBoundary(input, resolved);
    const continuation = handlesDueCommitment
      ? retainedContinuation
      : resolved.continuation ?? retainedContinuation;
    const usesResolvedContinuation = !!continuation && continuation === resolved.continuation;
    variables.actionContinuity = {
      cycleCount: resolved.cycleCount,
      lastResolutionId: resolved.id,
      settledResolutionIds: [...new Set([...priorIds, resolved.id])],
      appliedEventEffectIds: [...new Set([...priorEffects, ...resolved.eventEffectIds])],
      continuation,
      pendingAuthorization: usesResolvedContinuation
        ? input.pendingActionAuthorization ?? null
        : continuation ? prior?.pendingAuthorization ?? null : null,
      sceneContext: usesResolvedContinuation
        ? input.pendingActionSceneContext ?? null
        : continuation ? prior?.sceneContext ?? null : null,
      selectedOpportunity: usesResolvedContinuation
        ? input.selectedOpportunity ? structuredClone(input.selectedOpportunity) : null
        : continuation ? prior?.selectedOpportunity ? structuredClone(prior.selectedOpportunity) : null : null,
    };
  }
  if (input.opportunityProgress) {
    variables.opportunityProgress = structuredClone(input.opportunityProgress);
  }
  if (
    input.deliverPendingDeathNews
    && hasDeliveredDeathNews(input.narrativeText ?? '')
    && input.variables.deathNews === 'pending'
    && !scheduledEventPatch.deathNews
  ) {
    variables.deathNews = 'delivered';
    // Apply the event consequence once, without doubling a larger State-reported drop.
    if (!resolved) sanity = Math.min(sanity, Math.max(0, input.gameStatus.sanity - 12));
    variables.sanity = sanity;
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
