import { describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { projectWritableState, validateStateAgentResponse } from './state-agent';
import { buildStateEvidenceAuthority } from './state-evidence';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';

describe('validateStateAgentResponse', () => {
  it('cannot override resolved resources or the program continuation even with matching prose', () => {
    const resolved: ResolvedActionOutcome = { id: 'r', cycleCount: 1,
      startTime: '2024-09-09T08:00:00', endTime: '2024-09-09T08:55:00',
      startLocationId: 'home', endLocationId: 'home', plannedMinutes: 55, executedMinutes: 55,
      segments: [], completedSourceIds: [], eventEffectIds: [],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } } };
    const quote = '你精疲力竭，忘了之前的调查。';
    const response = { patch: { stamina: 1, sanity: 1, location: 'school', actionContinuity: { cycleCount: 9 } },
      evidence: ['stamina', 'sanity', 'location', 'actionContinuity.cycleCount'].map(path => ({ path, quote })) };
    const result = validateStateAgentResponse(response, createDefaultVariables(), quote, undefined, undefined, resolved);
    expect(result.vars).toEqual({});
    expect(result.rejected.map(item => item.path).sort())
      .toEqual(['actionContinuity.cycleCount', 'location', 'sanity', 'stamina']);
  });

  it('rejects unknown location mutations while preserving the registered anchor', () => {
    const current = { ...createDefaultVariables(), location: 'school' };
    const result = validateStateAgentResponse({
      patch: { location: 'police_station' },
      evidence: [{ path: 'location', quote: '你前往派出所' }],
    }, current, '你前往派出所。');
    expect(result.vars.location).toBeUndefined();
    expect(result.rejected.some(item => item.path === 'location')).toBe(true);
  });

  it('accepts registered destinations and anchors street scenes to the current location', () => {
    const current = { ...createDefaultVariables(), location: 'school' };
    const destination = validateStateAgentResponse({
      patch: { location: 'supermarket' },
      evidence: [{ path: 'location', quote: '你前往便利店' }],
    }, current, '你前往便利店。');
    expect(destination.vars.location).toBe('supermarket');
    const street = validateStateAgentResponse({
      patch: { location: 'street' },
      evidence: [{ path: 'location', quote: '你走到街上' }],
    }, current, '你走到街上。');
    expect(street.vars.location).toBe('school');
  });

  it('does not award suspicion for a player guess without program authority', () => {
    const result = validateStateAgentResponse({
      patch: { suspicion: { 'old-man': 10 } },
      evidence: [{ path: 'suspicion.old-man', quote: '我猜老人有嫌疑' }],
    }, createDefaultVariables(), '我猜老人有嫌疑\n没有找到新的证据');
    expect(result.vars['suspicion.old-man']).toBeUndefined();
  });
  it('只接受有逐字段原文证据的状态变化', () => {
    const result = validateStateAgentResponse({
      summary: '玩家发现老人的证词有矛盾。',
      patch: {
        suspicion: { 'old-man': 10 },
        investigation: { crime: 8 },
      },
      evidence: [
        { path: 'suspicion.old-man', quote: '老人的证词前后矛盾', evidenceId: 'fact:F001' },
      ],
    }, createDefaultVariables(), '你发现老人的证词前后矛盾，但还没有取得物证。', undefined, {
      newEvidence: [{ id: 'fact:F001', actorIds: ['old-man'], text: '老人的证词前后矛盾' }],
    });

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
        { path: 'suspicion.old-man', quote: '所有证据都指向老人', evidenceId: 'fact:F001' },
        { path: 'lockedRoute', quote: '你认定老人就是凶手' },
      ],
    }, createDefaultVariables(), '所有证据都指向老人。你认定老人就是凶手。', undefined, {
      newEvidence: [{ id: 'fact:F001', actorIds: ['old-man'], text: '所有证据都指向老人' }],
    });

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

  it('rejects wrong actor, fabricated IDs, and unrelated quotes even with an authorized fact', () => {
    const authority = { newEvidence: [{ id: 'fact:F001', actorIds: ['old-man'], text: '老人的证词前后矛盾' }] };
    for (const [actor, id, quote] of [
      ['self', 'fact:F001', '老人的证词前后矛盾'],
      ['old-man', 'fact:invented', '老人的证词前后矛盾'],
      ['old-man', 'fact:F001', '我猜老人有嫌疑'],
    ]) {
      const result = validateStateAgentResponse({
        patch: { suspicion: { [actor]: 25 } },
        evidence: [{ path: `suspicion.${actor}`, quote, evidenceId: id }],
      }, createDefaultVariables(), '老人的证词前后矛盾。我猜老人有嫌疑。', undefined, authority);
      expect(result.vars[`suspicion.${actor}`]).toBeUndefined();
    }
  });

  it('awards a new fact once and rejects it after deterministic knowledge settlement', () => {
    const packet = { authorizedFacts: [{ id: 'F001', level: 'clue' as const, text: '老人的证词前后矛盾', delivery: 'narration' as const }] };
    const graph = { version: 'test', npcKnowledge: [], facts: [{ id: 'canonical', route: 'A' as const, kind: 'evidence' as const, canonicalTruth: 'secret', characters: ['old-man'], suspicionTargets: ['old-man'], locations: [], revelations: {}, availability: {} }] };
    const response = { patch: { suspicion: { 'old-man': 10 } }, evidence: [{ path: 'suspicion.old-man', quote: '老人的证词前后矛盾', evidenceId: 'fact:F001' }] };
    const first = validateStateAgentResponse(response, createDefaultVariables(), packet.authorizedFacts[0].text, undefined,
      buildStateEvidenceAuthority(packet, graph, {}, [], { F001: 'canonical' }));
    expect(first.vars['suspicion.old-man']).toBe(10);
    const variables = createDefaultVariables();
    variables.suspicion['old-man'] = 10;
    response.patch.suspicion['old-man'] = 15;
    const repeated = validateStateAgentResponse(response, variables, packet.authorizedFacts[0].text, undefined,
      buildStateEvidenceAuthority(packet, graph, { canonical: 'clue' }, [], { F001: 'canonical' }));
    expect(repeated.vars['suspicion.old-man']).toBeUndefined();
  });

  it('sends only writable values and omits accumulated memory and canonical knowledge', () => {
    const variables = createDefaultVariables();
    const projected = projectWritableState({ ...variables, worldMemory: { text: 'x'.repeat(20000) }, mysteryKnowledge: { secret: 'confirmation' }, suspicion: { ...variables.suspicion, secret: 77 } });
    expect(projected.suspicion).toEqual(variables.suspicion);
    expect(projected.location).toBe(variables.location);
    expect(projected.worldMemory).toBeUndefined();
    expect(projected.mysteryKnowledge).toBeUndefined();
    expect(projected.loopSuspicionStart).toBeUndefined();
  });

  it('retains the full-day suspicion cap after authorizing a second new fact', () => {
    const variables = createDefaultVariables();
    variables.suspicion['old-man'] = 10;
    const result = validateStateAgentResponse({
      patch: { suspicion: { 'old-man': 25 } },
      evidence: [{ path: 'suspicion.old-man', quote: '老人的证词前后矛盾', evidenceId: 'fact:F002' }],
    }, variables, '老人的证词前后矛盾', undefined, {
      newEvidence: [{ id: 'fact:F002', actorIds: ['old-man'], text: '老人的证词前后矛盾' }],
    });
    expect(result.vars['suspicion.old-man']).toBe(15);
  });
});
