import { describe, expect, it } from 'vitest';
import {
  buildRetryPromptFromNarrativeFailure,
  factResidualsForRetry,
  isStyleOnlyNarrativeReview,
  repairNarrativeAgainstWriterPacket,
  repairNarrativeFormatAgainstWriterPacket,
  snapshotFactRepairFormatFailure,
  snapshotFormatRepairCallFailure,
  snapshotNarrativeReviewCallFailure,
} from './narrative-review';
import { buildNarrativeFormatRepairPrompt, buildNarrativeRepairPrompt } from './prompts';
import { formatProtocolErrorResidual, formatViolationResidual } from './repair-task';
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
    expect(prompt).toContain('不得从头另写剧情');
    expect(prompt).toContain('MISMATCHED_TAG');
    expect(prompt).toContain('不得再次出现下列协议错误');
    expect(prompt).toContain('<maintext>原剧情');
    expect(prompt).not.toContain('请从头重写完整场景');
  });

  it('lists the concrete fact errors and forbids repeating them on a surgical rewrite', () => {
    const review: FactReview = {
      approved: false,
      violations: [{ code: 'unknown-fact', message: '出现未授权事实。' }],
      corrections: ['删除未授权事实。'],
    };
    const prompt = buildNarrativeRepairPrompt(packet, '<maintext>原剧情顺序A然后B</maintext>', review);
    expect(prompt).toContain('unknown-fact: 出现未授权事实。');
    expect(prompt).toContain('不得再次出现下列违规');
    expect(prompt).toContain('保留原有事件顺序');
    expect(prompt).toContain('不得从头另写剧情');
    expect(prompt).toContain('<maintext>原剧情顺序A然后B</maintext>');
  });

  it('repairs the rejected narrative in place and carries prior residuals into the next attempt', async () => {
    const review: FactReview = {
      approved: false,
      violations: [{ code: 'unknown-fact', message: '出现未授权事实。' }],
      corrections: ['删除未授权事实。'],
    };
    const prior = [{ code: 'ungrounded-past-claim' as const, message: '正文补写了未获授权的既往来访。' }];
    let userPrompt = '';

    const repaired = await repairNarrativeAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'writer' },
      preset: null,
      packet,
      rejectedNarrative: '<maintext>原剧情顺序A然后B</maintext>',
      review,
      priorResiduals: prior,
      complete: async messages => {
        userPrompt = messages[1]?.content ?? '';
        return '<maintext>修好的剧情顺序A然后B</maintext>';
      },
    });

    expect(repaired).toBe('<maintext>修好的剧情顺序A然后B</maintext>');
    expect(userPrompt).toContain('[RejectedNarrative]');
    expect(userPrompt).toContain('<maintext>原剧情顺序A然后B</maintext>');
    expect(userPrompt).toContain(formatViolationResidual(review.violations[0]!));
    expect(userPrompt).toContain('先前失败残留也不得再次出现');
    expect(userPrompt).toContain(formatViolationResidual(prior[0]!));
    expect(userPrompt).toContain('不得从头另写剧情');
    expect(userPrompt).not.toContain('请为当前回合制定导演计划');
    expect(userPrompt).not.toContain('请从头重写完整场景');
    expect(userPrompt).not.toContain('请生成可播放场景');
  });

  it('repairs protocol errors in place and carries prior protocol residuals into the next attempt', async () => {
    const errors = [
      { code: 'MISMATCHED_TAG', message: '<maintext> 缺少闭合标签', tag: 'maintext' },
    ];
    const prior = [
      { code: 'INSUFFICIENT_OPTIONS', message: '<option> 至少需要 2 项', tag: 'option' },
    ];
    let userPrompt = '';

    const repaired = await repairNarrativeFormatAgainstWriterPacket({
      api: { baseUrl: 'https://example.test/v1', apiKey: 'test', model: 'writer' },
      preset: null,
      packet,
      rejectedNarrative: '<maintext>原剧情顺序A然后B\n<option>调查</option>',
      errors,
      priorResiduals: prior,
      complete: async messages => {
        userPrompt = messages[1]?.content ?? '';
        return '<maintext>原剧情顺序A然后B</maintext>\n<option>调查</option>\n<option>离开</option>';
      },
    });

    expect(repaired).toContain('<maintext>原剧情顺序A然后B</maintext>');
    expect(userPrompt).toContain('[RejectedNarrative]');
    expect(userPrompt).toContain('<maintext>原剧情顺序A然后B');
    expect(userPrompt).toContain(formatProtocolErrorResidual(errors[0]!));
    expect(userPrompt).toContain('先前失败残留也不得再次出现');
    expect(userPrompt).toContain(formatProtocolErrorResidual(prior[0]!));
    expect(userPrompt).toContain('只修复输出协议');
    expect(userPrompt).toContain('不得从头另写剧情');
    expect(userPrompt).not.toContain('请为当前回合制定导演计划');
    expect(userPrompt).not.toContain('请从头重写完整场景');
    expect(userPrompt).not.toContain('请生成可播放场景');
  });

  it('keeps fact residuals on a format-fail cache write and restores them after tag repair', () => {
    const review: FactReview = {
      approved: false,
      violations: [{ code: 'unknown-fact', message: '出现未授权事实。' }],
      corrections: ['删除未授权事实。'],
    };
    const priorFact = [{ code: 'ungrounded-past-claim' as const, message: '正文补写了未获授权的既往来访。' }];
    const cached = snapshotFactRepairFormatFailure({
      draft: '<maintext>原剧情顺序A然后B\n<option>调查</option>',
      errors: [{ code: 'MISMATCHED_TAG', message: '<maintext> 缺少闭合标签', tag: 'maintext' }],
      priorFormatResiduals: [{ code: 'INSUFFICIENT_OPTIONS', message: '<option> 至少需要 2 项', tag: 'option' }],
      review,
      priorResiduals: priorFact,
    });

    expect(cached.review).toEqual(review);
    expect(cached.priorResiduals).toEqual(priorFact);

    const retryPrompt = buildRetryPromptFromNarrativeFailure(packet, cached);
    expect(retryPrompt).toContain('[RejectedNarrative]');
    expect(retryPrompt).toContain('<maintext>原剧情顺序A然后B');
    expect(retryPrompt).toContain('只修复输出协议');
    expect(retryPrompt).toContain(formatProtocolErrorResidual(cached.formatErrors![0]!));
    expect(retryPrompt).toContain('先前失败残留也不得再次出现');
    expect(retryPrompt).toContain(formatProtocolErrorResidual(cached.priorFormatResiduals![0]!));
    expect(retryPrompt).not.toContain('请为当前回合制定导演计划');
    expect(retryPrompt).not.toContain('请生成可播放场景');

    const restored = factResidualsForRetry(cached);
    expect(restored.map(formatViolationResidual)).toEqual([
      formatViolationResidual(priorFact[0]!),
      formatViolationResidual(review.violations[0]!),
    ]);

    const factOnlyPrompt = buildRetryPromptFromNarrativeFailure(packet, {
      draft: cached.draft,
      review,
      priorResiduals: priorFact,
    });
    expect(factOnlyPrompt).toContain('不得再次出现下列违规');
    expect(factOnlyPrompt).toContain(formatViolationResidual(review.violations[0]!));
    expect(factOnlyPrompt).not.toContain('只修复输出协议');
  });

  it('caches a format-repair throw during fact repair so retry stays in place', () => {
    const review: FactReview = {
      approved: false,
      violations: [{ code: 'unknown-fact', message: '出现未授权事实。' }],
      corrections: ['删除未授权事实。'],
    };
    const priorFact = [{ code: 'ungrounded-past-claim' as const, message: '正文补写了未获授权的既往来访。' }];
    const cached = snapshotFormatRepairCallFailure({
      draft: '<maintext>原剧情顺序A然后B</maintext>\n<option>调查</option>',
      error: new Error('API error 502'),
      priorFormatResiduals: [{ code: 'INSUFFICIENT_OPTIONS', message: '<option> 至少需要 2 项', tag: 'option' }],
      review,
      priorResiduals: priorFact,
    });

    expect(cached.formatErrors).toEqual([
      expect.objectContaining({ code: 'FORMAT_REPAIR_CALL_FAILED', message: 'API error 502' }),
    ]);
    expect(cached.review).toEqual(review);
    expect(cached.priorResiduals).toEqual(priorFact);

    const retryPrompt = buildRetryPromptFromNarrativeFailure(packet, cached);
    expect(retryPrompt).toContain('[RejectedNarrative]');
    expect(retryPrompt).toContain('<maintext>原剧情顺序A然后B</maintext>');
    expect(retryPrompt).toContain('只修复输出协议');
    expect(retryPrompt).toContain('FORMAT_REPAIR_CALL_FAILED: API error 502');
    expect(retryPrompt).toContain('先前失败残留也不得再次出现');
    expect(retryPrompt).not.toContain('请为当前回合制定导演计划');
    expect(retryPrompt).not.toContain('请生成可播放场景');

    expect(factResidualsForRetry(cached).map(formatViolationResidual)).toEqual([
      formatViolationResidual(priorFact[0]!),
      formatViolationResidual(review.violations[0]!),
    ]);
  });

  it('caches a critic/style throw so retry reruns review without rewriting the draft', () => {
    const priorFact = [{ code: 'ungrounded-past-claim' as const, message: '正文补写了未获授权的既往来访。' }];
    const cached = snapshotNarrativeReviewCallFailure({
      draft: '<maintext>原剧情顺序A然后B</maintext>',
      error: new Error('API error 502'),
      priorResiduals: priorFact,
    });

    expect(cached.reviewPending).toBe(true);
    expect(cached.review).toBeUndefined();
    expect(cached.formatErrors).toBeUndefined();
    expect(() => buildRetryPromptFromNarrativeFailure(packet, cached))
      .toThrow('正文仍待审查，不应构造 Writer 修复提示。');
    expect(factResidualsForRetry(cached).map(formatViolationResidual)).toEqual([
      formatViolationResidual(priorFact[0]!),
    ]);

    const firstCall = snapshotNarrativeReviewCallFailure({
      draft: '<maintext>原剧情顺序A然后B</maintext>',
      error: new Error('API error 502'),
    });
    expect(firstCall.reviewPending).toBe(true);
    expect(firstCall.review).toBeUndefined();
    expect(() => buildRetryPromptFromNarrativeFailure(packet, firstCall))
      .toThrow('正文仍待审查，不应构造 Writer 修复提示。');
  });
});
