import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { TruthContext } from './types';

const context: TruthContext = {
  cycleCount: 1,
  currentLocation: 'home',
  lockedRoute: null,
  unlockedClueIds: [],
  playerKnowledge: {},
  suspicion: {},
  activeNpcIds: [],
};

describe('opaque fact aliases', () => {
  it('removes semantic and hidden fact ids from the director brief', () => {
    const internal = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context);
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const projected = buildAliasedMysteryBrief(internal, aliases);
    const serialized = JSON.stringify(projected);

    expect(projected.usableFacts.every(fact => /^F\d{3}$/.test(fact.id))).toBe(true);
    expect(projected.hiddenFacts).toEqual([]);
    expect(serialized).not.toContain('shared-apron-missing');
    expect(serialized).not.toContain('c-player-killed-fumi');
    expect(serialized).not.toContain('solution');
  });

  it('keeps a private reversible map outside the prompt projection', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const alias = aliases.factIdToAlias['a-murder-staged-fall'];
    expect(alias).toMatch(/^F\d{3}$/);
    expect(aliases.aliasToFactId[alias]).toBe('a-murder-staged-fall');
  });
});
