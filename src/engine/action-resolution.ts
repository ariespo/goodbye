import { estimateTravel, getLocationById } from '../data/locations';
import { advanceClock } from './game-clock';

export type ActionScope = 'short' | 'normal' | 'deep';
export type ActionEventId = 'death-news' | 'fantasy';

export interface ActionStep {
  id: string;
  kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait' | 'event' | 'fantasy';
  scope: ActionScope;
  locationId: string;
  opportunityId?: string;
  completionSourceIds: string[];
  /** Only validated clock, event, or UI inputs may supply exact wait/rest durations. */
  requestedMinutes?: number;
  /** Program-owned identity for a scripted, cycle-scoped resource effect. */
  eventId?: ActionEventId;
}

export interface ActionContinuation {
  actionId: string;
  cycleCount: number;
  steps: ActionStep[];
  previousResolutionId: string;
  stepsDigest: string;
  resumableFromTime: string;
  expectedLocationId: string;
  activeStepId: string;
  completedMinutesByStep: Record<string, number>;
  chargedStaminaByStep: Record<string, number>;
}

export interface ResolvedActionSegment {
  step: ActionStep;
  plannedMinutes: number;
  /** Minutes executed in this resolution, excluding earlier continuation work. */
  executedMinutes: number;
  cumulativeExecutedMinutes: number;
  /** Signed change in this resolution: costs are negative and rest is positive. */
  staminaDelta: number;
  completed: boolean;
}

export interface ResolvedActionOutcome {
  id: string;
  cycleCount: number;
  startTime: string;
  endTime: string;
  startLocationId: string;
  endLocationId: string;
  /** Work plus travel remaining at the start of this resolution. */
  plannedMinutes: number;
  executedMinutes: number;
  segments: ResolvedActionSegment[];
  resources: {
    before: { stamina: number; sanity: number };
    after: { stamina: number; sanity: number };
  };
  completedSourceIds: string[];
  interruption?: { id: string; at: string };
  continuation?: ActionContinuation;
  /** Newly applied, cycle-scoped effect IDs. */
  eventEffectIds: string[];
}

export interface ResolveActionInput {
  id: string;
  cycleCount: number;
  startTime: string;
  currentLocationId: string;
  stamina: number;
  sanity: number;
  steps: ActionStep[];
  explicitBudgetMinutes?: number;
  nextBoundary?: { id: string; at: string };
  continuation?: ActionContinuation;
  appliedEventEffectIds?: string[];
}

const WORK_MINUTES: Record<ActionScope, number> = { short: 25, normal: 55, deep: 105 };
const INQUIRY_STAMINA: Record<ActionScope, number> = { short: 3, normal: 7, deep: 14 };
const SEARCH_STAMINA: Record<ActionScope, number> = { short: 6, normal: 14, deep: 24 };
const TRAVEL_STEP_PREFIX = '__travel__:';
const STEP_KINDS = new Set<ActionStep['kind']>([
  'inquiry', 'investigation', 'search', 'travel', 'rest', 'wait', 'event', 'fantasy',
]);
const SCOPES = new Set<ActionScope>(['short', 'normal', 'deep']);

interface PlannedStep {
  step: ActionStep;
  plannedMinutes: number;
  staminaCost: number;
  travelFromLocationId?: string;
}

function assertStableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a stable non-empty string`);
  }
}

function assertFiniteInRange(value: unknown, label: string, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} must be finite and between ${min} and ${max}`);
  }
}

function parseTime(value: string, label: string): number {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new TypeError(`${label} must be a valid clock`);
  return time;
}

function assertWholePositiveMinutes(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive whole number of minutes`);
  }
}

function validateStep(step: ActionStep, allowCanonicalTravel: boolean): void {
  if (!step || typeof step !== 'object') throw new TypeError('action step must be an object');
  assertStableId(step.id, 'step id');
  if (!STEP_KINDS.has(step.kind)) throw new TypeError(`unknown action kind: ${String(step.kind)}`);
  if (!SCOPES.has(step.scope)) throw new TypeError(`unknown action scope: ${String(step.scope)}`);
  if (!getLocationById(step.locationId)) throw new RangeError(`unknown step location: ${String(step.locationId)}`);
  if (step.id.startsWith(TRAVEL_STEP_PREFIX) && !allowCanonicalTravel) {
    throw new TypeError('reserved travel step id');
  }
  if (!Array.isArray(step.completionSourceIds)) throw new TypeError('completionSourceIds must be an array');
  const sourceIds = new Set<string>();
  for (const sourceId of step.completionSourceIds) {
    assertStableId(sourceId, 'completion source id');
    if (sourceIds.has(sourceId)) throw new TypeError(`duplicate completion source id: ${sourceId}`);
    sourceIds.add(sourceId);
  }
  if (step.opportunityId !== undefined) assertStableId(step.opportunityId, 'opportunity id');
  if (step.kind === 'rest' || step.kind === 'wait') {
    assertWholePositiveMinutes(step.requestedMinutes, `${step.kind} requestedMinutes`);
  } else if (step.requestedMinutes !== undefined) {
    throw new TypeError(`requestedMinutes is not allowed for ${step.kind}`);
  }
  if (step.kind === 'event') {
    if (step.eventId !== 'death-news') throw new TypeError('event steps require eventId death-news');
  } else if (step.kind === 'fantasy') {
    if (step.eventId !== 'fantasy') throw new TypeError('fantasy steps require eventId fantasy');
    if (step.completionSourceIds.length > 0) throw new TypeError('fantasy steps cannot mint completion sources');
  } else if (step.eventId !== undefined) {
    throw new TypeError(`eventId is not allowed for ${step.kind}`);
  }
}

function canonicalTravelId(index: number, from: string, to: string, sourceId: string): string {
  return `${TRAVEL_STEP_PREFIX}${index}:${encodeURIComponent(from)}:${encodeURIComponent(to)}:${encodeURIComponent(sourceId)}`;
}

function parseCanonicalTravelOrigin(step: ActionStep): string {
  const parts = step.id.split(':');
  if (parts.length !== 5 || `${parts[0]}:` !== TRAVEL_STEP_PREFIX) {
    throw new TypeError(`invalid canonical travel step id: ${step.id}`);
  }
  const from = decodeURIComponent(parts[2]);
  const to = decodeURIComponent(parts[3]);
  if (!getLocationById(from) || to !== step.locationId) {
    throw new TypeError(`invalid canonical travel route: ${step.id}`);
  }
  return from;
}

function createTravelStep(source: ActionStep, index: number, from: string): ActionStep {
  return {
    ...source,
    id: canonicalTravelId(index, from, source.locationId, source.id),
    kind: 'travel',
    completionSourceIds: source.kind === 'travel' ? [...source.completionSourceIds] : [],
    requestedMinutes: undefined,
    opportunityId: undefined,
    eventId: undefined,
  };
}

function fullStaminaCost(step: ActionStep, travelFromLocationId?: string): number {
  if (step.kind === 'travel') {
    return estimateTravel(travelFromLocationId ?? '', step.locationId)?.staminaCost ?? 0;
  }
  if (step.kind === 'search') return SEARCH_STAMINA[step.scope];
  if (step.kind === 'inquiry' || step.kind === 'investigation') return INQUIRY_STAMINA[step.scope];
  return 0;
}

function fullDuration(step: ActionStep, travelFromLocationId?: string): number {
  if (step.kind === 'travel') {
    return estimateTravel(travelFromLocationId ?? '', step.locationId)?.timeMinutes ?? 0;
  }
  if (step.kind === 'event') return 0;
  if (step.kind === 'rest' || step.kind === 'wait') return step.requestedMinutes!;
  return WORK_MINUTES[step.scope];
}

function makePlannedStep(step: ActionStep, travelFromLocationId?: string): PlannedStep {
  return {
    step,
    plannedMinutes: fullDuration(step, travelFromLocationId),
    staminaCost: fullStaminaCost(step, travelFromLocationId),
    travelFromLocationId,
  };
}

function canonicalizeFreshSteps(currentLocationId: string, steps: ActionStep[]): PlannedStep[] {
  const planned: PlannedStep[] = [];
  const seen = new Set<string>();
  let locationId = currentLocationId;
  steps.forEach((step, index) => {
    validateStep(step, false);
    if (seen.has(step.id)) throw new TypeError(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (step.kind === 'travel' || step.locationId !== locationId) {
      const leg = createTravelStep(step, index, locationId);
      planned.push(makePlannedStep(leg, locationId));
      locationId = step.locationId;
    }
    if (step.kind !== 'travel') {
      planned.push(makePlannedStep({ ...step, completionSourceIds: [...step.completionSourceIds] }));
    }
  });
  return planned;
}

function planCanonicalSteps(steps: ActionStep[]): PlannedStep[] {
  const seen = new Set<string>();
  return steps.map(step => {
    validateStep(step, true);
    if (seen.has(step.id)) throw new TypeError(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (step.kind === 'travel') {
      if (!step.id.startsWith(TRAVEL_STEP_PREFIX)) throw new TypeError('continuation travel step is not canonical');
      const origin = parseCanonicalTravelOrigin(step);
      return makePlannedStep({ ...step, completionSourceIds: [...step.completionSourceIds] }, origin);
    }
    return makePlannedStep({ ...step, completionSourceIds: [...step.completionSourceIds] });
  });
}

function serializedSteps(steps: ActionStep[]): string {
  return JSON.stringify(steps.map(step => ({
    id: step.id,
    kind: step.kind,
    scope: step.scope,
    locationId: step.locationId,
    opportunityId: step.opportunityId ?? null,
    completionSourceIds: step.completionSourceIds,
    requestedMinutes: step.requestedMinutes ?? null,
    eventId: step.eventId ?? null,
  })));
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function digestSteps(steps: ActionStep[]): string {
  return `steps-${stableHash(serializedSteps(steps))}`;
}

function effectId(eventId: ActionEventId, cycleCount: number, actionId: string): string {
  return eventId === 'fantasy'
    ? `${eventId}:cycle:${cycleCount}:attempt:${encodeURIComponent(actionId)}`
    : `${eventId}:cycle:${cycleCount}`;
}

function completedMinutes(continuation: ActionContinuation | undefined, stepId: string): number {
  return continuation?.completedMinutesByStep[stepId] ?? 0;
}

function chargedStamina(continuation: ActionContinuation | undefined, stepId: string): number {
  return continuation?.chargedStaminaByStep[stepId] ?? 0;
}

function hasCompletedEntry(
  completedByStep: Record<string, number> | undefined,
  stepId: string,
): boolean {
  return !!completedByStep && Object.prototype.hasOwnProperty.call(completedByStep, stepId);
}

function validateContinuation(input: ResolveActionInput, planned: PlannedStep[], digest: string): void {
  const continuation = input.continuation;
  if (!continuation) return;
  if (continuation.actionId !== input.id) throw new Error('continuation action id mismatch');
  if (continuation.cycleCount !== input.cycleCount) throw new Error('continuation cycle mismatch');
  if (continuation.stepsDigest !== digest) throw new Error('continuation steps digest mismatch');
  if (digestSteps(input.steps) !== digest) throw new Error('input steps digest mismatch');
  if (!Array.isArray(continuation.steps) || digestSteps(continuation.steps) !== digest) {
    throw new Error('saved continuation steps digest mismatch');
  }
  if (continuation.expectedLocationId !== input.currentLocationId) throw new Error('continuation location mismatch');
  if (parseTime(input.startTime, 'start clock') < parseTime(continuation.resumableFromTime, 'resumable clock')) {
    throw new Error('continuation clock predates resumable clock');
  }
  assertStableId(continuation.previousResolutionId, 'previous resolution id');
  if (!getLocationById(continuation.expectedLocationId)) throw new Error('continuation expected location is unknown');
  if (!continuation.completedMinutesByStep || typeof continuation.completedMinutesByStep !== 'object') {
    throw new TypeError('continuation completed minutes must be a record');
  }
  if (!continuation.chargedStaminaByStep || typeof continuation.chargedStaminaByStep !== 'object') {
    throw new TypeError('continuation charged stamina must be a record');
  }

  let firstIncomplete: string | undefined;
  let expectedLocation = planned.find(item => item.travelFromLocationId)?.travelFromLocationId
    ?? planned[0]?.step.locationId
    ?? input.currentLocationId;
  let foundIncomplete = false;
  for (const item of planned) {
    const done = completedMinutes(continuation, item.step.id);
    const charged = chargedStamina(continuation, item.step.id);
    if (!Number.isSafeInteger(done) || done < 0 || done > item.plannedMinutes) {
      throw new Error(`invalid completed minutes for ${item.step.id}`);
    }
    const expectedCharge = item.plannedMinutes === 0
      ? 0
      : Math.round(item.staminaCost * done / item.plannedMinutes);
    if (!Number.isSafeInteger(charged) || charged !== expectedCharge) {
      throw new Error(`invalid charged stamina for ${item.step.id}`);
    }
    const isComplete = item.plannedMinutes === 0
      ? hasCompletedEntry(continuation.completedMinutesByStep, item.step.id)
      : done === item.plannedMinutes;
    if (foundIncomplete && (done > 0 || isComplete)) throw new Error('continuation steps are out of order');
    if (!isComplete) {
      firstIncomplete ??= item.step.id;
      foundIncomplete = true;
    } else if (item.step.kind === 'travel') {
      expectedLocation = item.step.locationId;
    }
  }
  for (const key of Object.keys(continuation.completedMinutesByStep)) {
    if (!planned.some(item => item.step.id === key)) throw new Error(`unknown continuation step: ${key}`);
  }
  for (const key of Object.keys(continuation.chargedStaminaByStep)) {
    if (!planned.some(item => item.step.id === key)) throw new Error(`unknown continuation charge: ${key}`);
  }
  if (!firstIncomplete || continuation.activeStepId !== firstIncomplete) {
    throw new Error('continuation active step mismatch');
  }
  if (expectedLocation !== continuation.expectedLocationId) {
    throw new Error('continuation expected location does not match completed travel');
  }
}

function prepareSteps(
  currentLocationId: string,
  steps: ActionStep[],
  continuation?: ActionContinuation,
): { planned: PlannedStep[]; digest: string } {
  const planned = continuation ? planCanonicalSteps(steps) : canonicalizeFreshSteps(currentLocationId, steps);
  return { planned, digest: digestSteps(planned.map(item => item.step)) };
}

function validateBaseInput(input: ResolveActionInput): void {
  assertStableId(input.id, 'action id');
  if (!Number.isSafeInteger(input.cycleCount) || input.cycleCount < 1) {
    throw new RangeError('cycleCount must be a positive integer');
  }
  parseTime(input.startTime, 'start clock');
  if (!getLocationById(input.currentLocationId)) throw new RangeError('current location is not registered');
  assertFiniteInRange(input.stamina, 'stamina', 0, 120);
  assertFiniteInRange(input.sanity, 'sanity', 0, 100);
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new TypeError('steps must not be empty');
  if (input.explicitBudgetMinutes !== undefined) {
    assertWholePositiveMinutes(input.explicitBudgetMinutes, 'explicit budget');
  }
  if (input.nextBoundary) {
    assertStableId(input.nextBoundary.id, 'boundary id');
    if (parseTime(input.nextBoundary.at, 'boundary clock') < parseTime(input.startTime, 'start clock')) {
      throw new RangeError('boundary cannot precede the start clock');
    }
  }
  if (input.appliedEventEffectIds !== undefined) {
    if (!Array.isArray(input.appliedEventEffectIds)) throw new TypeError('appliedEventEffectIds must be an array');
    input.appliedEventEffectIds.forEach(id => assertStableId(id, 'applied event effect id'));
  }
}

export function quoteActionSteps(
  input: Pick<ResolveActionInput, 'currentLocationId' | 'steps' | 'continuation'>,
): { workMinutes: number; travelMinutes: number; totalMinutes: number; staminaCost: number } {
  if (!getLocationById(input.currentLocationId)) throw new RangeError('current location is not registered');
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new TypeError('steps must not be empty');
  const { planned, digest } = prepareSteps(input.currentLocationId, input.steps, input.continuation);
  if (input.continuation) {
    if (input.continuation.stepsDigest !== digest || input.continuation.expectedLocationId !== input.currentLocationId) {
      throw new Error('continuation digest or location mismatch');
    }
    if (!Array.isArray(input.continuation.steps) || digestSteps(input.continuation.steps) !== digest) {
      throw new Error('saved continuation steps digest mismatch');
    }
  }
  let workMinutes = 0;
  let travelMinutes = 0;
  let staminaCost = 0;
  for (const item of planned) {
    const done = completedMinutes(input.continuation, item.step.id);
    const charged = chargedStamina(input.continuation, item.step.id);
    const expectedCharge = item.plannedMinutes === 0
      ? 0
      : Math.round(item.staminaCost * done / item.plannedMinutes);
    if (!Number.isSafeInteger(done) || done < 0 || done > item.plannedMinutes) {
      throw new Error(`invalid completed minutes for ${item.step.id}`);
    }
    if (!Number.isSafeInteger(charged) || charged !== expectedCharge) {
      throw new Error(`invalid continuation charge for ${item.step.id}`);
    }
    const remaining = item.plannedMinutes - done;
    if (remaining < 0) throw new Error(`continuation exceeds planned minutes for ${item.step.id}`);
    if (item.step.kind === 'travel') travelMinutes += remaining;
    else workMinutes += remaining;
    staminaCost += item.staminaCost - charged;
  }
  return { workMinutes, travelMinutes, totalMinutes: workMinutes + travelMinutes, staminaCost };
}

export function resolveAction(input: ResolveActionInput): ResolvedActionOutcome {
  validateBaseInput(input);
  const { planned, digest } = prepareSteps(input.currentLocationId, input.steps, input.continuation);
  validateContinuation(input, planned, digest);

  const completedByStep: Record<string, number> = { ...(input.continuation?.completedMinutesByStep ?? {}) };
  const chargedByStep: Record<string, number> = { ...(input.continuation?.chargedStaminaByStep ?? {}) };
  const plannedMinutes = planned.reduce(
    (total, item) => total + item.plannedMinutes - completedMinutes(input.continuation, item.step.id),
    0,
  );
  let boundaryRemaining = input.nextBoundary
    ? Math.floor((parseTime(input.nextBoundary.at, 'boundary clock') - parseTime(input.startTime, 'start clock')) / 60_000)
    : Number.POSITIVE_INFINITY;
  let budgetRemaining = input.explicitBudgetMinutes ?? Number.POSITIVE_INFINITY;
  let boundaryConsumed = false;
  let stamina = input.stamina;
  let sanity = input.sanity;
  let endLocationId = input.currentLocationId;
  let executedMinutes = 0;
  const segments: ResolvedActionSegment[] = [];
  const completedSourceIds: string[] = [];
  const eventEffectIds: string[] = [];
  const appliedEffects = new Set(input.appliedEventEffectIds ?? []);

  for (const item of planned) {
    const alreadyExecuted = completedMinutes(input.continuation, item.step.id);
    const plannedRemaining = item.plannedMinutes - alreadyExecuted;
    if (plannedRemaining < 0) throw new Error(`completed minutes exceed plan for ${item.step.id}`);
    if (
      item.plannedMinutes === 0
      && hasCompletedEntry(input.continuation?.completedMinutesByStep, item.step.id)
    ) {
      if (item.step.kind === 'travel') endLocationId = item.step.locationId;
      continue;
    }
    if (plannedRemaining === 0 && item.plannedMinutes > 0) {
      if (item.step.kind === 'travel') endLocationId = item.step.locationId;
      continue;
    }

    const matchesDueEvent = item.step.kind === 'event'
      && item.step.eventId === input.nextBoundary?.id
      && boundaryRemaining === 0;
    const zeroMinuteMilestone = item.plannedMinutes === 0;
    if (budgetRemaining <= 0 && !zeroMinuteMilestone) break;
    if (boundaryRemaining <= 0 && !matchesDueEvent) break;
    const execute = item.plannedMinutes === 0
      ? 0
      : Math.min(plannedRemaining, budgetRemaining, boundaryRemaining);
    if (execute <= 0 && item.plannedMinutes > 0) break;

    const cumulative = alreadyExecuted + execute;
    const alreadyCharged = chargedStamina(input.continuation, item.step.id);
    const cumulativeCharge = item.plannedMinutes === 0
      ? 0
      : Math.round(item.staminaCost * cumulative / item.plannedMinutes);
    const chargedNow = cumulativeCharge - alreadyCharged;
    let staminaDelta = -chargedNow;
    if (item.step.kind === 'rest') {
      const previousRestore = Math.round(12 * alreadyExecuted / 60);
      const cumulativeRestore = Math.round(12 * cumulative / 60);
      staminaDelta = Math.min(120 - stamina, cumulativeRestore - previousRestore);
    }
    stamina = Math.min(120, Math.max(0, stamina + staminaDelta));
    completedByStep[item.step.id] = cumulative;
    chargedByStep[item.step.id] = cumulativeCharge;
    const completed = cumulative === item.plannedMinutes;
    segments.push({
      step: item.step,
      plannedMinutes: item.plannedMinutes,
      executedMinutes: execute,
      cumulativeExecutedMinutes: cumulative,
      staminaDelta,
      completed,
    });
    executedMinutes += execute;
    budgetRemaining -= execute;
    boundaryRemaining -= execute;

    const reachedEffect = item.step.eventId
      && (completed || (item.step.eventId === 'fantasy' && execute > 0));
    if (reachedEffect) {
      const id = effectId(item.step.eventId!, input.cycleCount, input.id);
      if (!appliedEffects.has(id)) {
        appliedEffects.add(id);
        eventEffectIds.push(id);
        sanity = Math.max(0, sanity - (item.step.eventId === 'death-news' ? 12 : 8));
      }
    }
    if (completed) {
      if (item.step.kind === 'travel') endLocationId = item.step.locationId;
      completedSourceIds.push(...item.step.completionSourceIds);
      if (matchesDueEvent) boundaryConsumed = true;
    }
    if (!completed) break;
  }

  const endTime = advanceClock(input.startTime, executedMinutes);
  const firstIncomplete = planned.find(item => item.plannedMinutes === 0
    ? !hasCompletedEntry(completedByStep, item.step.id)
    : (completedByStep[item.step.id] ?? 0) < item.plannedMinutes);
  const reachedBoundary = !!input.nextBoundary && boundaryRemaining <= 0 && !boundaryConsumed;
  const exhaustedBudget = Number.isFinite(budgetRemaining) && budgetRemaining <= 0;
  const interruption = firstIncomplete
    ? reachedBoundary
      ? { ...input.nextBoundary! }
      : exhaustedBudget
        ? { id: 'explicit-budget', at: endTime }
        : undefined
    : undefined;
  const resolutionId = `action-${stableHash(JSON.stringify({
    actionId: input.id,
    cycleCount: input.cycleCount,
    startTime: input.startTime,
    currentLocationId: input.currentLocationId,
    stamina: input.stamina,
    sanity: input.sanity,
    digest,
    budget: input.explicitBudgetMinutes ?? null,
    boundary: input.nextBoundary ?? null,
    previousResolutionId: input.continuation?.previousResolutionId ?? null,
    appliedEventEffectIds: [...appliedEffects].sort(),
  }))}`;
  const interruptedByMidnight = reachedBoundary && input.nextBoundary?.id === 'midnight';
  const continuation = firstIncomplete && !interruptedByMidnight
    ? {
        actionId: input.id,
        cycleCount: input.cycleCount,
        steps: planned.map(item => item.step),
        previousResolutionId: resolutionId,
        stepsDigest: digest,
        resumableFromTime: endTime,
        expectedLocationId: endLocationId,
        activeStepId: firstIncomplete.step.id,
        completedMinutesByStep: completedByStep,
        chargedStaminaByStep: chargedByStep,
      }
    : undefined;

  return {
    id: resolutionId,
    cycleCount: input.cycleCount,
    startTime: input.startTime,
    endTime,
    startLocationId: input.currentLocationId,
    endLocationId,
    plannedMinutes,
    executedMinutes,
    segments,
    resources: {
      before: { stamina: input.stamina, sanity: input.sanity },
      after: { stamina, sanity },
    },
    completedSourceIds: [...new Set(completedSourceIds)],
    ...(interruption ? { interruption } : {}),
    ...(continuation ? { continuation } : {}),
    eventEffectIds,
  };
}
