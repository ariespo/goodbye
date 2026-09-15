import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { REVEAL_LEVELS, type RevealLevel } from '../agents/mystery/types';

/** Preserve compatible observations while beginning another mutually exclusive case version. */
export function carryCompatibleStoryKnowledge(value: unknown): Record<string, RevealLevel> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const facts = new Map(MYSTERY_TRUTH_GRAPH.facts.map(fact => [fact.id, fact]));
  return Object.fromEntries(Object.entries(value).flatMap(([id, rawLevel]) => {
    const level = rawLevel as RevealLevel;
    if (!REVEAL_LEVELS.includes(level)) return [];
    const fact = facts.get(id);
    if (!fact) return [[id, level]]; // Legacy identifiers stay archival; the fact gate does not authorize them.
    if (fact.kind === 'solution' || fact.availability.requiresRouteLock
      || fact.availability.requiresOverlayLock || fact.availability.requiredBaseRoute) return [];
    const cap = fact.route === 'shared' ? level : fact.availability.maxRevealBeforeRouteLock ?? 'hint';
    const maximum = Math.min(REVEAL_LEVELS.indexOf(level), REVEAL_LEVELS.indexOf(cap));
    const retained = [...REVEAL_LEVELS.slice(0, maximum + 1)].reverse().find(candidate => fact.revelations[candidate]);
    return retained ? [[id, retained]] : [];
  }));
}
