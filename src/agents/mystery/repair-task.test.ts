import { describe, expect, it } from 'vitest';
import {
  buildDirectorRepairTask,
  buildDoNotRepeatBlock,
  buildProtocolDoNotRepeatBlock,
  formatProtocolErrorResidual,
  formatViolationResidual,
  mergeProtocolRepairResiduals,
  mergeRepairResiduals,
} from './repair-task';
import type { DirectorPlan, FactReview } from './types';

const plan = {
  turnGoal: '检查衣柜里的异常',
  tone: '克制',
  beats: [{ id: 'beat-1', purpose: '发现缺失物', description: '查看衣柜' }],
  revelations: [],
  optionIntents: [{ id: 'option-1', intent: '继续调查', tone: '谨慎', expectedPressure: 'low' }],
  assetRequests: ['bedroom-apron'],
} as DirectorPlan;

const review: FactReview = {
  approved: false,
  violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
  corrections: ['删除越权台词'],
};

describe('repair-task builder', () => {
  it('turns the rejected artifact and named violations into a surgical director task', () => {
    const task = buildDirectorRepairTask({
      rejectedPlan: plan,
      review,
      failedStage: 'semantic-review',
    });

    expect(task).toContain('最小范围修正');
    expect(task).toContain('不得重新制定本回合');
    expect(task).toContain('不得根据原始导演用户提示重采样');
    expect(task).not.toContain('请为当前回合制定导演计划');
    expect(task).toContain('[RejectedPlan]');
    expect(task).toContain('查看衣柜');
    expect(task).toContain('npc-knowledge-violation');
    expect(task).toContain('NPC 越权透露事实');
    expect(task).toContain('删除越权台词');
    expect(task).toContain('不得再次出现下列违规');
  });

  it('adds prior failed residuals as do-not-repeat constraints on the next attempt', () => {
    const task = buildDirectorRepairTask({
      rejectedPlan: plan,
      review,
      priorResiduals: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      failedStage: 'semantic-review',
    });

    expect(task).toContain('先前失败残留也不得再次出现');
    expect(task).toContain(formatViolationResidual(review.violations[0]!));
    expect(task).not.toContain('只重新输出一个完整、合法、无 Markdown 的 JSON 对象；不得省略、截断或添加解释。');
  });

  it('merges residuals without duplicating the same code and message', () => {
    const first = mergeRepairResiduals([], review.violations);
    const second = mergeRepairResiduals(first, review.violations);
    expect(second).toHaveLength(1);
    expect(buildDoNotRepeatBlock(review.violations, first)).toContain('先前失败残留');
  });

  it('lists prior protocol errors as do-not-repeat residuals without duplicating them', () => {
    const current = [{ code: 'MISMATCHED_TAG', message: '<maintext> 缺少闭合标签' }];
    const prior = [{ code: 'INSUFFICIENT_OPTIONS', message: '<option> 至少需要 2 项' }];
    const first = mergeProtocolRepairResiduals([], current);
    const second = mergeProtocolRepairResiduals(first, current);
    expect(second).toHaveLength(1);
    const block = buildProtocolDoNotRepeatBlock(current, prior);
    expect(block).toContain('先前失败残留也不得再次出现');
    expect(block).toContain(formatProtocolErrorResidual(current[0]!));
    expect(block).toContain(formatProtocolErrorResidual(prior[0]!));
  });
});
