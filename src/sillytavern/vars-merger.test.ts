import { describe, it, expect } from 'vitest';
import { mergeVariables } from './vars-merger';

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
});
