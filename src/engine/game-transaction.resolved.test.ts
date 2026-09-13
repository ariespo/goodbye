import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import type { ResolvedActionOutcome } from './action-resolution';
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
});
