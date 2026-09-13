import { describe, expect, it } from 'vitest';
import {
  buildAssertionSources,
  extractNarrativeFields,
  validateAssertionAudit,
  type AssertionAudit,
  type AssertionSource,
} from './fact-assertion-review';
import type { WriterPacket } from './types';

const deliveryFields = { maintext: '店员说清晨六点半前后有白色配送车送面包牛奶。' };
const publicMessageSources: AssertionSource[] = [{
  id: 'public:message',
  kind: 'public-event',
  text: '06:50文穗发消息说今天不去学校。',
}];

function supportedAudit(
  field: string,
  quote: string,
  sourceId: string,
  sourceQuote: string,
): AssertionAudit {
  return {
    reviewedFields: [field],
    assertions: [{
      field,
      quote,
      proposition: quote,
      status: 'supported',
      citations: [{ sourceId, quote: sourceQuote }],
      reason: '来源直接支持该断言。',
    }],
  };
}

describe('validateAssertionAudit', () => {
  it('does not authorize a delivery timeline from an unrelated time source', () => {
    const result = validateAssertionAudit({
      reviewedFields: ['maintext'],
      assertions: [{
        field: 'maintext',
        quote: deliveryFields.maintext,
        proposition: '06:30配送车辆到过便利店',
        status: 'unsupported',
        citations: [],
        reason: '无配送事件来源',
      }],
    }, publicMessageSources, deliveryFields);

    expect(result.approved).toBe(false);
  });

  it('rejects a real source id with an invented source quote', () => {
    const result = validateAssertionAudit({
      reviewedFields: ['maintext'],
      assertions: [{
        field: 'maintext',
        quote: deliveryFields.maintext,
        proposition: '配送车来访',
        status: 'supported',
        citations: [{ sourceId: 'public:message', quote: '六点半配送车' }],
        reason: 'claimed source',
      }],
    }, publicMessageSources, deliveryFields);

    expect(result.approved).toBe(false);
  });

  it('accepts a structurally complete supported assertion with an exact source span', () => {
    const fields = { maintext: '她今早发消息说今天不去学校。' };
    const audit = supportedAudit('maintext', fields.maintext, 'public:message', '文穗发消息说今天不去学校');

    expect(validateAssertionAudit(audit, publicMessageSources, fields)).toEqual({
      approved: true,
      violations: [],
      corrections: [],
      assertionAudit: audit,
    });
  });

  it.each([
    ['unsupported', '没有登录记录。'],
    ['contradicted', '文穗已经到校。'],
  ] as const)('blocks a %s assertion even when its field and quote are complete', (status, quote) => {
    const fields = { maintext: quote };
    const result = validateAssertionAudit({
      reviewedFields: ['maintext'],
      assertions: [{ field: 'maintext', quote, proposition: quote, status, citations: [], reason: '无支持来源。' }],
    }, publicMessageSources, fields);

    expect(result.approved).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: status === 'unsupported' ? 'unsupported-assertion' : 'contradicted-assertion' }),
    ]));
  });

  it.each([
    ['question', '她今天到过学校吗？'],
    ['hypothesis', '也许她只是临时改变了安排。'],
    ['ordinary-present', '店员把一杯水递给你。'],
  ] as const)('allows a complete %s assertion without a factual citation', (status, quote) => {
    const fields = { maintext: quote };
    const audit: AssertionAudit = {
      reviewedFields: ['maintext'],
      assertions: [{ field: 'maintext', quote, proposition: quote, status, citations: [], reason: '未陈述新的案件事实。' }],
    };

    expect(validateAssertionAudit(audit, [], fields).approved).toBe(true);
  });

  it.each([
    {
      name: 'missing reviewed field',
      audit: { reviewedFields: ['maintext'], assertions: [
        { field: 'maintext', quote: '当下对话。', proposition: '当下对话', status: 'ordinary-present', citations: [], reason: '当下动作' },
      ] },
      fields: { maintext: '当下对话。', 'option:0': '去学校核实。' },
    },
    {
      name: 'empty assertions for material prose',
      audit: { reviewedFields: ['maintext'], assertions: [] },
      fields: { maintext: '雨仍在下。' },
    },
    {
      name: 'quote outside its declared field',
      audit: { reviewedFields: ['maintext'], assertions: [
        { field: 'maintext', quote: '别处的句子', proposition: '别处的句子', status: 'ordinary-present', citations: [], reason: '错误引文' },
      ] },
      fields: { maintext: '雨仍在下。' },
    },
    {
      name: 'supported assertion without citations',
      audit: { reviewedFields: ['maintext'], assertions: [
        { field: 'maintext', quote: '她说今天不去学校。', proposition: '她发过消息', status: 'supported', citations: [], reason: '缺少引用' },
      ] },
      fields: { maintext: '她说今天不去学校。' },
    },
  ])('rejects an incomplete audit: $name', ({ audit, fields }) => {
    expect(validateAssertionAudit(audit as AssertionAudit, publicMessageSources, fields).approved).toBe(false);
  });

  it('rejects a dialogue fact delivered by a different speaker', () => {
    const fields = { maintext: '对话|old-man|calm|文穗今早买过牛奶。' };
    const sources: AssertionSource[] = [{
      id: 'fact:purchase', kind: 'fact', text: '文穗今早买过牛奶。', speakerIds: ['chen-huihui'],
    }];

    expect(validateAssertionAudit(
      supportedAudit('maintext', fields.maintext, 'fact:purchase', '文穗今早买过牛奶。'),
      sources,
      fields,
    ).approved).toBe(false);
  });
});

describe('extractNarrativeFields', () => {
  it('treats an untagged review candidate as playable maintext', () => {
    expect(extractNarrativeFields('对话|旁白|calm|雨还在下。')).toEqual({
      maintext: '对话|旁白|calm|雨还在下。',
    });
  });

  it('extracts all playable and derivative fields individually', () => {
    const fields = extractNarrativeFields([
      '<maintext>对话|旁白|calm|你接过水。</maintext>',
      '<option>问她今早去了哪里\n检查门口</option>',
      '<sum>你接过水。</sum>',
      '<hint>也许可以去学校。</hint>',
      '<observe>柜台上有水杯。</observe>',
      '<investigate>核对考勤|老师|现实|30分钟|10|0</investigate>',
      '<action>拨打电话|现实|10分钟|1|0</action>',
    ].join('\n'));

    expect(fields).toEqual({
      maintext: '对话|旁白|calm|你接过水。',
      'option:0': '问她今早去了哪里',
      'option:1': '检查门口',
      summary: '你接过水。',
      hint: '也许可以去学校。',
      observation: '柜台上有水杯。',
      'investigate:0': '核对考勤|老师|现实|30分钟|10|0',
      'action:0': '拨打电话|现实|10分钟|1|0',
    });
  });

  it('removes nested checklist blocks from the playable maintext projection', () => {
    const fields = extractNarrativeFields([
      '<maintext>',
      '对话|旁白|calm|你在柜台前停下。',
      '<observe>你以前总买无糖咖啡。</observe>',
      '<investigate>检查旧收据|无|现实|20分钟|3|0</investigate>',
      '</maintext>',
      '<option>离开</option>',
      '<sum>停留片刻。</sum>',
    ].join('\n'));

    expect(fields.maintext).toBe('对话|旁白|calm|你在柜台前停下。');
    expect(fields.observation).toBe('你以前总买无糖咖啡。');
    expect(fields['investigate:0']).toContain('检查旧收据');
  });
});

describe('buildAssertionSources', () => {
  const packet = {
    authorizedFacts: [{ id: 'fact-a', level: 'clue', text: '授权线索。', delivery: 'dialogue', speakerId: 'npc-a' }],
    playerKnownFacts: [{ id: 'fact-b', route: 'shared', kind: 'event', level: 'hint', text: '已知事实。' }],
    authorizedKnowledgeEvents: [{ eventId: 'meet:npc-a', evidence: '玩家已经见过npc-a。' }],
    authorizedBackgroundFacts: [{
      factId: 'bg:known', text: '两人以前常来。', characterIds: ['npc-a'], locationIds: ['shop'],
      level: 'fixed', privacy: 'common', timeScope: 'pre-game', source: 'author', createdTurn: 0,
    }],
    approvedBackgroundFactProposals: [{
      proposalId: 'coffee', text: '玩家以前常买无糖咖啡。', characterIds: ['player', 'npc-a'],
      locationIds: ['shop'], knowerIds: ['npc-a'], evidenceText: '你以前总买无糖咖啡。',
    }],
    authorizedActionOutcomes: [
      { id: 'call:fumi', text: '这次拨号没有人接听。' },
      { id: 'death-news:16:00', text: '电话明确告知文穗已经死亡。' },
    ],
    continuityContext: {
      publicContinuity: [{ id: 'opening-message', text: '06:50文穗说今天不去学校。' }],
    },
  } as unknown as WriterPacket;

  it('projects each approved public source type without canonical truth', () => {
    const sources = buildAssertionSources(packet, { maintext: '对话|npc-a|calm|你以前总买无糖咖啡。' });

    expect(sources.map(source => source.kind)).toEqual(expect.arrayContaining([
      'fact', 'public-event', 'background', 'accepted-event', 'action-outcome',
    ]));
    expect(sources).toContainEqual(expect.objectContaining({
      id: 'fact:fact-a:clue', factId: 'fact-a', level: 'clue', speakerIds: ['npc-a'],
    }));
    expect(sources).toContainEqual(expect.objectContaining({
      id: 'action-outcome:death-news:16:00', text: '电话明确告知文穗已经死亡。',
    }));
    expect(JSON.stringify(sources)).not.toContain('canonicalTruth');
  });

  it.each([
    ['absent evidence', {}],
    ['mismatched evidence', { maintext: '对话|npc-a|calm|你以前常买咖啡。' }],
    ['option-only evidence', { maintext: '对话|旁白|calm|你看着柜台。', 'option:0': '你以前总买无糖咖啡。' }],
    ['nested observation evidence', extractNarrativeFields('<maintext>对话|旁白|calm|你看着柜台。\n<observe>你以前总买无糖咖啡。</observe></maintext>')],
  ])('does not activate a soft proposal from %s', (_name, fields) => {
    expect(buildAssertionSources(packet, fields).some(source => source.id === 'background-proposal:coffee')).toBe(false);
  });

  it('activates a legal approved soft proposal only from exact playable maintext evidence', () => {
    const sources = buildAssertionSources(packet, { maintext: '对话|npc-a|calm|你以前总买无糖咖啡。' });

    expect(sources).toContainEqual(expect.objectContaining({
      id: 'background-proposal:coffee',
      kind: 'background',
      requiredEvidenceText: '你以前总买无糖咖啡。',
      speakerIds: ['npc-a'],
    }));
  });
});
