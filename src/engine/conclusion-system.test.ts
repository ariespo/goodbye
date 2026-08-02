import { describe, expect, it } from 'vitest';
import {
  chooseConclusion,
  getConclusionChoices,
  getConclusionOverlays,
  getConclusionRoutes,
  lockConclusionRoute,
  selectConclusionOverlay,
} from './conclusion-system';

function variables(overrides: Record<string, unknown> = {}) {
  return {
    cycleCount: 1,
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
    const base = variables({ lockedRoute: 'A', cycleCount: 3, cultClues: ['a', 'b', 'c'] });
    const deep = { ...base, cycleCount: 4 };

    expect(getConclusionOverlays(base).map(option => option.id)).toEqual([null]);
    expect(getConclusionOverlays(deep).map(option => option.id)).toEqual([null, 'CULT']);
    expect(selectConclusionOverlay(base, 'CULT').accepted).toBe(false);
    expect(selectConclusionOverlay(deep, 'CULT').accepted).toBe(true);
  });

  it('maps every final choice to a deterministic ending', () => {
    const routeA = variables({ lockedRoute: 'A' });
    const cult = variables({ lockedRoute: 'A', overlay: 'CULT', cycleCount: 4, cultClues: ['a', 'b', 'c'] });

    expect(getConclusionChoices(routeA).map(choice => choice.endingId)).toEqual(['A-1', 'A-2']);
    expect(chooseConclusion(routeA, 'report')).toMatchObject({ accepted: true, endingId: 'A-1' });
    expect(chooseConclusion(cult, 'destroy')).toMatchObject({ accepted: true, endingId: 'X-1' });
    expect(chooseConclusion(routeA, 'wake').accepted).toBe(false);
  });
});
