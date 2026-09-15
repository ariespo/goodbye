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

  it('preserves old materials while deriving itinerary progress from verified locations', () => {
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

    expect(result.tripProgress).toBe(30);
    expect(result.letterFragments).toEqual([
      'legacy-description',
      'none-letter-bedroom',
      'none-letter-water-tower',
      'none-letter-door-gap',
    ]);
  });

  it('does not preserve unsupported legacy itinerary completion', () => {
    const result = deriveAuthorizedFactProgress({
      tripProgress: 100,
      fakeEvidence: ['legacy-evidence'],
    }, {});

    expect(result.tripProgress).toBe(0);
    expect(result.fakeEvidence).toEqual(['legacy-evidence']);
  });

  it('requires six location records and an explicit crosscheck before itinerary completion', () => {
    const sixPlaces = {
      'shared-school-absence': 'clue', 'shared-water-tower-secret': 'clue',
      'shared-supermarket-receipt': 'clue', 'shared-detective-tail': 'clue',
      'shared-senpai-camera': 'clue', 'shared-observation-deck-plan': 'clue',
    } as const;
    expect(deriveAuthorizedFactProgress({}, sixPlaces).tripProgress).toBe(90);
    expect(deriveAuthorizedFactProgress({}, { ...sixPlaces, 'shared-itinerary-crosscheck': 'clue' }).tripProgress).toBe(100);
    expect(deriveAuthorizedFactProgress({}, { ...sixPlaces, 'shared-water-tower-secret': 'hint',
      'shared-itinerary-crosscheck': 'confirmation' }).tripProgress).toBe(75);
  });
});
