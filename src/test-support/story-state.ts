import type { ConclusionRouteId } from '../engine/conclusion-system';
import type { DynamicRecord } from '../sillytavern/types';
import { ROUTE_SUPPORT_FACTS, ROUTE_CAUSAL_FACTS, SOLUTION_FACTS, OVERLAY_EVIDENCE_FACTS } from '../engine/story-rules';
import { ITINERARY_FACT_IDS, ITINERARY_CROSSCHECK_FACT_ID } from '../agents/mystery/itinerary';

/** A fully investigated fixture; individual gate tests remove their specific missing evidence. */
export function investigatedStoryState(route: ConclusionRouteId): DynamicRecord {
  const clues = [...ROUTE_SUPPORT_FACTS[route], ...ROUTE_CAUSAL_FACTS[route],
    ...(route === 'NONE' ? [...ITINERARY_FACT_IDS, ITINERARY_CROSSCHECK_FACT_ID] : []),
    ...(route === 'FAKE' ? ['fake-alias-ticket'] : []),
    ...(route === 'A' ? OVERLAY_EVIDENCE_FACTS.CULT : []),
    ...(route === 'C' ? OVERLAY_EVIDENCE_FACTS.PSYCH : [])];
  return {
    cycleCount: 5, lockedRoute: route, overlay: null, finalChoice: null,
    sanity: 10, tripProgress: route === 'NONE' ? 100 : 0,
    suspicion: { 'old-man': 50, 'detective-a': 50, 'detective-b': 50, self: 50 },
    letterFragments: route === 'NONE' ? ROUTE_SUPPORT_FACTS.NONE.filter(id => id.startsWith('none-letter-')) : [],
    fakeEvidence: route === 'FAKE' ? ROUTE_SUPPORT_FACTS.FAKE : [],
    cultClues: route === 'A' ? OVERLAY_EVIDENCE_FACTS.CULT : [],
    worldGlitchClues: route === 'C' ? OVERLAY_EVIDENCE_FACTS.PSYCH : [],
    mysteryKnowledge: {
      ...Object.fromEntries(clues.map(id => [id, 'clue'])),
      [SOLUTION_FACTS[route]]: 'confirmation',
      ...(route === 'A' ? { [SOLUTION_FACTS.CULT]: 'confirmation' } : {}),
      ...(route === 'C' ? { [SOLUTION_FACTS.PSYCH]: 'confirmation' } : {}),
    },
  };
}
