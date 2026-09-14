import { describe, expect, it } from 'vitest';
import {
  combineNarrativeReviews,
  removeUngroundedNarrativeLines,
  reviewNarrativeAgainstWriterPacket,
  reviewNarrativeDeterministically,
} from './narrative-review';
import { buildAssertionSources, extractNarrativeFields } from './fact-assertion-review';
import { FIXED_BACKGROUND_FACTS, reviewBackgroundFactProposal } from '../../data/backgroundHistory';
import type { WriterPacket } from './types';

const emptyAuthority = { authorizedFacts: [], playerKnownFacts: [] };
const disclosedMorningMessage = {
  ...emptyAuthority,
  continuityContext: { publicContinuity: [{ id: 'opening-message-0650', text: '今早06:50文穗发来聊天消息：“我先出门了，今天不去学校。晚饭不用等我，回来再跟你说。”这是她自述的安排，尚未核实学校请假或她的去向。' }] },
};

const completeEmptyAuthority = {
  authorizedFacts: [],
  playerKnownFacts: [],
  authorizedKnowledgeEvents: [],
  authorizedBackgroundFacts: [],
  approvedBackgroundFactProposals: [],
} as unknown as WriterPacket;

const emptyContinuityAudit = { reviewed: true as const, disclosures: [], beliefs: [], commitments: [] };

function ordinaryAudit(field: string, quote: string, status: 'question' | 'hypothesis' | 'ordinary-present') {
  return {
    reviewedFields: [field],
    assertions: [{ field, quote, proposition: quote, status, citations: [], reason: '没有陈述新的案件事实。' }],
  };
}

describe('deterministic final narrative review', () => {
  it('keeps the exact fact-review continuity effects when style review is combined', () => {
    const continuityEffects = {
      candidateId: 'candidate:deadbeef:10', cognitionDeltas: [], disclosures: [], commitmentOperations: [],
    };
    const factReview = {
      approved: true, violations: [], corrections: [],
      assertionAudit: ordinaryAudit('maintext', '雨还在下。', 'ordinary-present'),
      continuityAudit: emptyContinuityAudit,
      continuityEffects,
    };

    expect(combineNarrativeReviews([
      factReview,
      { approved: true, violations: [], corrections: [] },
    ])).toMatchObject({
      approved: true,
      assertionAudit: factReview.assertionAudit,
      continuityAudit: emptyContinuityAudit,
      continuityEffects,
    });
  });

  it('rejects a new live audit that omits the explicit continuity envelope', async () => {
    const assertionAudit = ordinaryAudit('maintext', '雨还在下。', 'ordinary-present');
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority,
      narrative: '<maintext>对话|旁白|calm|雨还在下。</maintext>',
      complete: async () => JSON.stringify({ approved: true, violations: [], corrections: [], assertionAudit }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'incomplete-continuity-audit' }));
    expect(review.continuityEffects).toBeUndefined();
  });

  it('rejects a malformed live continuity envelope without treating missing arrays as empty', async () => {
    const assertionAudit = ordinaryAudit('maintext', '雨还在下。', 'ordinary-present');
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority,
      narrative: '<maintext>对话|旁白|calm|雨还在下。</maintext>',
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit,
        continuityAudit: { reviewed: true, disclosures: [] },
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'incomplete-continuity-audit' }));
    expect(review.continuityEffects).toBeUndefined();
  });

  it('sends numbered accepted-scene evidence without private canonical bindings', async () => {
    let request = '';
    const assertionAudit = ordinaryAudit('maintext', '我叫小林。', 'ordinary-present');
    const continuityAudit = emptyContinuityAudit;
    await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority,
      narrative: '<maintext>对话|玩家|calm|我叫小林。</maintext>',
      scene: { lines: [{ speaker: '玩家', emotion: 'calm', text: '我叫小林。', background: 'school-day' }] },
      canonicalPropositionBySourceId: { 'fact:F001:clue': 'fact:a-secret-canonical-id' },
      complete: async messages => {
        request = messages[1]?.content ?? '';
        return JSON.stringify({ approved: true, violations: [], corrections: [], assertionAudit, continuityAudit });
      },
    });

    expect(request).toContain('[CharacterContinuityEvidence]');
    expect(request).toContain('"lineIndex":0');
    expect(request).toContain('"speakerId":"player"');
    expect(request).toContain('"text":"我叫小林。"');
    expect(request).toContain('"background":"school-day"');
    expect(request).toContain('background 不同表示已切换渲染场景');
    expect(request).toContain('否定、尚未履行或仅到达约定地点');
    expect(request).toContain('未来时的承诺或打算');
    expect(request).toContain('完整时间表达');
    expect(request).toContain('否定或无关命题的反应');
    expect(request).toContain('不合理或没有道理');
    expect(request).toContain('拒绝或正要执行');
    expect(request).not.toContain('a-secret-canonical-id');
  });

  it('rejects continuity learning from an auxiliary checklist review', async () => {
    const assertionAudit = ordinaryAudit('observation', '陈慧慧听见了。', 'ordinary-present');
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority,
      narrative: '<observe>陈慧慧听见了。</observe>',
      continuityMode: 'auxiliary',
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit,
        continuityAudit: {
          reviewed: true,
          disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '听见了', listenerIds: ['chen-huihui'], audienceEvidence: [] }],
          beliefs: [], commitments: [],
        },
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'auxiliary-continuity-effect' }));
    expect(review.continuityEffects).toBeUndefined();
  });

  it('validates an exact player disclosure for NPC A without granting permitted NPC B', async () => {
    const packet = {
      ...completeEmptyAuthority,
      playerKnownFacts: [{ id: 'F001', route: 'shared', kind: 'event', level: 'hint', text: '文穗说她今天不去学校。' }],
    } as WriterPacket;
    const narrative = [
      '<maintext>',
      '对话|{{user}}|calm|文穗说她今天不去学校。',
      '对话|陈慧慧|calm|我听见了。',
      '</maintext>',
    ].join('\n');
    const assertionAudit = {
      reviewedFields: ['maintext'],
      assertions: [
        { field: 'maintext', quote: '文穗说她今天不去学校。', proposition: '文穗自述今天不去学校', status: 'supported',
          citations: [{ sourceId: 'known-fact:F001:hint', quote: '文穗说她今天不去学校。' }], reason: '玩家可复述已知事实。' },
        { field: 'maintext', quote: '我听见了。', proposition: '陈慧慧回应', status: 'ordinary-present', citations: [], reason: '当下回应。' },
      ],
    };
    const continuityAudit = {
      reviewed: true,
      disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '文穗说她今天不去学校。',
        listenerIds: ['chen-huihui'], audienceEvidence: [{ lineIndex: 1, quote: '我听见了。' }] }],
      beliefs: [], commitments: [],
    };
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet, narrative,
      possibleAudienceIds: ['chen-huihui', 'old-man'],
      canonicalPropositionBySourceId: { 'known-fact:F001:hint': 'fact:shared-opening-message' },
      complete: async () => JSON.stringify({ approved: true, violations: [], corrections: [], assertionAudit, continuityAudit }),
    });

    expect(review.approved).toBe(true);
    expect(review.continuityEffects?.cognitionDeltas).toEqual([
      expect.objectContaining({ observerId: 'chen-huihui', propositionId: 'fact:shared-opening-message', status: 'heard' }),
    ]);
    expect(review.continuityEffects?.cognitionDeltas.some(delta => delta.observerId === 'old-man')).toBe(false);
  });

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

  it('does not let an unrelated authorized fact pardon an invented evidence category', () => {
    const violations = reviewNarrativeDeterministically({
      authorizedFacts: [{
        id: 'shared-apron-missing', level: 'hint', text: '衣柜里少了一条围裙。', delivery: 'object',
      }],
      playerKnownFacts: [],
    }, '旁白|收银台下的监控记录已经被覆盖。');

    expect(violations).toEqual([
      expect.objectContaining({ code: 'ungrounded-evidence-detail' }),
    ]);
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
        return JSON.stringify({
          approved: true,
          violations: [],
          corrections: [],
          continuityAudit: emptyContinuityAudit,
          assertionAudit: {
            reviewedFields: ['maintext'],
            assertions: [{
              field: 'maintext', quote: narrative, proposition: '06:50文穗发来消息', status: 'supported',
              citations: [{ sourceId: 'public-event:opening-message', quote: '今早06:50文穗发来消息。' }],
              reason: '公开开局事件直接支持。',
            }],
          },
        });
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

  it('allows the fixed supermarket history as a limited second-person paraphrase', () => {
    const supermarketRegulars = FIXED_BACKGROUND_FACTS.find(
      fact => fact.factId === 'bg:supermarket-regulars',
    )!;
    expect(reviewNarrativeDeterministically({
      ...emptyAuthority,
      authorizedBackgroundFacts: [supermarketRegulars],
    }, '<maintext>对话|chen-huihui|calm|你以前经常来这里。</maintext>')).toEqual([]);
  });

  it('allows an approved soft-history proposal only after exact playable evidence activates its source', () => {
    const proposal = {
      proposalId: 'coffee', text: '玩家以前常来买无糖咖啡。',
      characterIds: ['player', 'chen-huihui'], locationIds: ['supermarket'],
      knowerIds: ['chen-huihui'], evidenceText: '你以前常来买无糖咖啡。',
    };
    const narrative = '<maintext>对话|chen-huihui|calm|你以前常来买无糖咖啡。</maintext>';
    const packet = {
      ...completeEmptyAuthority,
      approvedBackgroundFactProposals: [proposal],
    };

    expect(reviewBackgroundFactProposal(proposal).approved).toBe(true);
    expect(buildAssertionSources(packet, extractNarrativeFields(narrative)).filter(
      source => source.id === 'background-proposal:coffee',
    )).toHaveLength(1);
    expect(reviewNarrativeDeterministically(packet, narrative)).toEqual([]);
  });

  it.each([
    [
      'absent proposal',
      completeEmptyAuthority,
      '<maintext>对话|chen-huihui|calm|你以前常来买无糖咖啡。</maintext>',
    ],
    [
      'mismatched evidence',
      {
        ...completeEmptyAuthority,
        approvedBackgroundFactProposals: [{
          proposalId: 'coffee', text: '玩家以前常来买无糖咖啡。', characterIds: ['player', 'chen-huihui'],
          locationIds: ['supermarket'], knowerIds: ['chen-huihui'], evidenceText: '你以前常来买无糖咖啡。',
        }],
      },
      '<maintext>对话|chen-huihui|calm|你以前常来买咖啡。</maintext>',
    ],
    [
      'option-only evidence',
      {
        ...completeEmptyAuthority,
        approvedBackgroundFactProposals: [{
          proposalId: 'coffee', text: '玩家以前常来买无糖咖啡。', characterIds: ['player', 'chen-huihui'],
          locationIds: ['supermarket'], knowerIds: ['chen-huihui'], evidenceText: '你以前常来买无糖咖啡。',
        }],
      },
      '<maintext>对话|旁白|calm|你看着柜台。</maintext><option>你以前常来买无糖咖啡。</option>',
    ],
    [
      'nested observation evidence',
      {
        ...completeEmptyAuthority,
        approvedBackgroundFactProposals: [{
          proposalId: 'coffee', text: '玩家以前常来买无糖咖啡。', characterIds: ['player', 'chen-huihui'],
          locationIds: ['supermarket'], knowerIds: ['chen-huihui'], evidenceText: '你以前常来买无糖咖啡。',
        }],
      },
      '<maintext>对话|旁白|calm|你看着柜台。\n<observe>你以前常来买无糖咖啡。</observe></maintext>',
    ],
  ])('does not let %s activate soft history during the deterministic precheck', (_name, packet, narrative) => {
    expect(reviewNarrativeDeterministically(packet, narrative)).not.toEqual([]);
  });

  it('does not let an authorized confirmation pardon an unrelated critic violation', async () => {
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
        continuityAudit: emptyContinuityAudit,
        assertionAudit: {
          reviewedFields: ['maintext'],
          assertions: [{
            field: 'maintext',
            quote: '楼梯扶手上的擦痕与已知线索闭合：这是伪装成意外的推落。',
            proposition: '这是伪装成意外的推落',
            status: 'supported',
            citations: [{
              sourceId: 'fact:a-murder-staged-fall:confirmation',
              quote: '这是伪装成意外的推落',
            }],
            reason: '逐项匹配授权确认。',
          }],
        },
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown-fact', message: '正文出现未授权时间线。' }),
      expect.objectContaining({ code: 'unknown-fact', message: expect.stringContaining('premature-confirmation') }),
    ]));
    expect(review.corrections).toContain('删除未授权时间线。');
    expect(review.corrections).not.toContain('lies-about 角色必须主动撒谎。');
  });

  it('approves an authorized confirmation through an exact assertion citation', async () => {
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
        approved: true,
        violations: [],
        corrections: [],
        continuityAudit: emptyContinuityAudit,
        assertionAudit: {
          reviewedFields: ['maintext'],
          assertions: [{
            field: 'maintext', quote: '旁白|这是伪装成意外的推落。', proposition: '这是伪装成意外的推落',
            status: 'supported',
            citations: [{ sourceId: 'fact:a-murder-staged-fall:confirmation', quote: '这是伪装成意外的推落。' }],
            reason: '授权 confirmation 逐项支持。',
          }],
        },
      }),
    });

    expect(review.approved).toBe(true);
    expect(review.assertionAudit?.assertions).toHaveLength(1);
  });

  it('rejects a blanket live approval with no assertion audit', async () => {
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null,
      packet: completeEmptyAuthority,
      narrative: '<maintext>对话|旁白|calm|雨还在下。</maintext>',
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], continuityAudit: emptyContinuityAudit,
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'incomplete-assertion-audit' }));
  });

  it('rejects a live audit that covers rain but omits a second material sentence', async () => {
    const narrative = [
      '<maintext>',
      '对话|旁白|calm|雨还在下。',
      '对话|旁白|calm|她没有到校。',
      '</maintext>',
    ].join('\n');
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority, narrative,
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [],
        continuityAudit: emptyContinuityAudit,
        assertionAudit: ordinaryAudit('maintext', '雨还在下。', 'ordinary-present'),
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'incomplete-assertion-audit' }));
  });

  it.each([
    ['ordinary handover', '<maintext>对话|店员|calm|她把一杯水递给你。</maintext>',
      ordinaryAudit('maintext', '她把一杯水递给你。', 'ordinary-present')],
    ['explicit hypothesis', '<maintext>对话|旁白|calm|也许她只是临时改变了安排。</maintext>',
      ordinaryAudit('maintext', '也许她只是临时改变了安排。', 'hypothesis')],
    ['open question', '<maintext>对话|旁白|calm|她今天到过学校吗？</maintext>',
      ordinaryAudit('maintext', '她今天到过学校吗？', 'question')],
  ])('approves a complete permissive semantic audit: %s', async (_name, narrative, assertionAudit) => {
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority, narrative,
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit, continuityAudit: emptyContinuityAudit,
      }),
    });

    expect(review.approved).toBe(true);
  });

  it('approves an actual no-reply outcome without turning it into a login or whereabouts claim', async () => {
    const packet = {
      ...completeEmptyAuthority,
      authorizedActionOutcomes: [{ id: 'call:fumi', text: '这次拨号持续响铃，但没有人接听。' }],
    } as WriterPacket;
    const narrative = '<maintext>对话|旁白|calm|这次拨号没有人接听。</maintext>';
    const assertionAudit = {
      reviewedFields: ['maintext'],
      assertions: [{
        field: 'maintext', quote: '这次拨号没有人接听。', proposition: '本次拨号无人接听', status: 'supported',
        citations: [{ sourceId: 'action-outcome:call:fumi', quote: '没有人接听' }], reason: '本次行动结果直接支持。',
      }],
    };

    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet, narrative,
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit, continuityAudit: emptyContinuityAudit,
      }),
    });
    expect(review.approved).toBe(true);
  });

  it.each([
    ['no login record', '没有她的登录记录。', '没有登录记录'],
    ['negative attendance', '她今天没有到校。', '她未到校'],
    ['note-time drift', '那张没有日期的便条写于06:50。', '便条写于06:50'],
  ])('blocks an unsupported semantic assertion: %s', async (_name, claim, proposition) => {
    const narrative = `<maintext>对话|旁白|calm|${claim}</maintext>`;
    const assertionAudit = {
      reviewedFields: ['maintext'],
      assertions: [{
        field: 'maintext', quote: claim, proposition, status: 'unsupported',
        citations: [{ sourceId: 'public-event:opening-message-0650', quote: '06:50' }],
        reason: '消息时间不支持这项命题。',
      }],
    };
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: disclosedMorningMessage as unknown as WriterPacket, narrative,
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit, continuityAudit: emptyContinuityAudit,
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations).toContainEqual(expect.objectContaining({ code: 'unsupported-assertion' }));
  });

  it('blocks unsupported claims found only in option, summary, observation and checklist fields', async () => {
    const narrative = [
      '<maintext>对话|旁白|calm|雨还在下。</maintext>',
      '<option>沿她已经走过的河岸追赶</option>',
      '<sum>目标已经前往机场。</sum>',
      '<observe>桌上放着一把属于她的储物柜钥匙。</observe>',
      '<investigate>检查她租住的秘密仓库|无|现实|30分钟|5|0</investigate>',
      '<action>按她留下的密码打开储物柜|现实|10分钟|1|0</action>',
    ].join('\n');
    const assertions = [
      ['maintext', '雨还在下。', 'ordinary-present'],
      ['option:0', '沿她已经走过的河岸追赶', 'unsupported'],
      ['summary', '目标已经前往机场。', 'unsupported'],
      ['observation', '桌上放着一把属于她的储物柜钥匙。', 'unsupported'],
      ['investigate:0', '检查她租住的秘密仓库|无|现实|30分钟|5|0', 'unsupported'],
      ['action:0', '按她留下的密码打开储物柜|现实|10分钟|1|0', 'unsupported'],
    ].map(([field, quote, status]) => ({
      field, quote, proposition: quote, status, citations: [], reason: status === 'unsupported' ? '没有来源。' : '当下天气。',
    }));
    const assertionAudit = {
      reviewedFields: ['maintext', 'option:0', 'summary', 'observation', 'investigate:0', 'action:0'],
      assertions,
    };
    const review = await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority, narrative,
      complete: async () => JSON.stringify({
        approved: true, violations: [], corrections: [], assertionAudit, continuityAudit: emptyContinuityAudit,
      }),
    });

    expect(review.approved).toBe(false);
    expect(review.violations.filter(item => item.code === 'unsupported-assertion')).toHaveLength(5);
  });

  it('requests the narrative assertion schema rather than the plan fact-review schema', async () => {
    let responseName = '';
    let request = '';
    const assertionAudit = ordinaryAudit('maintext', '雨还在下。', 'ordinary-present');
    await reviewNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      packet: completeEmptyAuthority,
      narrative: '<maintext>对话|旁白|calm|雨还在下。</maintext>',
      complete: async (messages, options) => {
        request = messages[1]?.content ?? '';
        const format = options?.responseFormat;
        responseName = format?.type === 'json_schema' ? format.json_schema.name : '';
        return JSON.stringify({
          approved: true, violations: [], corrections: [], assertionAudit, continuityAudit: emptyContinuityAudit,
        });
      },
    });

    expect(responseName).toBe('narrative_fact_review');
    expect(request).toContain('每个可见句子都必须由 assertion.quote 覆盖');
  });
});
