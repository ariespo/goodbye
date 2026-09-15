import { describe, expect, it } from 'vitest';
import {
  chooseConclusion,
  getConclusionChoices,
  getConclusionFinalReadiness,
  getConclusionOverlays,
  getConclusionRoutes,
  lockConclusionRoute,
  selectConclusionOverlay,
} from './conclusion-system';
import { settleCycleVariables } from '../utils/cycleLoop';
import { investigatedStoryState } from '../test-support/story-state';

function variables(overrides: Record<string, unknown> = {}) {
  return {
    cycleCount: 4,
    sanity: 80,
    tripProgress: 0,
    suspicion: { 'old-man': 0, 'detective-a': 0, 'detective-b': 0, self: 0 },
    letterFragments: [],
    fakeEvidence: [],
    cultClues: [],
    worldGlitchClues: [],
    lockedRoute: null,
    overlay: null,
    finalChoice: null,
    mysteryKnowledge: {
      'a-orphanage-contact': 'clue',
      'a-sacrifice-list': 'clue',
      'a-lured-inside': 'clue',
      'b-water-tower-blood': 'clue',
      'shared-detective-tail': 'clue',
      'b-commission-message': 'clue',
      'b-detective-coverup': 'clue',
      'c-player-made-leave-call': 'clue',
      'shared-male-leave-call': 'clue',
      'c-night-gap-record': 'clue',
      'c-loop-is-reenactment': 'clue',
      'fake-body-mismatch': 'clue',
      'fake-misidentification-chain': 'clue',
      'fake-postdeath-sighting': 'clue',
      'fake-alias-ticket': 'clue',
    },
    ...overrides,
  };
}

describe('conclusion system', () => {
  it('exposes route readiness from player evidence', () => {
    const routes = getConclusionRoutes(variables({
      suspicion: { 'old-man': 50, 'detective-a': 12, 'detective-b': 50, self: 50 },
      fakeEvidence: ['a', 'b', 'c'],
    }));

    expect(routes.filter(route => route.available).map(route => route.id)).toEqual(['A', 'B', 'C', 'FAKE']);
    expect(routes.find(route => route.id === 'NONE')?.available).toBe(false);
  });

  it('requires the complete no-killer route gate', () => {
    const state = variables({
      ...investigatedStoryState('NONE'),
      tripProgress: 100,
      letterFragments: ['a', 'b', 'c'],
      suspicion: { 'old-man': 49, 'detective-a': 20, 'detective-b': 10, self: 49 },
    });

    expect(getConclusionRoutes(state).find(route => route.id === 'NONE')?.available).toBe(true);
  });

  it('locks one eligible route and refuses a rewrite', () => {
    const state = variables({ suspicion: { 'old-man': 50, 'detective-a': 50, 'detective-b': 0, self: 0 } });
    const first = lockConclusionRoute(state, 'A');
    const rewrite = lockConclusionRoute(first.value, 'B');

    expect(first.accepted).toBe(true);
    expect(first.value.lockedRoute).toBe('A');
    expect(first.value.routesLockedEver).toEqual(['A']);
    expect(rewrite.accepted).toBe(false);
    expect(rewrite.value.lockedRoute).toBe('A');
  });

  it('keeps a deep explanation hidden until its gate is met', () => {
    const base = variables({ ...investigatedStoryState('A'), cycleCount: 3 });
    const deep = { ...base, cycleCount: 4 };

    expect(getConclusionOverlays(base).map(option => option.id)).toEqual([null]);
    expect(getConclusionOverlays(deep).map(option => option.id)).toEqual([null, 'CULT']);
    expect(selectConclusionOverlay(base, 'CULT').accepted).toBe(false);
    expect(selectConclusionOverlay(deep, 'CULT').accepted).toBe(true);
  });

  it('maps every final choice to a deterministic ending', () => {
    const routeA = variables(investigatedStoryState('A'));
    const cult = variables({ ...investigatedStoryState('A'), overlay: 'CULT' });

    expect(getConclusionChoices(routeA).map(choice => choice.endingId)).toEqual(['A-1', 'A-2']);
    expect(chooseConclusion(routeA, 'report')).toMatchObject({ accepted: true, endingId: 'A-1' });
    expect(chooseConclusion(cult, 'destroy')).toMatchObject({ accepted: true, endingId: 'X-1' });
    expect(chooseConclusion(routeA, 'wake').accepted).toBe(false);
  });

  it('blocks route locking before three complete day resets', () => {
    const early = variables({ cycleCount: 3, suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 } });
    expect(lockConclusionRoute(early, 'A').accepted).toBe(false);
    expect(getConclusionRoutes(early).find(route => route.id === 'A')?.criteria
      .find(item => item.id === 'completed-loops')?.valueLabel).toBe('2 / 3');
  });

  it('becomes route-eligible only after the real cycle-3 reset and still blocks a final choice without its solution fact', () => {
    const cycle3 = variables({ cycleCount: 3,
      suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 } });
    expect(lockConclusionRoute(cycle3, 'A').accepted).toBe(false);
    const cycle4 = settleCycleVariables(cycle3);
    const locked = lockConclusionRoute(cycle4, 'A');
    expect(cycle4.cycleCount).toBe(4);
    expect(locked.accepted).toBe(true);
    expect(chooseConclusion(locked.value, 'report')).toMatchObject({ accepted: false });
  });

  it('requires the cycle-4 middle route fact even at threshold suspicion', () => {
    const missingMiddle = variables({
      suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
      mysteryKnowledge: { 'a-sacrifice-list': 'clue' },
    });
    expect(lockConclusionRoute(missingMiddle, 'A').accepted).toBe(false);
    expect(getConclusionRoutes(missingMiddle).find(route => route.id === 'A')?.available).toBe(false);
  });

  it('allows the legal cycle-4 route lock but keeps the deeper cycle-5 solution gate closed', () => {
    const routeReady = variables({
      cycleCount: 4, suspicion: { 'old-man': 50, 'detective-a': 0, 'detective-b': 0, self: 0 },
      mysteryKnowledge: { 'a-orphanage-contact': 'clue', 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' },
    });
    const locked = lockConclusionRoute(routeReady, 'A');
    expect(locked.accepted).toBe(true);
    expect(getConclusionChoices(locked.value).map(choice => choice.id)).toEqual(['report', 'private']);
    expect(getConclusionFinalReadiness(locked.value).met).toBe(false);
    expect(chooseConclusion(locked.value, 'report')).toMatchObject({ accepted: false });
  });
});
