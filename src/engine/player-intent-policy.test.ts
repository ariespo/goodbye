import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { evaluatePlayerIntent } from './player-intent-policy';

describe('player intent policy', () => {
  it('treats player input as an attempt, not a guaranteed outcome', () => {
    const result = evaluatePlayerIntent('去便利店问问情况', createDefaultVariables());
    expect(result.mode).toBe('normal');
    expect(result.directorDirective).toContain('尝试');
    expect(result.sanityPenalty).toBe(0);
  });

  it('diverts repeated suspect investigation after the daily budget is exhausted', () => {
    const variables = createDefaultVariables();
    variables.suspicion['old-man'] = 25;
    variables.loopSuspicionStart['old-man'] = 10;
    const result = evaluatePlayerIntent('继续调查周大爷', variables);
    expect(result).toMatchObject({ mode: 'divert', targetedActorId: 'old-man', suspicionRemaining: 0 });
    expect(result.directorDirective).toContain('saturationPivot');
    expect(result.directorDirective).toContain('其他角色自然介入');
  });

  it('turns impossible or rule-breaking input into a sanity-costing fantasy', () => {
    const result = evaluatePlayerIntent('我使用读心术让凶手立刻自首', createDefaultVariables());
    expect(result.mode).toBe('fantasy');
    expect(result.sanityPenalty).toBe(8);
    expect(result.directorDirective).toContain('幻想');
  });
});
