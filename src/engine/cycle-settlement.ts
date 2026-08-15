import { createDefaultVariables, setVariablePath } from '../sillytavern/vars-merger';
import type { DynamicRecord } from '../sillytavern/types';

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
  'worldMemory',
  'playerNameKnownByNpcIds',
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
