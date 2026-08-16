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

  it('drops only the redundant line while preserving the rest of the scene', () => {
    const repeated = '对话|陈慧慧|calm|“C姐，今天真的只是一个人来啊……”';
    const current = `${repeated}\n对话|旁白|calm|你推开门，朝学校走去。`;

    expect(removeExactRepeatedLines(current, [repeated])).toBe(
      '对话|旁白|calm|你推开门，朝学校走去。',
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

  it('uses a separate semantic critic for repeated imagery', async () => {
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
          violations: [{ code: 'repeated-imagery', message: '连续用雨水扭曲窗外灯光表达相同的不安。' }],
          corrections: ['改用人物选择或空间距离承载不安。'],
        });
      },
    });

    expect(criticPrompt).toContain('雨水把玻璃后的霓虹');
    expect(criticPrompt).toContain('水痕把窗外的灯');
    expect(review).toEqual(expect.objectContaining({
      approved: false,
      violations: [expect.objectContaining({ code: 'repeated-imagery' })],
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
