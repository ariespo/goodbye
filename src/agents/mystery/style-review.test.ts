import { describe, expect, it } from 'vitest';
import {
  recentAcceptedNarratives,
  removeExactRepeatedLines,
  reviewNarrativeStyle,
  reviewProseDeterministically,
} from './style-review';

describe('narrative style continuity', () => {
  it('blocks an exact sentence repeated from a recent accepted turn', () => {
    const previous = '对话|旁白|calm|雨水沿着玻璃缓慢滑落，像一道没有愈合的伤口。';
    const current = '对话|旁白|calm|雨水沿着玻璃缓慢滑落，像一道没有愈合的伤口。';
    expect(reviewProseDeterministically(current, [previous])).toEqual([
      expect.objectContaining({ code: 'repeated-prose' }),
    ]);
  });

  it('preserves repeated dialogue for whole-scene repair', () => {
    const repeated = '对话|陈慧慧|calm|“C姐，今天真的只是一个人来啊……”';
    const current = `${repeated}\n对话|旁白|calm|你推开门，朝学校走去。`;

    expect(removeExactRepeatedLines(current, [repeated])).toBe(
      current,
    );
  });

  it('blocks a lightly rewritten near-duplicate', () => {
    const previous = '对话|旁白|calm|冷白色的灯光在她头顶轻轻闪了一下，照得脸色更加苍白。';
    const current = '对话|旁白|calm|冷白色灯光在她头顶轻轻闪了一下，映得她的脸色更加苍白。';
    expect(reviewProseDeterministically(current, [previous])).toEqual([
      expect.objectContaining({ code: 'repeated-prose' }),
    ]);
  });

  it('allows the same rainy setting when the sentence and narrative function change', () => {
    const previous = '对话|旁白|calm|雨点击打玻璃，屋里没有人说话。';
    const current = '对话|旁白|calm|你收起湿伞，把便利店门口让给刚进来的老人。';
    expect(reviewProseDeterministically(current, [previous])).toEqual([]);
  });

  it('does not block a repeated sentence that is mostly mandatory evidence', () => {
    const evidence = '陈慧慧明确说自己只是便利店的收银员。';
    const narrative = `对话|陈慧慧|calm|${evidence}`;
    expect(reviewProseDeterministically(narrative, [narrative], [evidence])).toEqual([]);
  });

  it('reads only accepted assistant maintext and respects the limit', () => {
    const messages = [
      { id: 'a1', role: 'assistant' as const, content: '<maintext>第一段</maintext>', timestamp: 1, variables: {} },
      { id: 'u1', role: 'user' as const, content: '继续', timestamp: 2, variables: {} },
      { id: 'a2', role: 'assistant' as const, content: '<maintext>第二段</maintext>', timestamp: 3, variables: {} },
      { id: 'a3', role: 'assistant' as const, content: '<maintext>第三段</maintext>', timestamp: 4, variables: {} },
    ];
    expect(recentAcceptedNarratives(messages, 2)).toEqual(['第二段', '第三段']);
  });

  it('does not block loosely similar imagery without substantial wording overlap', async () => {
    let criticPrompt = '';
    const review = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null,
      narrative: '对话|旁白|calm|水痕把窗外的灯拉成细线。',
      recentNarratives: ['对话|旁白|calm|雨水把玻璃后的霓虹揉成模糊色块。'],
      complete: async messages => {
        criticPrompt = messages.map(message => message.content).join('\n');
        return JSON.stringify({
          approved: false,
          violations: [{ code: 'repeated-imagery', message: '连续用雨水扭曲窗外灯光表达相同的不安。', oldQuote: '雨水把玻璃后的霓虹揉成模糊色块。', candidateQuote: '水痕把窗外的灯拉成细线。' }],
          corrections: ['改用人物选择或空间距离承载不安。'],
        });
      },
    });

    expect(criticPrompt).toContain('雨水把玻璃后的霓虹');
    expect(criticPrompt).toContain('水痕把窗外的灯');
    expect(review).toEqual(expect.objectContaining({
      approved: true,
      violations: [],
    }));
  });

  it('skips the semantic critic when there is no accepted earlier narrative', async () => {
    let called = false;
    const review = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' },
      preset: null,
      narrative: '对话|旁白|calm|你推开便利店的玻璃门。',
      recentNarratives: [],
      complete: async () => {
        called = true;
        return '{}';
      },
    });

    expect(called).toBe(false);
    expect(review.approved).toBe(true);
  });
});


describe('grounded style decisions', () => {
  const narrative = '对话|陈慧慧|calm|她招呼你的时候嘴角一直往上提着，问你今天吃过早餐没有。';
  const old = '对话|旁白|calm|饭盒放在厨房水槽边，盖子和盒身分开放着。';

  it.each([
    { oldQuote: '她招呼你的时候嘴角一直往上提着', candidateQuote: '她招呼你的时候嘴角一直往上提着' },
    { oldQuote: '完全虚构的旧文描写从未出现', candidateQuote: '她招呼你的时候嘴角一直往上提着' },
    { oldQuote: '饭盒放在厨房水槽边', candidateQuote: '完全虚构的候选描写从未出现' },
    {},
  ])('ignores ungrounded semantic rejection: %j', async evidence => {
    const result = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      narrative, recentNarratives: [old],
      complete: async () => JSON.stringify({ approved: false,
        violations: [{ code: 'repeated-imagery', message: '重复描写', ...evidence }], corrections: ['删句'] }),
    });
    expect(result).toEqual({ approved: true, violations: [], corrections: [] });
  });

  it('passes authorized evidence to the semantic critic and exempts its quoted repetition', async () => {
    const evidence = '陈慧慧明确说自己只是便利店的收银员。';
    let userPrompt = '';
    const result = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      narrative: `对话|陈慧慧|calm|${evidence}`, recentNarratives: [`对话|陈慧慧|calm|${evidence}`], exemptTexts: [evidence],
      complete: async messages => {
        userPrompt = messages.filter(message => message.role === 'user').map(message => message.content).join('');
        return JSON.stringify({ approved: false, violations: [{ code: 'repeated-prose', message: '重复证据', oldQuote: evidence, candidateQuote: evidence }], corrections: ['删掉证据'] });
      },
    });
    expect(userPrompt).toContain('exemptTexts');
    expect(userPrompt).toContain(evidence);
    expect(result.approved).toBe(true);
  });

  it('keeps a repeated question and its new dependent response together', () => {
    const question = '对话|陈慧慧|calm|你今天早上出门以前有没有吃过早餐？';
    const scene = `${question}\n对话|旁白|calm|你说吃过了，她便把包子放回笼屉。`;
    expect(removeExactRepeatedLines(scene, [question])).toBe(scene);
    expect(reviewProseDeterministically(scene, [question])[0]?.code).toBe('repeated-prose');
  });

  it('excludes nested observation and menu content from unparsed opening history', () => {
    expect(recentAcceptedNarratives([{ id: 'opening', role: 'assistant', timestamp: 1, variables: {},
      content: '<maintext>对话|旁白|calm|你站在家门口。<observe>从未实际展示的药瓶细节</observe><investigate>检查药瓶|玩家|心理|2分钟|0|3</investigate><action>去学校|现实|15分钟|10|0</action></maintext>',
    }])).toEqual(['对话|旁白|calm|你站在家门口。']);
  });
});


describe('substantive wording evidence for semantic style rejection', () => {
  it.each([
    ['学校那边应该能查到她有没有请假。去学校的路上会经过那家二十四小时便利店，文穗常在那里买东西，店员也认识她。', '两个小时，只排除了一个可能——她没有去学校。'],
    ['“回了我就告诉你。我早上还有事，先走了。”', '“这样，我这边先替你去问问。有结果我打给你。”'],
    ['至少有一点可以确定：她没有从这扇门进去。', '两个小时，只排除了一个可能——她没有去学校。'],
    ['钥匙挂在门边。你坐在餐桌旁，先想该从哪里问起。', '你把伞靠在门边，在餐桌旁坐下。两个小时，只排除了一个可能——她没有去学校。灯织那边还没有回音，周大爷住在旧街区，这个点也许还没出门。'],
  ])('allows a new action or result despite a grounded same-topic accusation: %s', async (oldQuote, candidateQuote) => {
    const result = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      recentNarratives: [`对话|旁白|calm|${oldQuote}`], narrative: `对话|旁白|calm|${candidateQuote}`,
      complete: async () => JSON.stringify({ approved: false, violations: [{
        code: 'repeated-prose', message: '承担相同叙事功能', oldQuote, candidateQuote,
      }], corrections: ['增加另一条调查线索'] }),
    });
    expect(result).toEqual({ approved: true, violations: [], corrections: [] });
  });

  it('still blocks a long rewrite with substantial shared wording below the deterministic threshold', async () => {
    const oldQuote = '冷白色的灯光在她头顶轻轻闪了一下，照得脸色更加苍白。';
    const candidateQuote = '冷白色的灯光在她头顶闪烁不定，她的脸色更加苍白。';
    const narrative = `对话|旁白|calm|${candidateQuote}`;
    const recentNarratives = [`对话|旁白|calm|${oldQuote}`];
    expect(reviewProseDeterministically(narrative, recentNarratives)).toEqual([]);
    const result = await reviewNarrativeStyle({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'critic' }, preset: null,
      recentNarratives, narrative,
      complete: async () => JSON.stringify({ approved: false, violations: [{
        code: 'repeated-prose', message: '同一长句只改动闪烁措辞', oldQuote, candidateQuote,
      }], corrections: ['重写重复的长句'] }),
    });
    expect(result.approved).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
