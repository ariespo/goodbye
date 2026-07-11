import { describe, it, expect } from 'vitest';
import { createDefaultVariables, getVariablePath, mergeVariables, setVariablePath } from './vars-merger';

describe('mergeVariables', () => {
  it('should merge flat variables', () => {
    const result = mergeVariables({ a: 1, b: 2 }, { b: 3, c: 4 });
    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('should deep merge nested objects', () => {
    const result = mergeVariables(
      { player: { hp: 100, mp: 50 } },
      { player: { hp: 80 } }
    );
    expect(result).toEqual({ player: { hp: 80, mp: 50 } });
  });

  it('should delete keys set to null', () => {
    const result = mergeVariables({ a: 1, b: 2 }, { b: null });
    expect(result).toEqual({ a: 1 });
  });

  it('should merge dotted path updates into nested variables', () => {
    const result = mergeVariables(
      { affinity: { fumi: 70, touko: 40 } },
      { 'affinity.fumi': 85 }
    );
    expect(result).toEqual({ affinity: { fumi: 85, touko: 40 } });
  });

  it('should read and write variable paths', () => {
    const updated = setVariablePath({}, 'investigation.psych', 30);
    expect(getVariablePath(updated, 'investigation.psych')).toBe(30);
  });

  it('should create default gameplay variables', () => {
    const defaults = createDefaultVariables();
    expect(defaults.cycleCount).toBe(1);
    expect(defaults.affinity.fumi).toBeGreaterThan(0);
    expect(defaults.investigation.psych).toBe(0);
  });
});
