import { addKnowledgeEvent } from '../data/playerKnowledge';
import { getLocationById } from '../data/locations';
import { resolveAction, quoteActionSteps, type ActionContinuation, type ResolvedActionOutcome } from '../engine/action-resolution';
import { settleGameTransaction, type GameTransactionResult } from '../engine/game-transaction';
import { nextScheduledBoundary, type ScheduledBoundary } from '../engine/scheduled-events';
import { activeCommitmentBoundaries } from '../memory/character-continuity';
import { normalizeWorldMemory } from '../memory/world-memory';
import type { DynamicRecord, Ending, GameStatus } from '../sillytavern/types';
import { projectPublicActionOutcome, type ActionQuote, type PublicActionOutcome } from './actionPresentation';

export interface MapTravelInput {
  variables: DynamicRecord;
  gameStatus: GameStatus;
  destinationLocationId: string;
  nextBoundary?: ScheduledBoundary;
}

export interface PreparedMapTravel {
  kind: 'travel';
  actionId: string;
  destinationLocationId: string;
  quote: ActionQuote;
  outcome: ResolvedActionOutcome;
  publicOutcome: PublicActionOutcome;
}

export interface MapBoundaryDue {
  kind: 'boundary-due';
  boundary: ScheduledBoundary;
}

function localClock(status: GameStatus, variables: DynamicRecord): string {
  if (typeof variables.time === 'string' && Number.isFinite(new Date(variables.time).getTime())) {
    if (new Date(variables.time).getTime() !== status.time.getTime()) {
      throw new Error('map travel clock is stale');
    }
    return variables.time;
  }
  const pad = (number: number) => String(number).padStart(2, '0');
  const time = status.time;
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`
    + `T${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

function mapContinuation(variables: DynamicRecord, destinationLocationId: string): ActionContinuation | undefined {
  const continuation = variables.actionContinuity?.continuation ?? undefined;
  if (!continuation || !continuation.actionId.startsWith('map-travel:')) return undefined;
  const finalTravel = [...continuation.steps].reverse().find(step => step.kind === 'travel');
  return finalTravel?.locationId === destinationLocationId ? continuation : undefined;
}

export function prepareMapTravel(input: MapTravelInput): PreparedMapTravel | MapBoundaryDue {
  const origin = typeof input.variables.location === 'string' ? input.variables.location : '';
  if (!getLocationById(origin) || !getLocationById(input.destinationLocationId)) {
    throw new TypeError('map travel requires registered locations');
  }
  if (origin === input.destinationLocationId) throw new Error('map travel destination is current location');
  const cycleCount = Number(input.variables.cycleCount ?? 1);
  if (!Number.isSafeInteger(cycleCount) || cycleCount < 1) throw new TypeError('map travel cycle is invalid');
  const startTime = localClock(input.gameStatus, input.variables);
  const memory = normalizeWorldMemory(input.variables);
  const boundary = input.nextBoundary ?? nextScheduledBoundary(
    startTime,
    input.variables,
    activeCommitmentBoundaries(memory, cycleCount),
  );
  if (boundary && new Date(boundary.at).getTime() <= new Date(startTime).getTime()) {
    return { kind: 'boundary-due', boundary };
  }

  const continuation = mapContinuation(input.variables, input.destinationLocationId);
  const actionId = continuation?.actionId
    ?? `map-travel:${cycleCount}:${encodeURIComponent(origin)}:${encodeURIComponent(input.destinationLocationId)}:${encodeURIComponent(startTime)}`;
  const steps = continuation?.steps ?? [{
    id: `map-leg:${origin}:${input.destinationLocationId}`,
    kind: 'travel' as const,
    scope: 'short' as const,
    locationId: input.destinationLocationId,
    completionSourceIds: [],
  }];
  const quote = quoteActionSteps({ currentLocationId: origin, steps, continuation });
  const outcome = resolveAction({
    id: actionId,
    cycleCount,
    startTime,
    currentLocationId: origin,
    stamina: input.gameStatus.stamina,
    sanity: input.gameStatus.sanity,
    steps,
    ...(continuation ? { continuation } : {}),
    ...(boundary ? { nextBoundary: boundary } : {}),
    appliedEventEffectIds: input.variables.actionContinuity?.appliedEventEffectIds ?? [],
  });
  const publicOutcome = { ...projectPublicActionOutcome(outcome), actionId };
  return {
    kind: 'travel',
    actionId,
    destinationLocationId: input.destinationLocationId,
    quote,
    outcome,
    publicOutcome,
  };
}

export function buildMapTravelTransaction(input: {
  variables: DynamicRecord;
  gameStatus: GameStatus;
  prepared: PreparedMapTravel;
  knowledgeEvents: DynamicRecord['knowledgeEvents'];
  endings: Ending[];
  endingsSeen: string[];
  hasEndingInProgress: boolean;
}): GameTransactionResult {
  const arrived = input.prepared.outcome.endLocationId === input.prepared.destinationLocationId;
  const knowledgeEvents = arrived
    ? addKnowledgeEvent(input.knowledgeEvents, `visit:${input.prepared.destinationLocationId}`)
    : input.knowledgeEvents;
  return settleGameTransaction({
    variables: input.variables,
    gameStatus: input.gameStatus,
    variablePatch: { knowledgeEvents },
    resolvedAction: input.prepared.outcome,
    endings: input.endings,
    endingsSeen: input.endingsSeen,
    hasEndingInProgress: input.hasEndingInProgress,
  });
}
