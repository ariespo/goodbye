import { describe, expect, it } from 'vitest';
import type { Ending } from './types';
import { checkEndingConditions } from './ending-checker';

const baseEnding: Ending = {
  id: 'normal',
  name: '普通结局',
  truthType: 'A',
  tag: 'normal',
  description: '',
  conditionGroups: [
    {
      id: 'normal-group',
      name: '普通条件',
      mode: 'all',
      conditions: [{ variablePath: 'investigation.psych', operator: '>=', targetValue: 70 }],
    },
  ],
  isUnlocked: false,
  order: 10,
};

describe('checkEndingConditions', () => {
  it('returns null when no ending condition matches', () => {
    expect(checkEndingConditions({ investigation: { psych: 20 } }, [baseEnding])).toBeNull();
  });

  it('matches nested variable conditions', () => {
    expect(checkEndingConditions({ investigation: { psych: 70 } }, [baseEnding])?.id).toBe('normal');
  });

  it('skips endings that have already been seen', () => {
    expect(checkEndingConditions({ investigation: { psych: 80 } }, [baseEnding], ['normal'])).toBeNull();
  });

  it('prefers hidden and true endings before lower tag priorities', () => {
    const trueEnding: Ending = {
      ...baseEnding,
      id: 'true',
      tag: 'true',
      order: 99,
    };
    const hiddenEnding: Ending = {
      ...baseEnding,
      id: 'hidden',
      tag: 'hidden',
      order: 100,
    };

    expect(checkEndingConditions(
      { investigation: { psych: 100 } },
      [baseEnding, trueEnding, hiddenEnding]
    )?.id).toBe('hidden');
  });
});
