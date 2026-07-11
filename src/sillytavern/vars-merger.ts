export function mergeVariables(
  current: Record<string, any>,
  updates: Record<string, any>
): Record<string, any> {
  let result: Record<string, any> = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    if (key.includes('.')) {
      result = setVariablePath(result, key, value);
    } else if (value === null || value === undefined) {
      delete result[key];
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeVariables(result[key] || {}, value);
    } else if ((key === 'unlockedClues' || key === 'organizedClues') && Array.isArray(result[key]) && Array.isArray(value)) {
      result[key] = mergeUniqueArray(result[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function mergeUniqueArray(current: any[], updates: any[]): any[] {
  const result = [...current];
  for (const item of updates) {
    const exists = result.some(existing => {
      if (typeof existing === 'string' || typeof item === 'string') return existing === item;
      if (existing?.id && item?.id) return existing.id === item.id;
      return JSON.stringify(existing) === JSON.stringify(item);
    });
    if (!exists) result.push(item);
  }
  return result;
}

export const DEFAULT_GAME_VARIABLES: Record<string, any> = {
  cycleCount: 1,
  stamina: 100,
  sanity: 80,
  affinity: { fumi: 70, touko: 40, saku: 0 },
  suspicion: { self: 10, fumi: 0, touko: 5, occult: 0 },
  investigation: { psych: 0, crime: 0, occult: 0, science: 0 },
  unlockedClues: [],
  organizedClues: [],
};

export function createDefaultVariables(): Record<string, any> {
  return mergeVariables({}, DEFAULT_GAME_VARIABLES);
}

export function getVariablePath(source: Record<string, any> | undefined, path: string): any {
  if (!source || !path) return undefined;
  return path.split('.').reduce<any>((value, key) => {
    if (value === null || value === undefined) return undefined;
    return value[key];
  }, source);
}

export function setVariablePath(
  source: Record<string, any>,
  path: string,
  value: any
): Record<string, any> {
  const [head, ...rest] = path.split('.').filter(Boolean);
  if (!head) return source;

  if (rest.length === 0) {
    return mergeVariables(source, { [head]: value });
  }

  return mergeVariables(source, {
    [head]: setVariablePath(
      typeof source[head] === 'object' && source[head] !== null && !Array.isArray(source[head])
        ? source[head]
        : {},
      rest.join('.'),
      value
    ),
  });
}

export function variablesToEndingContext(
  variables: Record<string, any>,
  endingsSeen: string[] = []
): Record<string, any> {
  const merged = mergeVariables(createDefaultVariables(), variables);
  return {
    ...merged,
    cycleCount: Number(merged.cycleCount ?? 1),
    affinity: merged.affinity ?? {},
    suspicion: merged.suspicion ?? {},
    investigation: merged.investigation ?? {},
    unlockedClues: Array.isArray(merged.unlockedClues) ? merged.unlockedClues : [],
    organizedClues: Array.isArray(merged.organizedClues) ? merged.organizedClues : [],
    endingsSeen,
  };
}
