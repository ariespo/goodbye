import { describe, expect, it } from 'vitest';
import { isStyleOnlyNarrativeReview } from './narrative-review';
import { buildNarrativeFormatRepairPrompt, buildNarrativeRepairPrompt } from './prompts';
import type { FactReview, WriterPacket } from './types';

const packet = {
  authorizedFacts: [],
  playerKnownFacts: [],
} as unknown as WriterPacket;

describe('narrative repair strategy', () => {
  it('locks the plot and requests sentence-level edits for style-only violations', () => {
    const review: FactReview = {
      approved: false,
      violations: [{ code: 'repeated-imagery', message: '重复使用雨水映照灯光的意象。' }],
      corrections: ['只改写对应的环境描写。'],
    };

    expect(isStyleOnlyNarrativeReview(review)).toBe(true);
    const prompt = buildNarrativeRepairPrompt(packet, '<maintext>原剧情</maintext>', review);
    expect(prompt).toContain('剧情构思已经锁定');
    expect(prompt).toContain('只修改 violations 与 corrections 指出的');
    expect(prompt).toContain('不得从头另写剧情');
    expect(prompt).not.toContain('请从头重写完整场景');
  });

  it('does not classify mixed fact and style violations as style-only', () => {
    const review: FactReview = {
      approved: false,
      violations: [
        { code: 'repeated-prose', message: '出现重复句。' },
        { code: 'unknown-fact', message: '出现未授权事实。' },
      ],
      corrections: ['删除未授权事实。'],
    };

    expect(isStyleOnlyNarrativeReview(review)).toBe(false);
    const prompt = buildNarrativeRepairPrompt(packet, '<maintext>原剧情</maintext>', review);
    expect(prompt).toContain('最小范围修复');
    expect(prompt).toContain('保留原有事件顺序');
  });

  it('repairs protocol errors without asking the writer to regenerate the plot', () => {
    const prompt = buildNarrativeFormatRepairPrompt(
      packet,
      '<maintext>原剧情\n<option>调查</option>',
      [
        { code: 'MISMATCHED_TAG', message: '<maintext> 缺少闭合标签', tag: 'maintext' },
        { code: 'INSUFFICIENT_OPTIONS', message: '<option> 至少需要 2 项', tag: 'option' },
      ],
    );

    expect(prompt).toContain('只修复输出协议');
    expect(prompt).toContain('<maintext> 缺少闭合标签');
    expect(prompt).toContain('不得重新构思剧情');
    expect(prompt).toContain('<maintext>原剧情');
  });
});
