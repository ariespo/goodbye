import { describe, expect, it } from 'vitest';
import { reviewNarrativeDeterministically } from './narrative-review';

const emptyAuthority = { authorizedFacts: [], playerKnownFacts: [] };

describe('deterministic final narrative review', () => {
  it('blocks an invented same-morning purchase and destination claim', () => {
    const violations = reviewNarrativeDeterministically(
      emptyAuthority,
      '陈慧慧|“付钱的时候也没多说话，我还以为她赶时间……好像往山那边走了。”',
    );

    expect(violations).toEqual([
      expect.objectContaining({ code: 'ungrounded-past-claim' }),
    ]);
  });

  it('allows present-time service interaction and the authorized identity introduction', () => {
    expect(reviewNarrativeDeterministically(
      emptyAuthority,
      '店员|“欢、欢迎光临。”\n旁白|你认出这是附近便利店的店员陈慧慧。',
    )).toEqual([]);
  });

  it('blocks invented habitual shared visits', () => {
    const violations = reviewNarrativeDeterministically(
      emptyAuthority,
      '陈慧慧|“以前那个小姑娘，文穗，她不是经常跟你一起来吗？”',
    );

    expect(violations).toEqual([
      expect.objectContaining({ code: 'ungrounded-past-claim' }),
    ]);
  });
});
