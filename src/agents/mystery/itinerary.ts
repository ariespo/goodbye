/** The order reconstructed from materials, not the order in which the player must collect them. */
export const ITINERARY_FACT_IDS = [
  'shared-school-absence',
  'shared-water-tower-secret',
  'shared-supermarket-receipt',
  'shared-detective-tail',
  'shared-senpai-camera',
  'shared-observation-deck-plan',
] as const;

export const ITINERARY_CROSSCHECK_FACT_ID = 'shared-itinerary-crosscheck';

/** Measures checked materials; 100 never proves that Fumi actually completed this journey. */
export function getVerifiedItineraryProgress(knowledge: Readonly<Record<string, unknown>>): number {
  const checked = (id: string) => knowledge[id] === 'clue' || knowledge[id] === 'confirmation';
  const count = ITINERARY_FACT_IDS.filter(checked).length;
  return count === ITINERARY_FACT_IDS.length && checked(ITINERARY_CROSSCHECK_FACT_ID) ? 100 : count * 15;
}
