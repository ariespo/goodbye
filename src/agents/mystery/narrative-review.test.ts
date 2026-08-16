import { describe, expect, it } from 'vitest';
import { removeUngroundedNarrativeLines, reviewNarrativeDeterministically } from './narrative-review';

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

  it('blocks an option that turns an unsupported plain "morning" into established history', () => {
    const violations = reviewNarrativeDeterministically(
      emptyAuthority,
      '<option>追问陈慧慧，她早上还看到什么了</option>',
    );

    expect(violations).toEqual([
      expect.objectContaining({ code: 'ungrounded-past-claim' }),
    ]);
  });

  it('removes only unsupported lines so a valid scene can continue without another model call', () => {
    const candidate = [
      '对话|陈慧慧|calm|“她今天早上来过。”',
      '对话|旁白|calm|你收起雨伞。',
      '<option>直接问她今天早上有没有见过文穗</option>',
      '<option>观察便利店环境</option>',
    ].join('\n');

    expect(removeUngroundedNarrativeLines(emptyAuthority, candidate)).toBe([
      '对话|旁白|calm|你收起雨伞。',
      '<option>观察便利店环境</option>',
    ].join('\n'));
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

  it('allows habitual visits when fixed background history authorizes them', () => {
    expect(reviewNarrativeDeterministically({
      ...emptyAuthority,
      authorizedBackgroundFacts: [{
        factId: 'bg:supermarket-regulars',
        text: '便利店是住处附近最近、常去的店；陈慧慧长期见过玩家与文穗，两人经常同行。',
        characterIds: ['player', 'fumi', 'chen-huihui'],
        locationIds: ['supermarket'],
        level: 'fixed', privacy: 'common', timeScope: 'pre-game', source: 'author', createdTurn: 0,
      }],
    }, '陈慧慧|“以前文穗不是经常跟你一起来吗？”')).toEqual([]);
  });
});
