import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { validateStateAgentResponse } from './state-agent';

describe('validateStateAgentResponse', () => {
  it('只接受有逐字段原文证据的状态变化', () => {
    const result = validateStateAgentResponse({
      summary: '玩家发现老人的证词有矛盾。',
      patch: {
        suspicion: { 'old-man': 10 },
        investigation: { crime: 8 },
      },
      evidence: [
        { path: 'suspicion.old-man', quote: '老人的证词前后矛盾' },
      ],
    }, createDefaultVariables(), '你发现老人的证词前后矛盾，但还没有取得物证。');

    expect(result.vars['suspicion.old-man']).toBe(10);
    expect(result.vars['investigation.crime']).toBeUndefined();
    expect(result.rejected).toContainEqual({
      path: 'investigation.crime',
      reason: '缺少同路径的原文证据',
    });
  });

  it('拒绝伪造的引文', () => {
    const result = validateStateAgentResponse({
      patch: { affinity: { touko: 50 } },
      evidence: [
        { path: 'affinity.touko', quote: '冬子拥抱了你' },
      ],
    }, createDefaultVariables(), '冬子沉默地关上了门。');

    expect(result.vars).toEqual({});
    expect(result.rejected[0].reason).toContain('不在');
  });

  it('拒绝过短且容易误匹配的引文', () => {
    const result = validateStateAgentResponse({
      patch: { affinity: { fumi: 10 } },
      evidence: [
        { path: 'affinity.fumi', quote: '文穗' },
      ],
    }, createDefaultVariables(), '文穗看向窗外，没有回应。');

    expect(result.vars).toEqual({});
    expect(result.rejected[0].reason).toContain('过短');
  });

  it('State Agent 无权写入事实知识、路线收集和程序字段', () => {
    const result = validateStateAgentResponse({
      patch: {
        mysteryKnowledge: { 'secret-fact': 'confirmation' },
        unlockedClues: ['secret-fact'],
        cycleCount: 9,
        tripProgress: 100,
        letterFragments: ['forged-fragment'],
      },
      evidence: [
        { path: 'mysteryKnowledge.secret-fact', quote: '找到了线索' },
        { path: 'unlockedClues', quote: '找到了线索' },
        { path: 'cycleCount', quote: '找到了线索' },
        { path: 'tripProgress', quote: '找到了线索' },
        { path: 'letterFragments', quote: '找到了线索' },
      ],
    }, createDefaultVariables(), '你找到了线索。');

    expect(result.vars).toEqual({});
    expect(result.rejected).toHaveLength(5);
  });

  it('证据通过后仍执行数值增幅并拒绝程序拥有的路线字段', () => {
    const result = validateStateAgentResponse({
      patch: {
        suspicion: { 'old-man': 50 },
        lockedRoute: 'A',
      },
      evidence: [
        { path: 'suspicion.old-man', quote: '所有证据都指向老人' },
        { path: 'lockedRoute', quote: '你认定老人就是凶手' },
      ],
    }, createDefaultVariables(), '所有证据都指向老人。你认定老人就是凶手。');

    expect(result.vars['suspicion.old-man']).toBe(15);
    expect(result.vars.lockedRoute).toBeUndefined();
    expect(result.clamped[0].to).toBe(15);
  });

  it('调查饱和转场由程序固定提升其他角色并禁止原目标继续增长', () => {
    const variables = createDefaultVariables();
    variables.suspicion['old-man'] = 15;
    const result = validateStateAgentResponse({
      patch: { suspicion: { 'old-man': 30, self: 30 } },
      evidence: [
        { path: 'suspicion.old-man', quote: '继续质问老人' },
        { path: 'suspicion.self', quote: '门卫确认电话来自男性' },
      ],
    }, variables, '你继续质问老人。随后门卫确认电话来自男性。', {
      blockedActorId: 'old-man', redirectedActorId: 'self', requiredSuspicionGain: 5,
    });

    expect(result.vars['suspicion.old-man']).toBeUndefined();
    expect(result.vars['suspicion.self']).toBe(15);
  });
});
