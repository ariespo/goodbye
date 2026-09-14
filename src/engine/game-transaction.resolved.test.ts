import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { resolveAction, type ResolvedActionOutcome } from './action-resolution';
import { commitmentBoundariesFromVariables } from './commitment-boundaries';
import { settleGameTransaction } from './game-transaction';

function fixture() {
  const variables = { ...createDefaultVariables(), location: 'home', time: '2024-09-09T08:00:00', stamina: 100, sanity: 70 };
  const gameStatus = { time: new Date(variables.time), stamina: 100, sanity: 70, items: [] };
  const resolvedAction: ResolvedActionOutcome = {
    id: 'resolved-q', cycleCount: 1, startTime: variables.time, endTime: '2024-09-09T08:55:00',
    startLocationId: 'home', endLocationId: 'home', plannedMinutes: 55, executedMinutes: 55,
    segments: [{ step: { id: 'q', kind: 'inquiry', scope: 'normal', locationId: 'home', completionSourceIds: [] },
      plannedMinutes: 55, executedMinutes: 55, cumulativeExecutedMinutes: 55, staminaDelta: -7, completed: true }],
    resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } },
    completedSourceIds: [], eventEffectIds: [],
  };
  return { variables, gameStatus, resolvedAction };
}

describe('resolved action transaction authority', () => {
  it('stores opportunity progress and the selected private snapshot atomically with unfinished work', () => {
    const input = fixture();
    const selectedOpportunity = {
      id: 'investigation:c1:F001:atmosphere:home', locationId: 'home', publicGoal: '检查随身物品',
      scope: 'normal' as const, sourceIds: ['fact:F001:atmosphere'], topicKey: 'home:belongings',
    };
    input.resolvedAction = {
      ...input.resolvedAction,
      endTime: '2024-09-09T08:20:00',
      executedMinutes: 20,
      segments: [{
        ...input.resolvedAction.segments[0],
        step: { ...input.resolvedAction.segments[0].step, opportunityId: selectedOpportunity.id },
        executedMinutes: 20,
        cumulativeExecutedMinutes: 20,
        completed: false,
      }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 97, sanity: 70 } },
      continuation: {
        actionId: 'resolved-q', cycleCount: 1,
        steps: [{ ...input.resolvedAction.segments[0].step, opportunityId: selectedOpportunity.id }],
        previousResolutionId: 'resolved-q', stepsDigest: 'stable', resumableFromTime: '2024-09-09T08:20:00',
        expectedLocationId: 'home', activeStepId: 'q', completedMinutesByStep: { q: 20 }, chargedStaminaByStep: { q: 3 },
      },
    };
    const opportunityProgress = { cycleCount: 1, completedIds: [], noProgressByTopic: {}, settledResolutionIds: ['resolved-q'] };

    const result = settleGameTransaction({ ...input, opportunityProgress, selectedOpportunity });

    expect(result.variables.opportunityProgress).toEqual(opportunityProgress);
    expect(result.variables.actionContinuity?.selectedOpportunity).toEqual(selectedOpportunity);
  });
  it('expires prior unfinished work when a quiet wait reaches midnight', () => {
    const input = fixture();
    const variables = { ...input.variables, actionContinuity: { cycleCount: 1, continuation: {
      actionId: 'old-work', cycleCount: 1, steps: [input.resolvedAction.segments[0].step],
      previousResolutionId: 'old', stepsDigest: 'old', resumableFromTime: input.variables.time,
      expectedLocationId: 'home', activeStepId: 'q', completedMinutesByStep: { q: 10 }, chargedStaminaByStep: { q: 1 },
    } } };
    const resolvedAction: ResolvedActionOutcome = { ...input.resolvedAction, id: 'wait',
      endTime: '2024-09-10T00:00:00', plannedMinutes: 960, executedMinutes: 960,
      segments: [{ ...input.resolvedAction.segments[0], step: { id: 'wait', kind: 'wait', scope: 'normal', locationId: 'home', completionSourceIds: [] },
        plannedMinutes: 960, executedMinutes: 960, cumulativeExecutedMinutes: 960, staminaDelta: 0 }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 100, sanity: 70 } },
    };
    const transaction = settleGameTransaction({ ...input, variables, resolvedAction });
    expect(transaction.variables.actionContinuity?.continuation).toBeNull();
    expect(transaction.variables.actionContinuity?.pendingAuthorization).toBeNull();
  });
  it('uses one resolved clock, location and resource result despite State and menu costs', () => {
    const input = fixture();
    const result = settleGameTransaction({ ...input, narrativeTurn: true,
      variablePatch: { time: '2024-09-09T23:00:00', stamina: 1, sanity: 1, location: 'school', affinity: { touko: 12 } },
      costs: { timeMinutes: 105, stamina: 14, sanity: 8 } });
    expect(result.variables.time).toBe(input.resolvedAction.endTime);
    expect(result.variables.location).toBe('home');
    expect(result.gameStatus.stamina).toBe(93);
    expect(result.gameStatus.sanity).toBe(70);
    expect(result.variables.affinity?.touko).toBe(12);
  });

  it('retains zero elapsed time for a resolved scheduled event', () => {
    const input = fixture();
    input.resolvedAction = { ...input.resolvedAction, endTime: input.variables.time,
      plannedMinutes: 0, executedMinutes: 0, segments: [],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 100, sanity: 70 } } };
    const result = settleGameTransaction({ ...input, narrativeTurn: true });
    expect(result.variables.time).toBe(input.variables.time);
  });

  it('does not clamp an authorized quiet wait to the old 180-minute maximum', () => {
    const input = fixture();
    input.resolvedAction = { ...input.resolvedAction, endTime: '2024-09-09T13:00:00', plannedMinutes: 300, executedMinutes: 300,
      segments: [], resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 100, sanity: 70 } } };
    expect(settleGameTransaction({ ...input, narrativeTurn: true }).variables.time).toBe('2024-09-09T13:00:00');
  });

  it.each(['clock', 'cycle', 'location', 'resources'] as const)('rejects a stale resolution after %s changed', field => {
    const input = fixture();
    if (field === 'clock') input.variables.time = '2024-09-09T09:00:00';
    if (field === 'cycle') input.variables.cycleCount = 2;
    if (field === 'location') input.variables.location = 'school';
    if (field === 'resources') input.gameStatus.stamina = 90;
    expect(() => settleGameTransaction(input)).toThrow(/失效|stale|mismatch/i);
  });

  it('rejects a second settlement of the same zero-time event identity', () => {
    const input = fixture();
    input.resolvedAction = { ...input.resolvedAction, endTime: input.variables.time, plannedMinutes: 0, executedMinutes: 0,
      segments: [], resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 100, sanity: 70 } } };
    const first = settleGameTransaction(input);
    expect(() => settleGameTransaction({ variables: first.variables, gameStatus: first.gameStatus, resolvedAction: input.resolvedAction }))
      .toThrow(/重复|already|duplicate/i);
  });

  it('keeps interrupted work through a same-location event, but drops it when a new work plan commits', () => {
    const input = fixture();
    const continuation = { actionId: 'old-work', cycleCount: 1, steps: [input.resolvedAction.segments[0].step],
      previousResolutionId: 'interrupted', stepsDigest: 'test', resumableFromTime: input.variables.time,
      expectedLocationId: 'home', activeStepId: 'q', completedMinutesByStep: { q: 30 }, chargedStaminaByStep: { q: 4 } };
    const variables = { ...input.variables, actionContinuity: { cycleCount: 1, continuation } };
    const event: ResolvedActionOutcome = { ...input.resolvedAction, endTime: input.variables.time,
      plannedMinutes: 0, executedMinutes: 0, segments: [],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 100, sanity: 70 } } };
    expect(settleGameTransaction({ ...input, variables, resolvedAction: event }).variables.actionContinuity?.continuation)
      .toEqual(continuation);
    expect(settleGameTransaction({ ...input, variables }).variables.actionContinuity?.continuation).toBeNull();
  });

  it('keeps the original continuation and private authority while acknowledging its due commitment boundary', () => {
    const commitment = {
      id: 'commitment:school-meeting', cycleCount: 1, actorId: 'school-guard', recipientId: 'player',
      action: '在校门口见面', locationId: 'school', dueAt: '2024-09-09T08:05:00', status: 'active' as const,
      sourceEventId: 'turn:promise', evidenceQuote: '八点零五分在校门口见。',
    };
    const variables = {
      ...createDefaultVariables(), cycleCount: 1, location: 'home', time: '2024-09-09T08:00:00', stamina: 100, sanity: 70,
      worldMemory: {
        version: 2 as const, canonicalTruthVersion: 'test', events: [], cognition: [], episodes: [], softCanonFacts: [],
        disclosures: [], commitments: [commitment], acknowledgedCommitmentBoundaryIds: [],
      },
    };
    const gameStatus = { time: new Date(variables.time), stamina: 100, sanity: 70, items: [] };
    const boundary = commitmentBoundariesFromVariables(variables)[0];
    const travel = resolveAction({
      id: 'map-travel:school', cycleCount: 1, startTime: variables.time, currentLocationId: 'home',
      stamina: 100, sanity: 70, nextBoundary: boundary,
      steps: [{ id: 'school-leg', kind: 'travel', scope: 'short', locationId: 'school', completionSourceIds: [] }],
    });
    const interrupted = settleGameTransaction({ variables, gameStatus, resolvedAction: travel });
    const original = interrupted.variables.actionContinuity!.continuation!;
    const authorization = {
      actionId: original.actionId, cycleCount: 1, graphFingerprint: 'graph', revelations: [], knowledgeMilestones: [],
    };
    const sceneContext = {
      actionId: original.actionId, cycleCount: 1, contextsByLocation: {},
    };
    interrupted.variables.actionContinuity = {
      ...interrupted.variables.actionContinuity!, pendingAuthorization: authorization, sceneContext,
    };
    const handling = resolveAction({
      id: 'neutral-handling', cycleCount: 1, startTime: travel.endTime, currentLocationId: 'home',
      stamina: travel.resources.after.stamina, sanity: travel.resources.after.sanity, nextBoundary: boundary,
      steps: [{ id: 'inquiry', kind: 'inquiry', scope: 'normal', locationId: 'home', completionSourceIds: [] }],
    });
    expect(handling.executedMinutes).toBe(0);
    expect(handling.continuation?.actionId).toBe('neutral-handling');

    const settled = settleGameTransaction({
      variables: interrupted.variables, gameStatus: interrupted.gameStatus, resolvedAction: handling,
    });

    expect(settled.variables.actionContinuity?.continuation).toEqual(original);
    expect(settled.variables.actionContinuity?.pendingAuthorization).toEqual(authorization);
    expect(settled.variables.actionContinuity?.sceneContext).toEqual(sceneContext);
  });

  it.each(['forged', 'stale'] as const)('does not retain old work for a %s commitment-boundary resolution', kind => {
    const input = fixture();
    const oldContinuation = {
      actionId: 'old-work', cycleCount: 1, steps: [input.resolvedAction.segments[0].step],
      previousResolutionId: 'old-resolution', stepsDigest: 'old-digest', resumableFromTime: input.variables.time,
      expectedLocationId: 'home', activeStepId: 'q', completedMinutesByStep: { q: 20 }, chargedStaminaByStep: { q: 3 },
    };
    const commitment = {
      id: 'commitment:due', cycleCount: 1, actorId: 'school-guard', recipientId: 'player', action: '见面',
      locationId: 'home', dueAt: input.variables.time, status: 'active' as const,
      sourceEventId: 'turn:promise', evidenceQuote: '八点见。',
    };
    input.variables.actionContinuity = { cycleCount: 1, continuation: oldContinuation };
    input.variables.actionContinuity.pendingAuthorization = {
      actionId: oldContinuation.actionId, cycleCount: 1, graphFingerprint: 'old-graph',
      revelations: [], knowledgeMilestones: [],
    };
    input.variables.worldMemory = {
      version: 2, canonicalTruthVersion: 'test', events: [], cognition: [], episodes: [], softCanonFacts: [],
      disclosures: [], commitments: [commitment],
      acknowledgedCommitmentBoundaryIds: kind === 'stale' ? ['commitment-boundary:commitment:due'] : [],
    };
    const boundaryId = kind === 'forged'
      ? 'commitment-boundary:commitment:forged'
      : 'commitment-boundary:commitment:due';
    const handling = resolveAction({
      id: `handling:${kind}`, cycleCount: 1, startTime: input.variables.time as string, currentLocationId: 'home',
      stamina: 100, sanity: 70, nextBoundary: { id: boundaryId, at: input.variables.time as string },
      steps: [{ id: 'new-work', kind: 'inquiry', scope: 'normal', locationId: 'home', completionSourceIds: [] }],
    });

    const settled = settleGameTransaction({ ...input, resolvedAction: handling });

    expect(settled.variables.actionContinuity?.continuation?.actionId).toBe(`handling:${kind}`);
    expect(settled.variables.actionContinuity?.continuation?.actionId).not.toBe(oldContinuation.actionId);
    expect(settled.variables.actionContinuity?.pendingAuthorization).toBeNull();
  });
});
