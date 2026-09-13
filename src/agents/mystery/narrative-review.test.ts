import { describe, expect, it } from 'vitest';
import {
  removeUngroundedNarrativeLines,
  reviewNarrativeAgainstWriterPacket,
  reviewNarrativeDeterministically,
} from './narrative-review';
import type { WriterPacket } from './types';

const emptyAuthority = { authorizedFacts: [], playerKnownFacts: [] };
const disclosedMorningMessage = {
  ...emptyAuthority,
  continuityContext: { publicContinuity: [{ id: 'opening-message-0650', text: '今早06:50文穗发来聊天消息：“我先出门了，今天不去学校。晚饭不用等我，回来再跟你说。”这是她自述的安排，尚未核实学校请假或她的去向。' }] },
};

describe('deterministic final narrative review', () => {
  it.each([
    '她今早发消息说今天不去学校，电话打不通，衣柜里有一处不自然的空缺。',
    '她六点五十说今天不去学校。',
  ])('leaves a limited paraphrase of the disclosed message to semantic review: %s', narrative => {
    expect(reviewNarrativeDeterministically(disclosedMorningMessage, narrative)).toEqual([]);
  });

  it.each([
    '她今早发消息说今天不去学校，所以确认她今早未到校。',
    '她今早发消息说今天不去学校，所以确认她未到校。',
    '她今早发消息说今天不去学校，文穗今早买了两瓶牛奶。',
    '她06:55发消息说今天不去学校。',
  ])('does not authorize added history beside the disclosed message: %s', narrative => {
    expect(reviewNarrativeDeterministically(disclosedMorningMessage, narrative)).not.toEqual([]);
  });

  it('reports the complete unsupported school conclusion and repairs its dependent scene chain', async () => {
    const narrative = '<sum>暴雨中走访灯织、便利店与学校，确认文穗今早未到校，回家时注意到衣柜里的空缺</sum>';
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null, packet: emptyAuthority as unknown as WriterPacket, narrative,
      complete: async () => { throw new Error('Explicit unsupported history must be rejected locally'); },
    });
    expect(review.approved).toBe(false);
    expect(review.violations[0].message).toContain(narrative);
    expect(review.corrections.join(' ')).toMatch(/门卫.*旁白.*hint.*sum/);
    expect(review.corrections.join(' ')).toMatch(/已批准.*plan.*错误/);
  });

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

  it('preserves the entire exchange for repair instead of dropping the answer', () => {
    const candidate = [
      '对话|陈慧慧|calm|“她今天早上来过。”',
      '对话|旁白|calm|你收起雨伞。',
      '<option>直接问她今天早上有没有见过文穗</option>',
      '<option>观察便利店环境</option>',
    ].join('\n');

    expect(removeUngroundedNarrativeLines(emptyAuthority, candidate)).toBe(candidate);
    expect(reviewNarrativeDeterministically(emptyAuthority, candidate)).not.toEqual([]);
  });

  it('preserves invented evidence and dependent options for a coherent full repair', () => {
    const candidate = [
      '对话|陈慧慧|calm|“我、我没见过……你要看看这个文件夹吗？”',
      '对话|旁白|calm|冷气从通风口吹下来。',
      '<option>检查收银台旁的文件夹</option>',
      '<option>询问她今天有没有见过文穗</option>',
    ].join('\n');

    expect(removeUngroundedNarrativeLines(emptyAuthority, candidate)).toBe(candidate);
    expect(reviewNarrativeDeterministically(emptyAuthority, candidate)).not.toEqual([]);
  });

  it('allows present-time service interaction and the authorized identity introduction', () => {
    expect(reviewNarrativeDeterministically(
      emptyAuthority,
      '店员|“欢、欢迎光临。”\n旁白|你认出这是附近便利店的店员陈慧慧。',
    )).toEqual([]);
    expect(reviewNarrativeDeterministically(emptyAuthority,
      '对话|旁白|calm|她现在接过钱，付款后把牛奶递给你。',
    )).toEqual([]);
  });

  it('allows a disclosed record in authorized background history', () => {
    expect(reviewNarrativeDeterministically({
      ...emptyAuthority,
      authorizedBackgroundFacts: [{
        factId: 'bg:receipt', text: '玩家保存着自己的旧收据。',
        characterIds: ['player'], locationIds: ['home'], level: 'fixed',
        privacy: 'common', timeScope: 'pre-game', source: 'author', createdTurn: 0,
      }],
    }, '旁白|玩家保存着自己的旧收据。')).toEqual([]);
  });

  it('sends disclosed opening continuity and the complete draft to the actual fact review request', async () => {
    const packet = {
      ...emptyAuthority,
      continuityContext: {
        clock: '08:20', publicContinuity: [{ id: 'opening-message', text: '今早06:50文穗发来消息。' }],
        recentHistory: ['你查看了那条消息。'], memory: ['记得约定。'],
      },
    } as unknown as WriterPacket;
    const narrative = '旁白|今早06:50文穗发来消息。';
    let request = '';
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null, packet, narrative,
      complete: async messages => {
        request = messages.map(message => message.content).join('\n');
        return JSON.stringify({ approved: true, violations: [], corrections: [] });
      },
    });
    expect(review.approved).toBe(true);
    const packetBlock = request.split('[WriterPacket]')[1]?.split('[Narrative]')[0].trim();
    expect(JSON.parse(packetBlock ?? '{}')).toEqual(packet);
    expect(request.split('[Narrative]')[1]?.trim()).toBe(narrative);
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
