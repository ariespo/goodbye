import type { DynamicRecord } from './types';

const UNIQUE_ARRAY_KEYS = new Set([
  'unlockedClues',
  'organizedClues',
  'knowledgeEvents',
  'playerNameKnownByNpcIds',
  'routesLockedEver',
  'cultClues',
  'worldGlitchClues',
  'fakeEvidence',
  'letterFragments',
]);

export function mergeVariables(
  current: DynamicRecord,
  updates: DynamicRecord
): DynamicRecord {
  let result: DynamicRecord = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    if (key.includes('.')) {
      result = setVariablePath(result, key, value);
    } else if (value === null || value === undefined) {
      delete result[key];
    } else if (
      isRecord(value) &&
      isRecord(result[key])
    ) {
      result[key] = mergeVariables(result[key], value);
    } else if (UNIQUE_ARRAY_KEYS.has(key) && Array.isArray(result[key]) && Array.isArray(value)) {
      result[key] = mergeUniqueArray(result[key], value);
    } else {
      result[key] = value;
    }
  }

  if (typeof result.lockedRoute === 'string' && LOCKABLE_ROUTES.has(result.lockedRoute)) {
    const ever = Array.isArray(result.routesLockedEver) ? result.routesLockedEver : [];
    if (!ever.includes(result.lockedRoute)) {
      result.routesLockedEver = [...ever, result.lockedRoute];
    }
  }

  return result;
}

const LOCKABLE_ROUTES = new Set(['A', 'B', 'C', 'NONE', 'FAKE']);

export function isRecord(value: unknown): value is DynamicRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeUniqueArray(current: unknown[], updates: unknown[]): unknown[] {
  const result = [...current];
  for (const item of updates) {
    const exists = result.some(existing => {
      if (typeof existing === 'string' || typeof item === 'string') return existing === item;
      if (isRecord(existing) && isRecord(item) && existing.id && item.id) {
        return existing.id === item.id;
      }
      return JSON.stringify(existing) === JSON.stringify(item);
    });
    if (!exists) result.push(item);
  }
  return result;
}

export const DEFAULT_GAME_VARIABLES: DynamicRecord = {
  cycleCount: 1,
  location: 'home',
  stamina: 100,
  sanity: 80,
  affinity: { fumi: 70, touko: 40 },
  suspicion: {
    'old-man': 0,
    'detective-a': 0,
    'detective-b': 0,
    self: 10,
    clerk: 0,
    teacher: 0,
    senpai: 0,
  },
  // Snapshot taken at 08:00. A suspect may gain at most 15 points before the next reset.
  loopSuspicionStart: {
    'old-man': 0,
    'detective-a': 0,
    'detective-b': 0,
    self: 10,
    clerk: 0,
    teacher: 0,
    senpai: 0,
  },
  investigation: { psych: 0, crime: 0, occult: 0, science: 0 },
  tripProgress: 0,
  unlockedClues: [],
  organizedClues: [],
  knowledgeEvents: ['know:home', 'know:school', 'know:supermarket'],
  /** 除固定熟人外，后续通过明确自我介绍得知玩家姓名的 NPC。由程序事件维护。 */
  playerNameKnownByNpcIds: [],
  /** Versioned accepted-event ledger, per-observer cognition graph and episodic memory. */
  worldMemory: {
    version: 2,
    canonicalTruthVersion: 'mystery-truth-graph',
    events: [],
    cognition: [],
    episodes: [],
    softCanonFacts: [],
  },
  // 三层结局体系
  lockedRoute: null,
  overlay: null,
  finalChoice: null,
  routesLockedEver: [],
  cultClues: [],
  worldGlitchClues: [],
  fakeEvidence: [],
  letterFragments: [],
  stayStreak: 0,
  stayedEver: false,
};

export function createDefaultVariables(): DynamicRecord {
  return mergeVariables({}, DEFAULT_GAME_VARIABLES);
}

export function getVariablePath(source: DynamicRecord | undefined, path: string): unknown {
  if (!source || !path) return undefined;
  let value: unknown = source;
  for (const key of path.split('.')) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

export function setVariablePath(
  source: DynamicRecord,
  path: string,
  value: unknown
): DynamicRecord {
  const [head, ...rest] = path.split('.').filter(Boolean);
  if (!head) return source;

  if (rest.length === 0) {
    return mergeVariables(source, { [head]: value });
  }

  return mergeVariables(source, {
    [head]: setVariablePath(
      isRecord(source[head])
        ? source[head]
        : {},
      rest.join('.'),
      value
    ),
  });
}

export function variablesToEndingContext(
  variables: DynamicRecord,
  endingsSeen: string[] = []
): DynamicRecord {
  const merged = mergeVariables(createDefaultVariables(), variables);
  const arrayLength = (value: unknown) => (Array.isArray(value) ? value.length : 0);
  return {
    ...merged,
    cycleCount: Number(merged.cycleCount ?? 1),
    affinity: isRecord(merged.affinity) ? merged.affinity : {},
    suspicion: isRecord(merged.suspicion) ? merged.suspicion : {},
    investigation: isRecord(merged.investigation) ? merged.investigation : {},
    unlockedClues: Array.isArray(merged.unlockedClues) ? merged.unlockedClues : [],
    organizedClues: Array.isArray(merged.organizedClues) ? merged.organizedClues : [],
    endingsSeen,
    // 三层结局体系派生计数(供结局条件使用)
    routesLockedCount: arrayLength(merged.routesLockedEver),
    cultClueCount: arrayLength(merged.cultClues),
    glitchClueCount: arrayLength(merged.worldGlitchClues),
    fakeEvidenceCount: arrayLength(merged.fakeEvidence),
    letterFragmentCount: arrayLength(merged.letterFragments),
    stayStreak: Number(merged.stayStreak ?? 0),
    stayedEver: Boolean(merged.stayedEver),
    endingsSeenCount: endingsSeen.length,
  };
}
