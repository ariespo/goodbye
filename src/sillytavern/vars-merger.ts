export function mergeVariables(
  current: Record<string, any>,
  updates: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      delete result[key];
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeVariables(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
