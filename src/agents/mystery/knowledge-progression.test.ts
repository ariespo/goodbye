import { describe, expect, it } from 'vitest';
import { deriveAuthorizedFactProgress } from './knowledge-progression';

describe('deriveAuthorizedFactProgress', () => {
  it('collects only clue-level or confirmed route facts', () => {
    const result = deriveAuthorizedFactProgress({}, {
      'none-letter-bedroom': 'hint',
      'none-letter-water-tower': 'clue',
      'fake-body-mismatch': 'confirmation',
      'fake-staged-death-escape': 'confirmation',
      'cult-symbol-sun-room': 'clue',
      'cult-sacrifice-powers-loop': 'confirmation',
      'psych-doctor-badge': 'clue',
      'psych-investigation-is-episode': 'confirmation',
    });

    expect(result.letterFragments).toEqual(['none-letter-water-tower']);
    expect(result.fakeEvidence).toEqual(['fake-body-mismatch']);
    expect(result.cultClues).toEqual(['cult-symbol-sun-room']);
    expect(result.worldGlitchClues).toEqual(['psych-doctor-badge']);
  });

  it('derives itinerary progress from authorized milestones and preserves saves', () => {
    const result = deriveAuthorizedFactProgress({
      tripProgress: 75,
      letterFragments: ['legacy-description'],
    }, {
      'shared-school-absence': 'clue',
      'shared-water-tower-secret': 'clue',
      'none-letter-bedroom': 'clue',
      'none-letter-water-tower': 'confirmation',
      'none-letter-door-gap': 'clue',
    });

    expect(result.tripProgress).toBe(100);
    expect(result.letterFragments).toEqual([
      'legacy-description',
      'none-letter-bedroom',
      'none-letter-water-tower',
      'none-letter-door-gap',
    ]);
  });

  it('does not decrease route progress', () => {
    const result = deriveAuthorizedFactProgress({
      tripProgress: 100,
      fakeEvidence: ['legacy-evidence'],
    }, {});

    expect(result.tripProgress).toBe(100);
    expect(result.fakeEvidence).toEqual(['legacy-evidence']);
  });
});
