import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { buildMapTravelTransaction, prepareMapTravel } from './mapTravel';

function travelState(time = '2024-09-09T08:00:00') {
  return {
    variables: { ...createDefaultVariables(), cycleCount: 1, location: 'home', time },
    gameStatus: { time: new Date(time), stamina: 100, sanity: 70, items: [] },
  };
}

describe('map travel authority', () => {
  it('uses one pure travel step and the actual registered travel quote', () => {
    const state = travelState();
    const prepared = prepareMapTravel({ ...state, destinationLocationId: 'school' });
    if (prepared.kind !== 'travel') throw new Error('expected travel');

    expect(prepared.quote).toEqual({ workMinutes: 0, travelMinutes: 10, totalMinutes: 10, staminaCost: 4 });
    expect(prepared.outcome.endLocationId).toBe('school');
    expect(prepared.outcome.executedMinutes).toBe(10);
    expect(prepared.outcome.segments).toHaveLength(1);
    expect(prepared.outcome.segments[0].step.kind).toBe('travel');
    expect(prepared.publicOutcome.actionId).toBe(prepared.actionId);
  });

  it('keeps an interrupted traveler at the origin with remaining travel and no visit grant', () => {
    const state = travelState();
    const prepared = prepareMapTravel({
      ...state,
      destinationLocationId: 'school',
      nextBoundary: { id: 'commitment-boundary:test', at: '2024-09-09T08:05:00' },
    });
    if (prepared.kind !== 'travel') throw new Error('expected travel');
    const transaction = buildMapTravelTransaction({
      ...state, prepared, knowledgeEvents: [], endings: [], endingsSeen: [], hasEndingInProgress: false,
    });

    expect(prepared.outcome.endLocationId).toBe('home');
    expect(prepared.publicOutcome.executedTravelMinutes).toBe(5);
    expect(prepared.publicOutcome.remaining).toMatchObject({ travelMinutes: 5, continuationId: prepared.actionId });
    expect(transaction.variables.location).toBe('home');
    expect(transaction.variables.knowledgeEvents).not.toContain('visit:school');
  });

  it('does not create a zero-clock travel result when a boundary is already due', () => {
    const state = travelState();
    expect(prepareMapTravel({
      ...state,
      destinationLocationId: 'school',
      nextBoundary: { id: 'death-news', at: '2024-09-09T08:00:00' },
    })).toMatchObject({ kind: 'boundary-due', boundary: { id: 'death-news' } });
  });

  it('resumes the exact remaining map leg after the blocking event is delivered', () => {
    const state = travelState();
    const first = prepareMapTravel({
      ...state,
      destinationLocationId: 'school',
      nextBoundary: { id: 'death-news', at: '2024-09-09T08:05:00' },
    });
    if (first.kind !== 'travel') throw new Error('expected travel');
    const interrupted = buildMapTravelTransaction({
      ...state, prepared: first, knowledgeEvents: [], endings: [], endingsSeen: [], hasEndingInProgress: false,
    });
    const resumed = prepareMapTravel({
      variables: { ...interrupted.variables, deathNews: 'delivered' },
      gameStatus: interrupted.gameStatus,
      destinationLocationId: 'school',
      nextBoundary: { id: 'midnight', at: '2024-09-10T00:00:00' },
    });
    if (resumed.kind !== 'travel') throw new Error('expected resumed travel');

    expect(resumed.actionId).toBe(first.actionId);
    expect(resumed.quote).toEqual({ workMinutes: 0, travelMinutes: 5, totalMinutes: 5, staminaCost: 2 });
    expect(resumed.outcome.endLocationId).toBe('school');
    expect(resumed.outcome.resources.after.stamina).toBe(96);
  });
});
