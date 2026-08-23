import { describe, expect, it } from 'vitest';
import {
  removeUngroundedNarrativeLines,
  reviewNarrativeAgainstWriterPacket,
  reviewNarrativeDeterministically,
} from './narrative-review';
import type { WriterPacket } from './types';

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

  it('allows open questions and summaries that explicitly say no history was learned', () => {
    expect(reviewNarrativeDeterministically(
      emptyAuthority,
      '<option>询问陈慧慧今早是否见过文穗</option>',
    )).toEqual([]);
    expect(reviewNarrativeDeterministically(
      emptyAuthority,
      '<sum>玩家询问文穗去向，但未提供今早行踪信息。</sum>',
    )).toEqual([]);
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
      '<option>直接问她今天早上有没有见过文穗</option>',
      '<option>观察便利店环境</option>',
    ].join('\n'));
  });

  it('removes invented evidence details from dialogue and options', () => {
    const candidate = [
      '对话|陈慧慧|calm|“我、我没见过……你要看看这个文件夹吗？”',
      '对话|旁白|calm|冷气从通风口吹下来。',
      '<option>检查收银台旁的文件夹</option>',
      '<option>询问她今天有没有见过文穗</option>',
    ].join('\n');

    expect(removeUngroundedNarrativeLines(emptyAuthority, candidate)).toBe([
      '对话|旁白|calm|冷气从通风口吹下来。',
      '<option>询问她今天有没有见过文穗</option>',
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

  it('drops narrative critic false-positives for lies-about denials and authorized confirmation', async () => {
    const packet = {
      authorizedFacts: [{
        id: 'a-murder-staged-fall',
        level: 'confirmation',
        text: '楼梯扶手上的擦痕与已知线索闭合：这是伪装成意外的推落。',
        delivery: 'narration',
      }],
      playerKnownFacts: [],
    } as unknown as WriterPacket;
    const narrative = '<maintext>旁白|楼梯扶手上的擦痕与已知线索闭合：这是伪装成意外的推落。周德明只说记不清。</maintext>';

    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null,
      packet,
      narrative,
      complete: async () => JSON.stringify({
        approved: false,
        violations: [
          {
            code: 'npc-knowledge-violation',
            message: 'old-man stance 为 lies-about，但未体现其主动撒谎。',
          },
          {
            code: 'unknown-fact',
            factId: 'a-murder-staged-fall',
            message: 'premature-confirmation：把已授权 confirmation 判为越权。',
          },
          {
            code: 'unknown-fact',
            message: '正文出现未授权时间线。',
          },
        ],
        corrections: ['lies-about 角色必须主动撒谎。', '删除确认。', '删除未授权时间线。'],
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toEqual([
      expect.objectContaining({ code: 'unknown-fact', message: '正文出现未授权时间线。' }),
    ]);
    expect(review.corrections).toContain('删除未授权时间线。');
    expect(review.corrections).not.toContain('lies-about 角色必须主动撒谎。');
  });

  it('approves when the narrative critic only reports authorized-confirmation false positives', async () => {
    const packet = {
      authorizedFacts: [{
        id: 'a-murder-staged-fall',
        level: 'confirmation',
        text: '这是伪装成意外的推落。',
        delivery: 'narration',
      }],
      playerKnownFacts: [],
    } as unknown as WriterPacket;

    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null,
      packet,
      narrative: '<maintext>旁白|这是伪装成意外的推落。</maintext>',
      complete: async () => JSON.stringify({
        approved: false,
        violations: [{
          code: 'unknown-fact',
          factId: 'a-murder-staged-fall',
          message: '未提供任何新增证据，把已授权 confirmation 判为越权。',
        }],
        corrections: ['推迟至后续回合。'],
      }),
    });

    expect(review).toEqual({ approved: true, violations: [], corrections: [] });
  });
});
