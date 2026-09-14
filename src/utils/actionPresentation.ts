import { getLocationById } from '../data/locations';
import { resolveActionNarrativeContext } from '../engine/action-narrative-context';
import { readActionIntentSnapshot, resolvePlayerActionIntent, type ActionIntentSnapshot } from '../engine/player-action-intent';
import {
  quoteActionSteps,
  type ActionScope,
  type ActionContinuation,
  type ActionStep,
  type ResolvedActionOutcome,
} from '../engine/action-resolution';
import type { ChatMessage, ChecklistActionMetadata } from '../sillytavern/types';

export type ActionQuote = ReturnType<typeof quoteActionSteps>;

export interface ChecklistActionRow extends ChecklistActionMetadata {
  desc: string;
  time?: string | number;
  stamina?: number;
  sanity?: number;
}

export interface PublicActionSelection {
  actionId: string;
  opportunityId?: string;
  kind: Exclude<ActionStep['kind'], 'event' | 'fantasy'>;
  scope: ActionScope;
  locationId: string;
  requestedMinutes?: number;
}

export interface ResolvedChecklistAction {
  selection: PublicActionSelection;
  steps: ActionStep[];
  quote: ActionQuote;
  source: 'program' | 'legacy';
}

export interface PublicActionOutcome {
  resolutionId: string;
  actionId: string;
  executedMinutes: number;
  executedWorkMinutes: number;
  executedTravelMinutes: number;
  endTime: string;
  staminaDelta: number;
  sanityDelta: number;
  interruption?: { id: string; at: string };
  remaining?: ActionQuote & { continuationId: string };
}

export interface ActionOptionBinding {
  optionIndex: number;
  optionText: string;
  actionId?: string;
  continuationId?: string;
  playerActionIntent?: ActionIntentSnapshot;
  /** Invalid persisted metadata must remain unavailable rather than become free text. */
  unavailable?: true;
}

export function buildActionOptionBindings(
  options: readonly string[], locationId: string, time: Date, sceneId: string,
): ActionOptionBinding[] {
  return options.map((optionText, optionIndex) => {
    const playerActionIntent = resolvePlayerActionIntent(optionText, locationId, time);
    if (!playerActionIntent) throw new Error(`选项${optionIndex + 1}的行动目的地尚未确定：${optionText}`);
    return { optionIndex, optionText, actionId: `${sceneId}:option:${optionIndex}`, playerActionIntent };
  });
}

export function buildContinuationChoice(
  continuation: ActionContinuation,
  currentLocationId: string,
): { optionText: string; binding: ActionOptionBinding; quote: ActionQuote } {
  const quote = quoteActionSteps({
    currentLocationId,
    steps: continuation.steps,
    continuation,
  });
  const optionText = `继续未完成的行动（剩余${quote.totalMinutes}分钟）`;
  return {
    optionText,
    quote,
    binding: {
      optionIndex: 0,
      optionText,
      actionId: continuation.actionId,
      continuationId: continuation.actionId,
    },
  };
}

const KINDS = new Set<PublicActionSelection['kind']>([
  'inquiry', 'investigation', 'search', 'travel', 'rest', 'wait',
]);
const SCOPES = new Set<ActionScope>(['short', 'normal', 'deep']);

function stableId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function completeProgramSelection(
  item: ChecklistActionRow,
  type: 'investigate' | 'act',
): PublicActionSelection | null {
  const hasAuthorityMetadata = item.actionId !== undefined
    || item.opportunityId !== undefined
    || item.kind !== undefined
    || item.scope !== undefined
    || item.locationId !== undefined
    || item.requestedMinutes !== undefined
    || item.quote !== undefined;
  if (!hasAuthorityMetadata) return null;
  if (type === 'investigate'
    && item.actionId === undefined
    && item.kind === undefined
    && stableId(item.opportunityId)
    && SCOPES.has(item.scope as ActionScope)
    && stableId(item.locationId)
    && getLocationById(item.locationId)) {
    return {
      actionId: item.opportunityId,
      opportunityId: item.opportunityId,
      kind: 'investigation',
      scope: item.scope as ActionScope,
      locationId: item.locationId,
    };
  }
  if (!stableId(item.actionId)
    || !KINDS.has(item.kind as PublicActionSelection['kind'])
    || !SCOPES.has(item.scope as ActionScope)
    || !stableId(item.locationId)
    || !getLocationById(item.locationId)) {
    throw new TypeError('incomplete or invalid program action metadata');
  }
  if (item.opportunityId !== undefined && !stableId(item.opportunityId)) {
    throw new TypeError('invalid opportunity id');
  }
  if (item.kind === 'rest' || item.kind === 'wait') {
    if (!Number.isSafeInteger(item.requestedMinutes) || Number(item.requestedMinutes) <= 0) {
      throw new TypeError(`${item.kind} requires program requestedMinutes`);
    }
  } else if (item.requestedMinutes !== undefined) {
    throw new TypeError(`requestedMinutes is not allowed for ${item.kind}`);
  }
  return {
    actionId: item.actionId,
    ...(item.opportunityId ? { opportunityId: item.opportunityId } : {}),
    kind: item.kind,
    scope: item.scope,
    locationId: item.locationId,
    ...((item.kind === 'rest' || item.kind === 'wait') ? { requestedMinutes: item.requestedMinutes } : {}),
  };
}

function legacySelection(
  item: ChecklistActionRow,
  input: { sceneId: string; itemIndex: number; type: 'investigate' | 'act'; currentLocationId: string; currentTime?: Date },
): PublicActionSelection {
  if (!getLocationById(input.currentLocationId)) throw new TypeError('current location is not registered');
  const narrativeContext = input.type === 'act'
    ? resolveActionNarrativeContext(item.desc, input.currentTime ?? new Date(0), 0, {
        currentLocationId: input.currentLocationId,
      })
    : null;
  return {
    actionId: `legacy:${input.sceneId}:${input.type}:${input.itemIndex}`,
    kind: input.type === 'investigate' ? 'investigation' : 'inquiry',
    scope: 'normal',
    locationId: narrativeContext?.locationId ?? input.currentLocationId,
  };
}

export function resolveChecklistAction(
  item: ChecklistActionRow,
  input: { sceneId: string; itemIndex: number; type: 'investigate' | 'act'; currentLocationId: string; currentTime?: Date },
): ResolvedChecklistAction {
  const programSelection = completeProgramSelection(item, input.type);
  const selection = programSelection ?? legacySelection(item, input);
  const step: ActionStep = {
    id: selection.actionId,
    kind: selection.kind,
    scope: selection.scope,
    locationId: selection.locationId,
    ...(selection.opportunityId ? { opportunityId: selection.opportunityId } : {}),
    ...(selection.requestedMinutes ? { requestedMinutes: selection.requestedMinutes } : {}),
    completionSourceIds: [],
  };
  const steps = [step];
  return {
    selection,
    steps,
    quote: quoteActionSteps({ currentLocationId: input.currentLocationId, steps }),
    source: programSelection ? 'program' : 'legacy',
  };
}

export function projectPublicActionOutcome(outcome: ResolvedActionOutcome): PublicActionOutcome {
  const executedTravelMinutes = outcome.segments.reduce((minutes, segment) => (
    minutes + (segment.step.kind === 'travel' ? segment.executedMinutes : 0)
  ), 0);
  const executedWorkMinutes = outcome.executedMinutes - executedTravelMinutes;
  const continuation = outcome.continuation;
  const remaining = continuation
    ? {
        ...quoteActionSteps({
          currentLocationId: outcome.endLocationId,
          steps: continuation.steps,
          continuation,
        }),
        continuationId: continuation.actionId,
      }
    : undefined;
  return {
    resolutionId: outcome.id,
    actionId: continuation?.actionId ?? inferActionId(outcome),
    executedMinutes: outcome.executedMinutes,
    executedWorkMinutes,
    executedTravelMinutes,
    endTime: outcome.endTime,
    staminaDelta: outcome.resources.after.stamina - outcome.resources.before.stamina,
    sanityDelta: outcome.resources.after.sanity - outcome.resources.before.sanity,
    ...(outcome.interruption ? { interruption: { ...outcome.interruption } } : {}),
    ...(remaining ? { remaining } : {}),
  };
}

function inferActionId(outcome: ResolvedActionOutcome): string {
  const firstNonCanonicalStep = outcome.segments.find(segment => !segment.step.id.startsWith('__travel__:'))?.step;
  if (firstNonCanonicalStep) return firstNonCanonicalStep.id;
  const canonicalTravel = outcome.segments.find(segment => segment.step.kind === 'travel')?.step.id;
  if (canonicalTravel) {
    const encodedSource = canonicalTravel.split(':').at(-1);
    if (encodedSource) return decodeURIComponent(encodedSource);
  }
  return outcome.id;
}

function finiteWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function actionQuote(value: unknown): ActionQuote | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const quote = value as Record<string, unknown>;
  if (!finiteWhole(quote.workMinutes) || !finiteWhole(quote.travelMinutes)
    || !finiteWhole(quote.totalMinutes) || !finiteWhole(quote.staminaCost)
    || quote.workMinutes + quote.travelMinutes !== quote.totalMinutes) return null;
  return {
    workMinutes: quote.workMinutes,
    travelMinutes: quote.travelMinutes,
    totalMinutes: quote.totalMinutes,
    staminaCost: quote.staminaCost,
  };
}

/** Strictly reads a program-projected value; unknown/private fields are discarded. */
export function readPublicActionOutcome(value: unknown): PublicActionOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!stableId(item.resolutionId) || !stableId(item.actionId)
    || !finiteWhole(item.executedMinutes) || !finiteWhole(item.executedWorkMinutes)
    || !finiteWhole(item.executedTravelMinutes)
    || item.executedWorkMinutes + item.executedTravelMinutes !== item.executedMinutes
    || !stableId(item.endTime) || !Number.isFinite(new Date(item.endTime).getTime())
    || typeof item.staminaDelta !== 'number' || !Number.isFinite(item.staminaDelta)
    || typeof item.sanityDelta !== 'number' || !Number.isFinite(item.sanityDelta)) return null;
  const interruption = item.interruption && typeof item.interruption === 'object' && !Array.isArray(item.interruption)
    ? item.interruption as Record<string, unknown> : null;
  const parsedInterruption = interruption && stableId(interruption.id) && stableId(interruption.at)
    && Number.isFinite(new Date(interruption.at).getTime())
    ? { id: interruption.id, at: interruption.at }
    : undefined;
  const remainingValue = item.remaining && typeof item.remaining === 'object' && !Array.isArray(item.remaining)
    ? item.remaining as Record<string, unknown> : null;
  const quote = actionQuote(remainingValue);
  const remaining = remainingValue && quote && stableId(remainingValue.continuationId)
    ? { ...quote, continuationId: remainingValue.continuationId }
    : undefined;
  return {
    resolutionId: item.resolutionId,
    actionId: item.actionId,
    executedMinutes: item.executedMinutes,
    executedWorkMinutes: item.executedWorkMinutes,
    executedTravelMinutes: item.executedTravelMinutes,
    endTime: item.endTime,
    staminaDelta: item.staminaDelta,
    sanityDelta: item.sanityDelta,
    ...(parsedInterruption ? { interruption: parsedInterruption } : {}),
    ...(remaining ? { remaining } : {}),
  };
}

export function validatedOptionBinding(
  value: unknown,
  optionIndex: number,
  optionText: string,
  activeContinuationId?: string,
): ActionOptionBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (item.optionIndex !== optionIndex || item.optionText !== optionText) return undefined;
  if (item.unavailable === true) return { optionIndex, optionText, unavailable: true };
  const playerActionIntent = item.playerActionIntent === undefined ? undefined : readActionIntentSnapshot(item.playerActionIntent);
  if (item.playerActionIntent !== undefined && (!playerActionIntent || playerActionIntent.originalInput !== optionText
    || !stableId(item.actionId) || item.continuationId !== undefined)) return undefined;
  if (item.actionId !== undefined && !stableId(item.actionId)) return undefined;
  if (item.continuationId !== undefined) {
    if (!stableId(item.continuationId) || item.continuationId !== activeContinuationId) return undefined;
    if (item.actionId !== undefined && item.actionId !== item.continuationId) return undefined;
  }
  return {
    optionIndex,
    optionText,
    ...(stableId(item.actionId) ? { actionId: item.actionId } : {}),
    ...(stableId(item.continuationId) ? { continuationId: item.continuationId } : {}),
    ...(playerActionIntent ? { playerActionIntent } : {}),
  };
}

/**
 * Reconstructs action UI metadata only from the accepted program-owned message fields.
 * Parsed model text and save-level projections are deliberately not accepted as authority.
 */
export function acceptedActionUiFromMessage(
  message: Pick<ChatMessage, 'acceptedActionOutcome' | 'parsed' | 'variables'> | null | undefined,
  options: readonly string[],
): Pick<import('../sillytavern/types').ParsedContent, 'actionOutcome' | 'optionBindings'> {
  const actionOutcome = readPublicActionOutcome(message?.acceptedActionOutcome);
  const activeContinuationId = message?.variables.actionContinuity?.continuation?.actionId;
  const optionBindings = Array.isArray(message?.parsed?.optionBindings)
    ? message.parsed.optionBindings.flatMap((value) => {
        const index = value.optionIndex;
        if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= options.length) return [];
        const binding = validatedOptionBinding(value, Number(index), options[Number(index)], activeContinuationId);
        return binding ? [binding] : value.playerActionIntent !== undefined
          ? [{ optionIndex: Number(index), optionText: options[Number(index)], unavailable: true as const }] : [];
      })
    : [];
  return {
    ...(actionOutcome ? { actionOutcome } : {}),
    ...(optionBindings.length > 0 ? { optionBindings } : {}),
  };
}
