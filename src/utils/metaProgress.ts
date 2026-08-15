import type { DynamicRecord } from '../sillytavern/types';

export interface MetaProgress {
  version: 1;
  endingsSeen: string[];
  routesLockedEver: string[];
  stayedEver: boolean;
  updatedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const META_PROGRESS_KEY = 'farewell.meta-progress.v1';

function defaultMeta(): MetaProgress {
  return {
    version: 1,
    endingsSeen: [],
    routesLockedEver: [],
    stayedEver: false,
    updatedAt: 0,
  };
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(item => typeof item === 'string'))]
    : [];
}

export function loadMetaProgress(storage: StorageLike | null = browserStorage()): MetaProgress {
  if (!storage) return defaultMeta();
  try {
    const raw = storage.getItem(META_PROGRESS_KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw) as Partial<MetaProgress>;
    return {
      version: 1,
      endingsSeen: stringArray(parsed.endingsSeen),
      routesLockedEver: stringArray(parsed.routesLockedEver),
      stayedEver: Boolean(parsed.stayedEver),
      updatedAt: Number(parsed.updatedAt ?? 0),
    };
  } catch {
    return defaultMeta();
  }
}

export function saveMetaProgress(
  patch: Partial<Omit<MetaProgress, 'version' | 'updatedAt'>>,
  storage: StorageLike | null = browserStorage(),
): MetaProgress {
  const current = loadMetaProgress(storage);
  const next: MetaProgress = {
    version: 1,
    endingsSeen: [...new Set([...current.endingsSeen, ...stringArray(patch.endingsSeen)])],
    routesLockedEver: [...new Set([
      ...current.routesLockedEver,
      ...stringArray(patch.routesLockedEver),
    ])],
    stayedEver: current.stayedEver || Boolean(patch.stayedEver),
    updatedAt: Date.now(),
  };
  try {
    storage?.setItem(META_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // 无持久化权限时仍返回合并结果，单次会话继续可用。
  }
  return next;
}

export function recordEndingProgress(
  endingId: string,
  variables: DynamicRecord,
  storage: StorageLike | null = browserStorage(),
): MetaProgress {
  const route = typeof variables.lockedRoute === 'string' ? variables.lockedRoute : null;
  return saveMetaProgress({
    endingsSeen: [endingId],
    routesLockedEver: [
      ...stringArray(variables.routesLockedEver),
      ...(route ? [route] : []),
    ],
    stayedEver: Boolean(variables.stayedEver) || endingId === 'STAY',
  }, storage);
}

export function mergeMetaProgress(
  variables: DynamicRecord,
  endingsSeen: string[],
  meta: MetaProgress = loadMetaProgress(),
): { variables: DynamicRecord; endingsSeen: string[] } {
  return {
    variables: {
      ...variables,
      routesLockedEver: [...new Set([
        ...stringArray(variables.routesLockedEver),
        ...meta.routesLockedEver,
      ])],
      stayedEver: Boolean(variables.stayedEver) || meta.stayedEver,
    },
    endingsSeen: [...new Set([...endingsSeen, ...meta.endingsSeen])],
  };
}
