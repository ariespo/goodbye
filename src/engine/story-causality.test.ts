import { describe, expect, it } from 'vitest';
import { chooseConclusion, getConclusionRoutes, getConclusionFinalReadiness } from './conclusion-system';
import { checkEndingConditions } from '../sillytavern/ending-checker';
import type { Ending } from '../sillytavern/types';

const readyA = {
  cycleCount: 5, lockedRoute: 'A', overlay: null,
  suspicion: { 'old-man': 50 },
  mysteryKnowledge: {
    'a-orphanage-contact': 'clue', 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue',
    'a-window-transfer-match': 'clue', 'a-murder-staged-fall': 'confirmation',
  },
};

describe('story causal conclusion gates', () => {
  it('does not infer survival from three travel preparations or arbitrary collection entries', () => {
    const state = { cycleCount: 5, fakeEvidence: ['a', 'b', 'c'], mysteryKnowledge: {
      'fake-alias-ticket': 'clue', 'fake-empty-savings': 'clue', 'fake-touko-request': 'clue',
    } };
    expect(getConclusionRoutes(state).find(route => route.id === 'FAKE')?.available).toBe(false);
  });

  it('does not infer an accident from departure letters and a legacy progress number', () => {
    expect(getConclusionRoutes({ cycleCount: 5, tripProgress: 100, letterFragments: ['a', 'b', 'c'] })
      .find(route => route.id === 'NONE')?.available).toBe(false);
  });

  it('requires independently acquired physical evidence even when an old save contains the solution', () => {
    expect(chooseConclusion({ ...readyA, mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' } }, 'report').accepted).toBe(false);
    expect(chooseConclusion(readyA, 'report')).toMatchObject({ accepted: true, endingId: 'A-1' });
  });

  it('does not treat hint-level physical evidence as a completed inference', () => {
    expect(chooseConclusion({ ...readyA, mysteryKnowledge: { ...readyA.mysteryKnowledge, 'a-window-transfer-match': 'hint' } }, 'report').accepted).toBe(false);
  });

  it('keeps the first three days closed even for restored final-choice state', () => {
    expect(chooseConclusion({ ...readyA, cycleCount: 3 }, 'report').accepted).toBe(false);
  });

  it('requires the underlying death conclusion before the psychological explanation can end', () => {
    const state = { cycleCount: 5, lockedRoute: 'C', overlay: 'PSYCH', sanity: 10,
      worldGlitchClues: ['a', 'b', 'c'], mysteryKnowledge: { 'psych-investigation-is-episode': 'confirmation' } };
    expect(getConclusionFinalReadiness(state).met).toBe(false);
  });

  it('prevents built-in ending dispatch from bypassing the same causal gate', () => {
    const ending: Ending = { id: 'A-1', name: 'A', truthType: 'A', tag: 'good', description: '',
      conditionGroups: [{ id: 'a', name: 'a', mode: 'all', conditions: [{ variablePath: 'finalChoice', operator: '=', targetValue: 'report' }] }],
      isUnlocked: false, order: 1 };
    expect(checkEndingConditions({ ...readyA, cycleCount: 3, finalChoice: 'report' }, [ending])).toBeNull();
    expect(checkEndingConditions({ ...readyA, finalChoice: 'report' }, [ending])?.id).toBe('A-1');
  });
});
