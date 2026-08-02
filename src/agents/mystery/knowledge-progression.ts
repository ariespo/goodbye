import type { RevealLevel } from './types';

const COLLECTED_REVEAL_LEVELS = new Set<RevealLevel>(['clue', 'confirmation']);

const TRIP_MILESTONE_FACT_IDS = [
  'shared-school-absence',
  'shared-water-tower-secret',
  'none-letter-bedroom',
  'none-letter-water-tower',
] as const;

function stringSet(value: unknown): Set<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [],
  );
}

function isCollected(level: RevealLevel | undefined): boolean {
  return level !== undefined && COLLECTED_REVEAL_LEVELS.has(level);
}

/**
 * Route collections are derived from fact-gate knowledge, never from Writer or
 * State Agent prose. Existing entries are preserved for save compatibility.
 */
export function deriveAuthorizedFactProgress(
  variables: Record<string, any>,
  knowledge: Record<string, RevealLevel>,
): Pick<
  Record<string, any>,
  'letterFragments' | 'fakeEvidence' | 'cultClues' | 'worldGlitchClues' | 'tripProgress'
> {
  const letterFragments = stringSet(variables.letterFragments);
  const fakeEvidence = stringSet(variables.fakeEvidence);
  const cultClues = stringSet(variables.cultClues);
  const worldGlitchClues = stringSet(variables.worldGlitchClues);

  for (const [factId, level] of Object.entries(knowledge)) {
    if (!isCollected(level)) continue;

    if (factId.startsWith('none-letter-')) letterFragments.add(factId);
    if (factId.startsWith('fake-') && factId !== 'fake-staged-death-escape') {
      fakeEvidence.add(factId);
    }
    if (factId.startsWith('cult-') && factId !== 'cult-sacrifice-powers-loop') {
      cultClues.add(factId);
    }
    if (factId.startsWith('psych-') && factId !== 'psych-investigation-is-episode') {
      worldGlitchClues.add(factId);
    }
  }

  const completedMilestones = TRIP_MILESTONE_FACT_IDS
    .filter(factId => isCollected(knowledge[factId]))
    .length;
  const tripProgress = Math.max(
    Number.isFinite(Number(variables.tripProgress)) ? Number(variables.tripProgress) : 0,
    completedMilestones * 25,
  );

  return {
    letterFragments: [...letterFragments],
    fakeEvidence: [...fakeEvidence],
    cultClues: [...cultClues],
    worldGlitchClues: [...worldGlitchClues],
    tripProgress: Math.min(100, tripProgress),
  };
}
