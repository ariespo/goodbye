import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from '../agents/mystery/brief';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import type { RevealLevel, TruthContext } from '../agents/mystery/types';
import { REVEAL_LEVELS } from '../agents/mystery/types';
import { deriveAuthorizedFactProgress } from '../agents/mystery/knowledge-progression';
import { chooseConclusion, getConclusionChoices, getConclusionRoutes, lockConclusionRoute, selectConclusionOverlay } from './conclusion-system';
import type { ConclusionRouteId } from './conclusion-system';
import { ROUTE_CAUSAL_FACTS, SOLUTION_FACTS } from './story-rules';
import type { DynamicRecord } from '../sillytavern/types';

// Traverse real fact-gate offers, never insert a missing prerequisite by fiat.
function investigateAvailableMaterials(state: DynamicRecord): DynamicRecord {
  let knowledge: Record<string, RevealLevel> = { ...(state.mysteryKnowledge as Record<string, RevealLevel> | undefined) };
  for (let pass = 0; pass < MYSTERY_TRUTH_GRAPH.facts.length; pass += 1) {
    let changed = false;
    for (const location of new Set(MYSTERY_TRUTH_GRAPH.facts.flatMap(fact => fact.locations))) {
      const context: TruthContext = { cycleCount: Number(state.cycleCount), lockedRoute: (state.lockedRoute ?? null) as TruthContext['lockedRoute'],
        activeOverlay: (state.overlay ?? null) as TruthContext['activeOverlay'], currentLocation: location,
        currentTime: '2024-09-09T17:00:00',
        activeNpcIds: [], suspicion: state.suspicion as Record<string, number>, affinity: { touko: 100 }, sanity: Number(state.sanity),
        playerKnowledge: knowledge, unlockedClueIds: Object.keys(knowledge), tripProgress: Number(state.tripProgress ?? 0) };
      const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context);
      for (const offer of brief.usableFacts) {
        const level = offer.maxRevealLevel;
        if (REVEAL_LEVELS.indexOf(level) > REVEAL_LEVELS.indexOf(knowledge[offer.id])) {
          knowledge = { ...knowledge, [offer.id]: level };
          changed = true;
        }
      }
    }
    state = { ...state, mysteryKnowledge: knowledge, ...deriveAuthorizedFactProgress(state, knowledge) };
    if (!changed) return state;
  }
  throw new Error('Fact graph did not stabilize');
}

const exploratory = () => investigateAvailableMaterials({ cycleCount: 4, sanity: 10,
  suspicion: { 'old-man': 50, 'detective-a': 50, 'detective-b': 50, self: 50 },
  mysteryKnowledge: {}, lockedRoute: null, overlay: null });

describe('complete causal route traversal', () => {
  it.each(['A', 'B', 'C', 'NONE', 'FAKE'] as ConclusionRouteId[])('%s stays reachable through authorized intermediate evidence', route => {
    const before = exploratory();
    expect(getConclusionRoutes(before).find(option => option.id === route)?.available).toBe(true);
    expect(before.mysteryKnowledge[SOLUTION_FACTS[route]]).toBeUndefined();
    const locked = lockConclusionRoute(before, route);
    expect(locked.accepted).toBe(true);
    const fourthDay = investigateAvailableMaterials(locked.value);
    expect(fourthDay.mysteryKnowledge[SOLUTION_FACTS[route]]).toBeUndefined();
    const final = investigateAvailableMaterials({ ...fourthDay, cycleCount: 5 });
    expect(final.mysteryKnowledge[SOLUTION_FACTS[route]]).toBe('confirmation');
    for (const choice of getConclusionChoices(final)) {
      expect(chooseConclusion(final, choice.id).accepted).toBe(true);
      for (const missing of ROUTE_CAUSAL_FACTS[route]) {
        expect(chooseConclusion({ ...final, mysteryKnowledge: { ...(final.mysteryKnowledge as Record<string, RevealLevel>), [missing]: 'hint' } }, choice.id).accepted).toBe(false);
      }
    }
  });

  it.each([['A', 'CULT'], ['C', 'PSYCH']] as const)('%s overlay %s explains the confirmed base case', (route, overlay) => {
    const locked = lockConclusionRoute(exploratory(), route);
    const base = investigateAvailableMaterials({ ...locked.value, cycleCount: 5 });
    expect(base.mysteryKnowledge[SOLUTION_FACTS[route]]).toBe('confirmation');
    const selected = selectConclusionOverlay(base, overlay);
    expect(selected.accepted).toBe(true);
    const final = investigateAvailableMaterials(selected.value);
    expect(final.mysteryKnowledge[SOLUTION_FACTS[overlay]]).toBe('confirmation');
    for (const choice of getConclusionChoices(final)) expect(chooseConclusion(final, choice.id).accepted).toBe(true);
    const incomplete = { ...final, mysteryKnowledge: { ...(final.mysteryKnowledge as Record<string, RevealLevel>), [SOLUTION_FACTS[route]]: 'clue' } };
    expect(chooseConclusion(incomplete, getConclusionChoices(final)[0].id).accepted).toBe(false);
  });
});
