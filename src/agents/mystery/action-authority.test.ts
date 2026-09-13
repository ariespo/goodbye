import { describe, expect, it } from 'vitest';
import { buildActionAuthorityInput, selectPresentedActionFacts, projectExecutedPlan, buildActionOutcomeSources, type ActionAuthorityContext } from './action-authority';
import { resolveAction, type ResolvedActionOutcome } from '../../engine/action-resolution';
import { resolveActionNarrativeContext } from '../../engine/action-narrative-context';
import type { DirectorPlan, FactReview, WriterPacket } from './types';

const context: ActionAuthorityContext = { cycleCount: 1, startTime: '2024-09-09T08:00:00',
  currentLocationId: 'home', stamina: 100, sanity: 70, originalInput: '调查房间', deathNews: 'untriggered' };
const plan: DirectorPlan = { turnGoal: '调查', tone: 'calm', beats: [], assetRequests: [], optionIntents: [],
  revelations: [{ factId: 'F001', level: 'clue', delivery: 'object' }] };

describe('trusted action input adapter', () => {
  it.each(['休息一会儿', '等待一会儿'])('gives %s a program-owned duration even without model prices', text => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], timeCostMinutes: 1 }, { ...context, originalInput: text }, 'quiet');
    const outcome = resolveAction(input);
    expect(outcome.executedMinutes).toBe(60);
    expect(outcome.completedSourceIds).toEqual([]);
    expect(outcome.resources.after.stamina).toBe(text.startsWith('休息') ? 112 : 100);
  });
  it('keeps the selected menu action kind when the Director proposes a different resource effect', () => {
    const input = buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'changed', kind: 'rest', scope: 'normal', locationId: 'home' }] },
      { ...context, inputOrigin: 'menu', selection: { kind: 'investigation', scope: 'normal' } }, 'selected');
    const outcome = resolveAction(input);
    expect(outcome.segments[0].step.kind).toBe('investigation');
    expect(outcome.resources.after.stamina).toBe(93);
  });
  it('honors a new explicit short budget when resuming existing deep work', () => {
    const first = resolveAction(buildActionAuthorityInput(plan, { ...context,
      startTime: '2024-09-09T15:30:00', originalInput: '深入调查房间',
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    }, 'ongoing'));
    const resumed = resolveAction(buildActionAuthorityInput(plan, { ...context,
      startTime: first.endTime, stamina: first.resources.after.stamina,
      originalInput: '只用五分钟继续调查', continuation: first.continuation, resumeActionId: first.continuation!.actionId,
    }, 'new-request'));
    expect(resumed.executedMinutes).toBe(5);
    expect(resumed.completedSourceIds).toEqual([]);
    expect(resumed.continuation?.completedMinutesByStep['work:0']).toBe(35);
  });
  it('describes a player time budget without inventing a timed world event or completed arrival', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [] }, {
      ...context, originalInput: '只用五分钟前往学校调查', sourceLocationId: 'school',
    }, 'budget-transit');
    const outcome = resolveAction(input);
    const sources = buildActionOutcomeSources(outcome).map(source => source.text).join('\n');
    expect(outcome.interruption?.id).toBe('explicit-budget');
    expect(sources).toContain('玩家限定的时间');
    expect(sources).toContain('仍在途中');
    expect(sources).not.toContain('定时事件打断');
    expect(sources).not.toContain('玩家位于');
  });
  it('prices an ordinary inquiry by scope instead of Director numerical time', () => {
    const result = buildActionAuthorityInput({ ...plan, timeCostMinutes: 1 }, context, 'r');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'investigation', scope: 'normal', locationId: 'home', completionSourceIds: ['fact:F001:clue'] });
    expect(result.explicitBudgetMinutes).toBeUndefined();
  });
  it('treats a five-minute demand as partial budget, preserving full normal work price', () => {
    const result = buildActionAuthorityInput(plan, { ...context, originalInput: '只用五分钟调查完所有事情' }, 'r');
    expect(result.explicitBudgetMinutes).toBe(5);
    expect(result.steps[0].scope).toBe('normal');
  });
  it('does not turn a historical time mentioned in a question into a budget', () => {
    expect(buildActionAuthorityInput(plan, { ...context, originalInput: '询问两小时前发生了什么' }, 'r').explicitBudgetMinutes).toBeUndefined();
  });
  it('keeps separately priced compound actions and binds ambiguous findings to the final stage', () => {
    const result = buildActionAuthorityInput(plan, { ...context, originalInput: '先调查房间，再询问邻居' }, 'r');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].completionSourceIds).toEqual([]);
    expect(result.steps[1].completionSourceIds).toEqual(['fact:F001:clue']);
  });
  it('binds a case fact to the last eligible work step at its trusted source location', () => {
    const result = buildActionAuthorityInput({ ...plan, actionSteps: [
      { id: 'home-check', kind: 'investigation', scope: 'normal', locationId: 'home', completionSourceIds: [] },
      { id: 'store-question', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] },
    ] }, { ...context, originalInput: '先调查房间，再去便利店询问', sourceLocationId: 'home' }, 'r');
    expect(result.steps[0].completionSourceIds).toEqual(['fact:F001:clue']);
    expect(result.steps[1].completionSourceIds).toEqual([]);

    const noEligibleStep = buildActionAuthorityInput({ ...plan, actionSteps: [
      { id: 'store-question', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] },
    ] }, { ...context, originalInput: '去便利店询问', sourceLocationId: 'school' }, 'r2');
    expect(noEligibleStep.steps.every(step => !step.completionSourceIds.includes('fact:F001:clue'))).toBe(true);
  });
  it('rejects model-created event effects, exact prices and unknown destinations', () => {
    const proposed = { ...plan, actionSteps: [{ id: 'fake', kind: 'event', eventId: 'death-news', scope: 'short',
      locationId: 'police_station', requestedMinutes: 0, completionSourceIds: ['secret'] }] };
    expect(() => buildActionAuthorityInput(proposed, context, 'r')).toThrow();
  });
  it('prioritizes a pending death event and grants no investigation finding', () => {
    const result = buildActionAuthorityInput(plan, { ...context, deathNews: 'pending' }, 'r');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ kind: 'event', eventId: 'death-news', completionSourceIds: [] });
  });
  it('cannot downgrade an explicitly deep task to a cheap short proposal', () => {
    const result = buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'cheap', kind: 'investigation',
      scope: 'short', locationId: 'home', completionSourceIds: [] }] }, { ...context, originalInput: '深入调查房间' }, 'r');
    expect(result.steps[0].scope).toBe('deep');
  });
  it('treats an explicit two-hour wait as waiting, not an investigation', () => {
    const result = buildActionAuthorityInput(plan, { ...context, originalInput: '等两小时' }, 'r');
    expect(result.steps[0]).toMatchObject({ kind: 'wait', requestedMinutes: 120, completionSourceIds: [] });
  });
  it('rejects a null model stage rather than silently replacing a malformed plan', () => {
    expect(() => buildActionAuthorityInput({ ...plan, actionSteps: [null] }, context, 'r')).toThrow();
  });
  it('earns a trusted arrival event when travel completes while keeping case and other knowledge on work', () => {
    const proposedScene = resolveActionNarrativeContext('去便利店打听文穗的行踪', new Date(context.startTime), 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 1,
    });
    expect(proposedScene).not.toBeNull();
    const arrivalPlan: DirectorPlan = {
      ...plan,
      knowledgeEvents: [
        { eventId: 'meet:chen-huihui', evidence: '抵达便利店后认出店员陈慧慧。' },
        { eventId: 'insight:chen-huihui-social-strain', evidence: '交谈后观察到她不善社交。' },
      ],
    };
    const input = buildActionAuthorityInput(arrivalPlan, {
      ...context, originalInput: '去便利店打听文穗的行踪', proposedScene, sourceLocationId: 'supermarket',
    }, 'arrival');

    expect(input.steps).toHaveLength(2);
    expect(input.steps[0]).toMatchObject({
      kind: 'travel', locationId: 'supermarket', completionSourceIds: ['accepted-event:meet:chen-huihui'],
    });
    expect(input.steps[1].completionSourceIds).toEqual([
      'fact:F001:clue', 'accepted-event:insight:chen-huihui-social-strain',
    ]);

    const first = resolveAction({ ...input, explicitBudgetMinutes: 20 });
    expect(first.endLocationId).toBe('supermarket');
    expect(first.completedSourceIds).toEqual(['accepted-event:meet:chen-huihui']);
    expect(first.continuation).toBeDefined();

    const resumedInput = buildActionAuthorityInput(arrivalPlan, {
      ...context,
      startTime: first.endTime,
      currentLocationId: first.endLocationId,
      stamina: first.resources.after.stamina,
      proposedScene,
      continuation: first.continuation,
      resumeActionId: first.continuation!.actionId,
    }, 'fresh-request-id');
    const resumed = resolveAction(resumedInput);
    expect(resumed.completedSourceIds).toEqual([
      'fact:F001:clue', 'accepted-event:insight:chen-huihui-social-strain',
    ]);
    expect(resumed.segments.some(segment => segment.step.kind === 'travel')).toBe(false);
  });
});

describe('earned and presented fact selection', () => {
  const packet = { authorizedFacts: [{ id: 'F001', level: 'clue', text: '线索', delivery: 'object' }] } as WriterPacket;
  const review = (field: string, approved = true): FactReview => ({ approved, violations: [], corrections: [],
    assertionAudit: { reviewedFields: [field], assertions: [{ field, quote: '线索', proposition: '获得线索', status: 'supported',
      citations: [{ sourceId: 'fact:F001:clue', quote: '线索' }], reason: '正文明示' }] } });
  it('commits only facts both earned and cited in final approved maintext', () => {
    expect(selectPresentedActionFacts(packet, review('maintext'), ['fact:F001:clue']).authorizedFacts).toHaveLength(1);
    expect(selectPresentedActionFacts(packet, review('maintext'), []).authorizedFacts).toEqual([]);
    expect(selectPresentedActionFacts(packet, review('summary'), ['fact:F001:clue']).authorizedFacts).toEqual([]);
    expect(selectPresentedActionFacts(packet, review('maintext', false), ['fact:F001:clue']).authorizedFacts).toEqual([]);
    expect(selectPresentedActionFacts(packet, undefined, ['fact:F001:clue']).authorizedFacts).toEqual([]);
  });
});

describe('executed plan projection', () => {
  const partial: ResolvedActionOutcome = { id: 'partial', cycleCount: 1,
    startTime: '2024-09-09T15:30:00', endTime: '2024-09-09T16:00:00',
    startLocationId: 'home', endLocationId: 'home', plannedMinutes: 105, executedMinutes: 30,
    segments: [{ step: { id: 'q', kind: 'investigation', scope: 'deep', locationId: 'home', completionSourceIds: ['fact:F001:clue'] },
      plannedMinutes: 105, executedMinutes: 30, cumulativeExecutedMinutes: 30, completed: false, staminaDelta: -4 }],
    completedSourceIds: [], eventEffectIds: [], interruption: { id: 'death-news', at: '2024-09-09T16:00:00' },
    resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 96, sanity: 70 } } };
  it('removes uncompleted finding from revelations, beats and dependent menus', () => {
    const original = { ...plan, beats: [{ id: 'secret', purpose: '发现', description: '发现学校未登记入校的记录' }],
      scenePlan: { observeFocus: '学校未登记入校的记录', investigateIntents: [], actionIntents: [] } };
    const projected = projectExecutedPlan(original, partial);
    expect(projected.revelations).toEqual([]);
    expect(JSON.stringify(projected)).not.toContain('未登记入校');
    expect(projected.timeCostMinutes).toBe(30);
    expect(original.beats[0].id).toBe('secret');
  });
  it('removes every proposed outcome while retaining approved cast for partial work after arrival', () => {
    const secret = '学校未登记入校的记录';
    const original: DirectorPlan = {
      ...plan,
      turnGoal: `确认${secret}`,
      beats: [{ id: 'secret', purpose: '发现', description: secret, locationId: 'supermarket', speakerIds: ['chen-huihui'] }],
      knowledgeEvents: [{ eventId: 'meet:chen-huihui', evidence: '抵达便利店后认出陈慧慧。' }],
      backgroundFactProposals: [{ proposalId: 'bg:secret', text: secret, characterIds: ['chen-huihui'],
        locationIds: ['supermarket'], knowerIds: ['chen-huihui'], evidenceText: secret }],
      scenePlan: { observeFocus: secret, observeConceal: secret, investigateIntents: [
        { intent: secret, factId: 'F001', costTier: 'heavy' },
      ], actionIntents: [{ intent: secret, costTier: 'heavy' }] },
    };
    const afterArrival: ResolvedActionOutcome = {
      ...partial,
      startLocationId: 'home', endLocationId: 'supermarket', plannedMinutes: 70, executedMinutes: 20,
      segments: [
        { step: { id: 'travel', kind: 'travel', scope: 'normal', locationId: 'supermarket',
          completionSourceIds: ['accepted-event:meet:chen-huihui'] }, plannedMinutes: 15, executedMinutes: 15,
          cumulativeExecutedMinutes: 15, completed: true, staminaDelta: -2 },
        { step: { id: 'work', kind: 'investigation', scope: 'normal', locationId: 'supermarket',
          completionSourceIds: ['fact:F001:clue'] }, plannedMinutes: 55, executedMinutes: 5,
          cumulativeExecutedMinutes: 5, completed: false, staminaDelta: -1 },
      ],
      completedSourceIds: ['accepted-event:meet:chen-huihui'],
    };
    const projected = projectExecutedPlan(original, afterArrival, ['chen-huihui']);
    expect(JSON.stringify(projected)).not.toContain(secret);
    expect(projected.turnGoal).toContain('已执行');
    expect(projected.knowledgeEvents).toEqual(original.knowledgeEvents);
    expect(projected.beats.find(beat => beat.locationId === 'supermarket' && beat.speakerIds?.length))
      .toMatchObject({ speakerIds: ['chen-huihui'] });
  });
  it('rewrites a completed attempt when its planned result was never earned', () => {
    const secret = '未在该地点获得的案件结论';
    const completeWithoutReward: ResolvedActionOutcome = {
      ...partial, plannedMinutes: 55, executedMinutes: 55, interruption: undefined, continuation: undefined,
      segments: [{ ...partial.segments[0], plannedMinutes: 55, executedMinutes: 55,
        cumulativeExecutedMinutes: 55, completed: true, step: { ...partial.segments[0].step, completionSourceIds: [] } }],
      completedSourceIds: [],
    };
    const projected = projectExecutedPlan({
      ...plan, turnGoal: secret,
      beats: [{ id: 'secret', purpose: '结论', description: secret }],
      scenePlan: { observeFocus: secret, investigateIntents: [], actionIntents: [] },
    }, completeWithoutReward);
    expect(JSON.stringify(projected)).not.toContain(secret);
    expect(projected.revelations).toEqual([]);
  });
  it('does not attach destination reception to travel-only or event-only projections', () => {
    const travelOnly: ResolvedActionOutcome = {
      ...partial, startLocationId: 'home', endLocationId: 'supermarket', plannedMinutes: 15, executedMinutes: 15,
      segments: [{ step: { id: 'travel', kind: 'travel', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] },
        plannedMinutes: 15, executedMinutes: 15, cumulativeExecutedMinutes: 15, completed: true, staminaDelta: -2 }],
      completedSourceIds: [], interruption: undefined, continuation: undefined,
    };
    const eventOnly: ResolvedActionOutcome = {
      ...travelOnly, startLocationId: 'supermarket', endLocationId: 'supermarket', plannedMinutes: 0, executedMinutes: 0,
      segments: [{ step: { id: 'death-news', kind: 'event', eventId: 'death-news', scope: 'normal',
        locationId: 'supermarket', completionSourceIds: [] }, plannedMinutes: 0, executedMinutes: 0,
        cumulativeExecutedMinutes: 0, completed: true, staminaDelta: 0 }],
    };
    for (const outcome of [travelOnly, eventOnly]) {
      const projected = projectExecutedPlan({ ...plan, beats: [{ id: 'visit', purpose: '接待', description: '店员接待玩家',
        locationId: 'supermarket', speakerIds: ['chen-huihui'] }] }, outcome, ['chen-huihui']);
      expect(projected.beats.every(beat => !beat.locationId && beat.speakerIds?.length === 0)).toBe(true);
    }
  });
  it('returns independent plan objects and never fills an empty input plan by mutation', () => {
    const complete: ResolvedActionOutcome = {
      ...partial, plannedMinutes: 55, executedMinutes: 55, interruption: undefined, continuation: undefined,
      segments: [{ ...partial.segments[0], plannedMinutes: 55, executedMinutes: 55,
        cumulativeExecutedMinutes: 55, completed: true }], completedSourceIds: ['fact:F001:clue'],
    };
    const empty = { ...plan, beats: [] };
    const projectedEmpty = projectExecutedPlan(empty, complete);
    expect(projectedEmpty.beats).toHaveLength(1);
    expect(empty.beats).toEqual([]);

    const original: DirectorPlan = {
      ...plan,
      beats: [{ id: 'done', purpose: '完成', description: '已经完成', speakerIds: ['old-man'] }],
      optionIntents: [{ id: 'next', intent: '下一步', tone: 'calm', expectedPressure: 'low' }],
      assetRequests: ['home-day'],
      knowledgeEvents: [{ eventId: 'meet:old-man', evidence: '见过老人。' }],
      scenePlan: { observeFocus: '房间', investigateIntents: [], actionIntents: [] },
    };
    const projected = projectExecutedPlan(original, { ...complete,
      completedSourceIds: ['fact:F001:clue', 'accepted-event:meet:old-man'] });
    projected.beats[0].speakerIds!.push('detective-a');
    projected.optionIntents[0].intent = '改变';
    projected.assetRequests.push('street');
    projected.knowledgeEvents![0].evidence = '改变';
    projected.scenePlan!.observeFocus = '改变';
    expect(original.beats[0].speakerIds).toEqual(['old-man']);
    expect(original.optionIntents[0].intent).toBe('下一步');
    expect(original.assetRequests).toEqual(['home-day']);
    expect(original.knowledgeEvents![0].evidence).toBe('见过老人。');
    expect(original.scenePlan!.observeFocus).toBe('房间');
  });
  it('exposes exact public time/resources, and no invented death cause', () => {
    const sources = buildActionOutcomeSources(partial);
    expect(JSON.stringify(sources)).toContain('30分钟');
    expect(JSON.stringify(sources)).toContain('96');
    expect(JSON.stringify(sources)).not.toContain('文穗已经死亡');
    const death = { ...partial, executedMinutes: 0, plannedMinutes: 0,
      segments: [{ ...partial.segments[0], step: { id: 'death-news', kind: 'event' as const, eventId: 'death-news' as const,
        scope: 'normal' as const, locationId: 'home', completionSourceIds: [] }, completed: true, executedMinutes: 0 }] };
    expect(JSON.stringify(buildActionOutcomeSources(death))).toContain('警方明确告知玩家文穗已经死亡');
    expect(JSON.stringify(buildActionOutcomeSources(death))).not.toContain('凶手是');
  });
  it('describes resolved outcomes as public Chinese facts instead of writer commands', () => {
    const sources = buildActionOutcomeSources(partial);
    const text = sources.map(source => source.text).join('\n');
    expect(text).toContain('共过去30分钟');
    expect(text).toContain('行动结束时');
    expect(text).not.toMatch(/正文|不得|获准来源|investigation|search/iu);
  });
});
