import { createDefaultVariables, setVariablePath } from '../sillytavern/vars-merger';
import type { DynamicRecord } from '../sillytavern/types';
import { normalizeWorldMemory } from '../memory/world-memory';
import { cognitionIsPublicPlayerNamePermission, resetCharacterContinuity } from '../memory/character-continuity';
import { carryCompatibleStoryKnowledge } from './story-version';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';

const INHERITED_KEYS = [
  'unlockedClues',
  'organizedClues',
  'cultClues',
  'worldGlitchClues',
  'fakeEvidence',
  'letterFragments',
  'routesLockedEver',
  'knowledgeEvents',
  'mysteryKnowledge',
  'suspicion',
  'storyProgress',
] as const;

export function settleCycleVariables(
  current: DynamicRecord,
  opts: { stayed?: boolean } = {},
): DynamicRecord {
  let next = createDefaultVariables();
  for (const key of INHERITED_KEYS) {
    if (current[key] !== undefined) next = setVariablePath(next, key, current[key]);
  }
  next.cycleCount = Number(current.cycleCount ?? 1) + 1;
  if (current.finalChoice) {
    next.storyProgress = { ...next.storyProgress, presentedBeatIds: next.storyProgress?.presentedBeatIds ?? [], versionStartCycle: next.cycleCount };
    next.mysteryKnowledge = carryCompatibleStoryKnowledge(current.mysteryKnowledge);
    const knownFactIds = new Set(MYSTERY_TRUTH_GRAPH.facts.map(fact => fact.id));
    next.unlockedClues = (Array.isArray(next.unlockedClues) ? next.unlockedClues : []).filter(id =>
      !knownFactIds.has(id) || Object.prototype.hasOwnProperty.call(next.mysteryKnowledge, id));
  } else if (current.lockedRoute) {
    next.lockedRoute = current.lockedRoute;
    next.overlay = current.overlay ?? null;
  }
  const resetMemory = resetCharacterContinuity(normalizeWorldMemory(current), next.cycleCount);
  next.worldMemory = resetMemory;
  next.playerNameKnownByNpcIds = resetMemory.cognition.filter(record => (
    record.provenance !== 'authored-baseline'
    && cognitionIsPublicPlayerNamePermission(record, next.cycleCount)
  )).map(record => record.observerId);
  next.stayStreak = opts.stayed ? Number(current.stayStreak ?? 0) + 1 : 0;
  next.stayedEver = Boolean(current.stayedEver) || Number(next.stayStreak) >= 3;
  next.loopSuspicionStart = typeof next.suspicion === 'object' && next.suspicion !== null
    ? { ...next.suspicion }
    : {};
  next.time = '2024-09-09T08:00:00';
  next.stamina = 100;
  next.sanity = 70;
  return next;
}
