import { describe, expect, it } from 'vitest';
import { buildActionAuthorityInput, analyzeActionIntentPlan, selectPresentedActionFacts, projectExecutedPlan, buildActionOutcomeSources, type ActionAuthorityContext } from './action-authority';
import { resolveAction, type ResolvedActionOutcome } from '../../engine/action-resolution';
import { resolveActionNarrativeContext } from '../../engine/action-narrative-context';
import { resolvePlayerActionIntent } from '../../engine/player-action-intent';
import type { DirectorPlan, FactReview, WriterPacket } from './types';

const context: ActionAuthorityContext = { cycleCount: 1, startTime: '2024-09-09T08:00:00',
  currentLocationId: 'home', stamina: 100, sanity: 70, originalInput: '调查房间', deathNews: 'untriggered' };
const plan: DirectorPlan = { turnGoal: '调查', tone: 'calm', beats: [], assetRequests: [], optionIntents: [],
  revelations: [{ factId: 'F001', level: 'clue', delivery: 'object' }] };

describe('trusted action input adapter', () => {
  it.each([
    '前往社区便利店向店员陈慧慧打听文穗的去向',
    '前往附近文穗常去的社区便利店询问店员陈慧慧',
  ])('settles the live store choice as travel and inquiry: %s', originalInput => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [] }, {
      ...context, currentLocationId: 'school', originalInput,
    }, 'live-community-store');
    const outcome = resolveAction(input);
    expect(outcome.endLocationId).toBe('supermarket');
    expect(outcome.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: expect.objectContaining({ kind: 'travel', locationId: 'supermarket' }), completed: true }),
      expect.objectContaining({ step: expect.objectContaining({ kind: 'inquiry', locationId: 'supermarket' }), executedMinutes: 55 }),
    ]));
  });

  it('binds an exactly revalidated menu opportunity without treating its private source as a grant', () => {
    const selectedOpportunity = {
      id: 'investigation:c1:F001:atmosphere:home',
      locationId: 'home',
      publicGoal: '检查文穗留下的衣物和随身物品',
      scope: 'normal' as const,
      sourceIds: ['fact:F001:atmosphere'],
      topicKey: 'home:belongings',
    };
    const input = buildActionAuthorityInput({ ...plan, revelations: [] }, {
      ...context,
      originalInput: selectedOpportunity.publicGoal,
      inputOrigin: 'menu',
      selection: {
        opportunityId: selectedOpportunity.id,
        kind: 'investigation',
        scope: 'normal',
        locationId: 'home',
      },
      selectedOpportunity,
    }, 'selected-opportunity');

    expect(input.steps).toEqual([expect.objectContaining({
      opportunityId: selectedOpportunity.id,
      kind: 'investigation',
      scope: 'normal',
      locationId: 'home',
      completionSourceIds: [],
    })]);
  });

  it('accepts sequential school travel and inquiry from the authored possessive destination name', () => {
    const originalInput = '前往文穗的中学向门卫打听情况';
    const proposedScene = resolveActionNarrativeContext(originalInput, new Date(context.startTime), 0, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1,
    });
    const input = buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'travel-school', kind: 'travel', scope: 'short', locationId: 'school' },
      { id: 'ask-guard', kind: 'inquiry', scope: 'normal', locationId: 'school' },
    ] }, { ...context, originalInput, proposedScene }, 'possessive-school');

    expect(proposedScene?.locationId).toBe('school');
    expect(input.steps).toEqual([
      expect.objectContaining({ id: 'travel-school', kind: 'travel', locationId: 'school' }),
      expect.objectContaining({ id: 'ask-guard', kind: 'inquiry', locationId: 'school' }),
    ]);
  });

  it.each([
    { opportunityId: 'stale', kind: 'investigation', scope: 'normal', locationId: 'home' },
    { opportunityId: 'investigation:c1:F001:atmosphere:home', kind: 'investigation', scope: 'deep', locationId: 'home' },
    { opportunityId: 'investigation:c1:F001:atmosphere:home', kind: 'investigation', scope: 'normal', locationId: 'school' },
    { opportunityId: 'investigation:c1:F001:atmosphere:home', kind: 'rest', scope: 'normal', locationId: 'home' },
  ] as const)('rejects a menu opportunity whose metadata does not match the private legal snapshot', (selection) => {
    expect(() => buildActionAuthorityInput({ ...plan, revelations: [] }, {
      ...context,
      inputOrigin: 'menu',
      selection,
      selectedOpportunity: {
        id: 'investigation:c1:F001:atmosphere:home',
        locationId: 'home',
        publicGoal: '检查文穗留下的衣物和随身物品',
        scope: 'normal',
        sourceIds: ['fact:F001:atmosphere'],
        topicKey: 'home:belongings',
      },
    }, 'invalid-selection')).toThrow(/opportunity|机会|匹配|失效/i);
  });
  it('binds a current-location introduction to work there before a later compound destination', () => {
    const proposedScene = resolveActionNarrativeContext('调查便利店', new Date(context.startTime), 0, {
      currentLocationId: 'supermarket', cycleCount: 1, knowledgeEvents: [], enRouteEncounterRoll: 1,
    });
    const input = buildActionAuthorityInput({ ...plan, revelations: [],
      knowledgeEvents: [{ eventId: 'meet:chen-huihui', evidence: '交谈时认出便利店店员陈慧慧。' }],
    }, { ...context, currentLocationId: 'supermarket', originalInput: '先调查便利店，再去学校调查', proposedScene }, 'meeting');
    expect(input.steps.find(step => step.locationId === 'supermarket')?.completionSourceIds).toEqual(['accepted-event:meet:chen-huihui']);
    expect(input.steps.find(step => step.locationId === 'school')?.completionSourceIds).toEqual([]);
  });
  it('gives unqualified rest a program-owned duration even without model prices', () => {
    const text = '休息一会儿';
    const input = buildActionAuthorityInput({ ...plan, revelations: [], timeCostMinutes: 1 }, { ...context, originalInput: text }, 'quiet');
    const outcome = resolveAction(input);
    expect(outcome.executedMinutes).toBe(60);
    expect(outcome.completedSourceIds).toEqual([]);
    expect(outcome.resources.after.stamina).toBe(112);
  });
  it('compresses an unqualified wait to the next known boundary', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], timeCostMinutes: 1 }, {
      ...context,
      originalInput: '等待一会儿',
      quietWaitDecision: {
        kind: 'wait', requestedMinutes: 480, endTime: '2024-09-09T16:00:00',
        boundary: { id: 'death-news', at: '2024-09-09T16:00:00' }, expiringOpportunities: [],
      },
    }, 'quiet-wait');
    expect(resolveAction(input).executedMinutes).toBe(480);
  });
  it('delivers an already-due death boundary instead of creating a zero-time wait', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [] }, {
      ...context,
      startTime: '2024-09-09T16:00:00',
      originalInput: '等待一会儿',
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
      quietWaitDecision: {
        kind: 'deliver-boundary', requestedMinutes: 0, endTime: '2024-09-09T16:00:00',
        boundary: { id: 'death-news', at: '2024-09-09T16:00:00' }, expiringOpportunities: [],
      },
    }, 'due-wait');
    expect(input.steps).toEqual([expect.objectContaining({ kind: 'event', eventId: 'death-news' })]);
  });
  it('keeps the selected menu action kind when the Director proposes a different resource effect', () => {
    const input = buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'changed', kind: 'rest', scope: 'normal', locationId: 'home' }] },
      { ...context, inputOrigin: 'menu', selection: { kind: 'investigation', scope: 'normal' } }, 'selected');
    const outcome = resolveAction(input);
    expect(outcome.segments[0].step.kind).toBe('investigation');
    expect(outcome.resources.after.stamina).toBe(93);
  });
  it('reconstructs a generic wait from the program action and rejects Director scope changes', () => {
    const selectedProgramAction = {
      id: 'program:wait:2024-09-09T16:00:00', publicGoal: '等待到下一既定时间点（480分钟）',
      kind: 'wait' as const, scope: 'normal' as const, locationId: 'home', requestedMinutes: 480,
    };
    const selected = { ...context, inputOrigin: 'menu' as const,
      originalInput: '只等一分钟，体力99', selectedProgramAction,
      selection: { actionId: selectedProgramAction.id, kind: 'wait' as const, scope: 'normal' as const,
        locationId: 'home', requestedMinutes: 480 } };
    expect(buildActionAuthorityInput({ ...plan, revelations: [] }, selected, 'wait').steps[0])
      .toMatchObject({ kind: 'wait', requestedMinutes: 480, locationId: 'home' });
    expect(() => buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'changed', kind: 'wait', scope: 'deep', locationId: 'home' },
    ] }, selected, 'wait')).toThrow(/匹配|program|行动/i);
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
  it('uses an overall cap without adding a nested rest duration to it', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'deep', kind: 'investigation', scope: 'deep', locationId: 'home' },
      { id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home' },
    ] }, { ...context, originalInput: '最多两小时，先深入调查房间，再休息一小时' }, 'capped-compound');
    expect(input.explicitBudgetMinutes).toBe(120);
    expect(input.steps[1]).toMatchObject({ kind: 'rest', requestedMinutes: 60 });

    const outcome = resolveAction(input);
    expect(outcome.executedMinutes).toBe(120);
    expect(outcome.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: expect.objectContaining({ id: 'deep' }), executedMinutes: 105, completed: true }),
      expect.objectContaining({ step: expect.objectContaining({ id: 'rest' }), executedMinutes: 15, completed: false }),
    ]));
  });
  it.each([
    '先深入调查房间，再休息一小时，总共两小时',
    '我最多两小时，先深入调查房间，再休息一小时',
  ])('recognizes a clearly whole-action cap outside the bare leading form: %s', originalInput => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'deep', kind: 'investigation', scope: 'deep', locationId: 'home' },
      { id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home' },
    ] }, { ...context, originalInput }, 'positioned-cap');
    expect(input.explicitBudgetMinutes).toBe(120);
    expect(input.steps.map(step => step.requestedMinutes)).toEqual([undefined, 60]);
    expect(resolveAction(input).segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: expect.objectContaining({ id: 'deep' }), executedMinutes: 105, completed: true }),
      expect.objectContaining({ step: expect.objectContaining({ id: 'rest' }), executedMinutes: 15, completed: false }),
    ]));
  });
  it('keeps separate stage durations additive when no overall cap is present', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home' },
      { id: 'wait', kind: 'wait', scope: 'normal', locationId: 'home' },
    ] }, { ...context, originalInput: '先休息一小时，再等待半小时' }, 'uncapped-compound');
    expect(input.explicitBudgetMinutes).toBe(90);
    expect(input.steps.map(step => step.requestedMinutes)).toEqual([60, 30]);
    expect(resolveAction(input).executedMinutes).toBe(90);
  });
  it('treats a later only-duration as a local stage limit in a compound action', () => {
    const input = buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [
      { id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home' },
      { id: 'wait', kind: 'wait', scope: 'normal', locationId: 'home' },
    ] }, { ...context, originalInput: '先休息十分钟，再只用五分钟等待' }, 'locally-capped-compound');
    expect(input.explicitBudgetMinutes).toBe(15);
    expect(input.steps.map(step => step.requestedMinutes)).toEqual([10, 5]);
    expect(resolveAction(input).executedMinutes).toBe(15);
  });
  it('does not turn a historical time mentioned in a question into a budget', () => {
    expect(buildActionAuthorityInput(plan, { ...context, originalInput: '询问两小时前发生了什么' }, 'r').explicitBudgetMinutes).toBeUndefined();
    expect(buildActionAuthorityInput(plan, { ...context, originalInput: '只用五分钟前的记录核实情况' }, 'r2').explicitBudgetMinutes).toBeUndefined();
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
  it('authorizes the settled reset cause without treating a future plan as a reset', () => {
    expect(buildActionOutcomeSources(partial).some(source => source.id.startsWith('cycle-boundary:'))).toBe(false);
    const midnight = { ...partial, endTime: '2024-09-10T00:00:00' };
    expect(buildActionOutcomeSources(midnight)).toContainEqual(expect.objectContaining({
      id: 'cycle-boundary:partial', text: expect.stringContaining('午夜已到'),
    }));
    const exhausted = { ...partial, resources: { ...partial.resources, after: { stamina: 0, sanity: 70 } } };
    expect(buildActionOutcomeSources(exhausted)).toContainEqual(expect.objectContaining({
      id: 'cycle-boundary:partial', text: expect.stringContaining('体力耗尽'),
    }));
  });
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
    expect(JSON.stringify(buildActionOutcomeSources(death))).toContain('初步死亡通报');
    expect(JSON.stringify(buildActionOutcomeSources(death))).toContain('身份');
    expect(JSON.stringify(buildActionOutcomeSources(death))).not.toContain('文穗已经死亡');
    expect(projectExecutedPlan(plan, death).beats.map(beat => beat.description).join('\n')).toContain('初步死亡通报');
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

it('rejects unresolved explicit travel instead of settling work at the origin', () => {
  expect(() => buildActionAuthorityInput(plan, { ...context, originalInput: '前往未知仓库调查' }, 'unknown')).toThrow(/目的地|意图/);
});
it('rejects a director changing a recognized investigation into waiting', () => {
  expect(() => buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'wrong', kind: 'wait', scope: 'normal', locationId: 'home' }] }, context, 'wrong-kind')).toThrow(/意图|种类/);
});

it('rejects stale bound text and origin while keeping event precedence', () => {
  const playerActionIntent = { version: 1 as const, originalInput: '调查房间', startLocationId: 'home', steps: [{ kind: 'investigation' as const, scope: 'normal' as const, locationId: 'home' }] };
  expect(() => buildActionAuthorityInput(plan, { ...context, originalInput: '休息', playerActionIntent }, 'stale')).toThrow(/失效|修改/);
  expect(() => buildActionAuthorityInput(plan, { ...context, currentLocationId: 'school', playerActionIntent }, 'stale')).toThrow(/失效|修改/);
  expect(buildActionAuthorityInput(plan, { ...context, originalInput: '休息', playerActionIntent, deathNews: 'pending' }, 'event').steps[0].kind).toBe('event');
});
it('prices the bound old-street work and rejects destination changes before projection', () => {
  const originalInput = '前往旧街区向周大爷打听清晨动静';
  const playerActionIntent = { version: 1 as const, originalInput, startLocationId: 'senpai-building', steps: [{ kind: 'inquiry' as const, scope: 'normal' as const, locationId: 'old-man-building', targetNpcIds: ['old-man'] }] };
  const boundContext = { ...context, originalInput, currentLocationId: 'senpai-building', playerActionIntent };
  const outcome = resolveAction(buildActionAuthorityInput({ ...plan, revelations: [], timeCostMinutes: 1 }, boundContext, 'bound'));
  expect(outcome.endLocationId).toBe('old-man-building');
  expect(outcome.segments.at(-1)?.executedMinutes).toBe(55);
  expect(() => buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'wrong', kind: 'inquiry', scope: 'normal', locationId: 'senpai-building' }] }, boundContext, 'bad')).toThrow(/意图|目的地/);
});

it('lets the existing director interpret an unrecognized local action kind', () => {
  const input = buildActionAuthorityInput({ ...plan, actionSteps: [{ id: 'local', kind: 'search', scope: 'normal', locationId: 'home' }] }, { ...context, originalInput: '处理眼前的事情' }, 'ambiguous');
  expect(input.steps[0].kind).toBe('search');
});

it('settles inquiry followed by explicit travel as two separately located stages', () => {
  const input = buildActionAuthorityInput({ ...plan, revelations: [] }, { ...context, originalInput: '打听完情况后前往学校' }, 'inquiry-then-travel');
  expect(input.steps.map(step => ({ kind: step.kind, locationId: step.locationId }))).toEqual([
    { kind: 'inquiry', locationId: 'home' }, { kind: 'travel', locationId: 'school' },
  ]);
});

describe('requested prefix and reviewed follow-up stages', () => {
  const extendedPlan: DirectorPlan = { ...plan, knowledgeEvents: [{ eventId: 'prefix-knowledge', evidence: '原行动实际完成的认知' }], actionSteps: [
    { id: 'requested', kind: 'investigation', scope: 'normal', locationId: 'home' },
    { id: 'follow-up', kind: 'inquiry', scope: 'normal', locationId: 'school' },
  ] };
  const school = resolveActionNarrativeContext('前往学校', new Date(context.startTime), 0, { currentLocationId: 'home', enRouteEncounterRoll: 1 })!;
  it('analyzes an immutable prefix and cross-location follow-up before requiring scene preparation', () => {
    expect(analyzeActionIntentPlan(extendedPlan, context)).toMatchObject({ requestedStepCount: 1, extensionStepCount: 1,
      steps: extendedPlan.actionSteps });
  });
  it('settles both stages and travel without moving original rewards to the suffix', () => {
    const input = buildActionAuthorityInput(extendedPlan, { ...context, sceneContextsByLocation: { school } }, 'follow-up');
    const outcome = resolveAction(input);
    expect(input.steps[0].completionSourceIds).toEqual(['fact:F001:clue', 'accepted-event:prefix-knowledge']);
    expect(input.steps[1].completionSourceIds).toEqual([]);
    expect(outcome.endLocationId).toBe('school');
    expect(outcome.executedMinutes).toBeGreaterThan(110);
    expect(outcome.segments.map(segment => segment.step.kind)).toEqual(['investigation', 'travel', 'inquiry']);
  });
  it('requires a program scene contract for a newly appended destination', () => {
    expect(() => buildActionAuthorityInput(extendedPlan, context, 'missing-scene')).toThrow(/场景/);
  });
  it.each(['rest', 'wait', 'event'] as const)('does not let an extension create a %s effect', kind => {
    expect(() => analyzeActionIntentPlan({ ...extendedPlan, actionSteps: [extendedPlan.actionSteps![0],
      { id: 'forbidden', kind, scope: 'normal', locationId: 'home' }] }, context)).toThrow();
  });
  it('does not permit a trip before the required local work', () => {
    expect(() => analyzeActionIntentPlan({ ...extendedPlan, actionSteps: [
      { id: 'detour', kind: 'travel', scope: 'normal', locationId: 'school' }, ...extendedPlan.actionSteps!,
    ] }, context)).toThrow(/意图|前缀|目的地/);
  });
  it('keeps a quiet player action closed to appended work', () => {
    expect(() => analyzeActionIntentPlan({ ...plan, actionSteps: [
      { id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home' },
      { id: 'work', kind: 'investigation', scope: 'normal', locationId: 'home' },
    ] }, { ...context, originalInput: '休息' })).toThrow();
  });
  it('binds a new-location arrival event to arrival, leaving original knowledge on the prefix', () => {
    const store = resolveActionNarrativeContext('前往便利店', new Date(context.startTime), 0, { currentLocationId: 'home', enRouteEncounterRoll: 1 })!;
    const input = buildActionAuthorityInput({ ...extendedPlan,
      knowledgeEvents: [...extendedPlan.knowledgeEvents!, ...store.sceneContract.requiredKnowledgeEvents],
      actionSteps: [extendedPlan.actionSteps![0], { id: 'store', kind: 'inquiry', scope: 'normal', locationId: 'supermarket' }],
    }, { ...context, sceneContextsByLocation: { supermarket: store } }, 'store-arrival');
    expect(input.steps[0].completionSourceIds).toEqual(['fact:F001:clue', 'accepted-event:prefix-knowledge']);
    expect(input.steps.find(step => step.kind === 'travel')?.completionSourceIds).toEqual(['accepted-event:meet:chen-huihui']);
    expect(input.steps.at(-1)?.completionSourceIds).toEqual([]);
  });
  it('does not paint an interrupted second trip as reception at the overall start', () => {
    const outcome = resolveAction({ id: 'multileg', cycleCount: 1, startTime: context.startTime,
      currentLocationId: 'home', stamina: 100, sanity: 70, explicitBudgetMinutes: 76,
      steps: [{ id: 'first', kind: 'inquiry', scope: 'normal', locationId: 'school', completionSourceIds: [] },
        { id: 'second', kind: 'inquiry', scope: 'normal', locationId: 'old-man-building', completionSourceIds: [] }] });
    expect(outcome.segments.at(-1)).toMatchObject({ step: { kind: 'travel' }, completed: false });
    expect(outcome.endLocationId).toBe('school');
    const projected = projectExecutedPlan({ ...plan, revelations: [] }, outcome);
    const travelBeats = projected.beats.filter(beat => beat.description.includes('路程'));
    expect(travelBeats.every(beat => !beat.locationId || beat.locationId === 'street')).toBe(true);
  });
});

it('keeps an initial-location introduction on the original work even if the suffix returns there', () => {
  const originalInput = '向陈慧慧询问';
  const store = resolveActionNarrativeContext('调查便利店', new Date(context.startTime), 0, { currentLocationId: 'supermarket', enRouteEncounterRoll: 1 })!;
  const school = resolveActionNarrativeContext('前往学校', new Date(context.startTime), 0, { currentLocationId: 'supermarket', enRouteEncounterRoll: 1 })!;
  const input = buildActionAuthorityInput({ ...plan, revelations: [], knowledgeEvents: store.sceneContract.requiredKnowledgeEvents,
    actionSteps: [{ id: 'original', kind: 'inquiry', scope: 'normal', locationId: 'supermarket' },
      { id: 'follow', kind: 'inquiry', scope: 'normal', locationId: 'school' },
      { id: 'return', kind: 'inquiry', scope: 'normal', locationId: 'supermarket' }],
  }, { ...context, originalInput, currentLocationId: 'supermarket', proposedScene: store, sceneContextsByLocation: { school, supermarket: store } }, 'round-trip');
  expect(input.steps[0].completionSourceIds).toEqual(['accepted-event:meet:chen-huihui']);
  expect(input.steps.slice(1).flatMap(step => step.completionSourceIds)).toEqual([]);
});

it('keeps an explicit stay-put restriction over cross-location extensions', () => {
  expect(() => analyzeActionIntentPlan({ ...plan, actionSteps: [
    { id: 'asked', kind: 'inquiry', scope: 'short', locationId: 'school' },
    { id: 'follow', kind: 'inquiry', scope: 'normal', locationId: 'old-man-building' },
  ] }, { ...context, currentLocationId: 'school', originalInput: '只向门卫问一句，不离开学校' })).toThrow(/离开|原地|限制/);
});

it.each([
  ['只向门卫询问，不做其他调查', 'school'],
  ['只在学校询问门卫', 'old-man-building'],
])('respects explicit extension limits: %s', (originalInput, destination) => {
  expect(() => analyzeActionIntentPlan({ ...plan, actionSteps: [
    { id: 'requested', kind: 'inquiry', scope: 'normal', locationId: 'school' },
    { id: 'extra', kind: 'investigation', scope: 'normal', locationId: destination },
  ] }, { ...context, currentLocationId: 'school', originalInput })).toThrow(/限制|追加|原地/);
});

it('lets an unpriced bound inquiry use the same inferred depth as free input', () => {
  const originalInput = '向门卫核实文穗的去向';
  const base = { ...context, originalInput, currentLocationId: 'school' };
  const playerActionIntent = resolvePlayerActionIntent(originalInput, 'school', new Date(context.startTime))!;
  const shortPlan: DirectorPlan = { ...plan, revelations: [], actionSteps: [{ id: 'question', kind: 'inquiry', scope: 'short', locationId: 'school' }] };
  const free = buildActionAuthorityInput(shortPlan, base, 'same-depth');
  const bound = buildActionAuthorityInput(shortPlan, { ...base, playerActionIntent }, 'same-depth');
  expect(bound).toEqual(free);
  expect(resolveAction(bound).executedMinutes).toBe(25);
});

it.each(['简短询问门卫', '深入询问门卫', '按普通强度询问门卫'])('preserves an explicitly requested depth: %s', originalInput => {
  const playerActionIntent = resolvePlayerActionIntent(originalInput, 'school', new Date(context.startTime))!;
  const wrongScope = playerActionIntent.steps[0].scope === 'short' ? 'normal' : 'short';
  expect(() => buildActionAuthorityInput({ ...plan, revelations: [], actionSteps: [{ id: 'question', kind: 'inquiry', scope: wrongScope, locationId: 'school' }] },
    { ...context, originalInput, currentLocationId: 'school', playerActionIntent }, 'wrong-depth')).toThrow();
});

it('preserves each completed journey encounter when later work is interrupted', () => {
  const input = { id: 'two-arrivals', cycleCount: 1, startTime: context.startTime,
    currentLocationId: 'home', stamina: 100, sanity: 70,
    steps: [{ id: 'school-work', kind: 'inquiry' as const, scope: 'normal' as const, locationId: 'school', completionSourceIds: [] },
      { id: 'store-work', kind: 'inquiry' as const, scope: 'normal' as const, locationId: 'supermarket', completionSourceIds: [] }] };
  const whole = resolveAction(input);
  const partial = resolveAction({ ...input, explicitBudgetMinutes: whole.executedMinutes - 1 });
  const school = resolveActionNarrativeContext('前往学校', new Date(context.startTime), 0, { currentLocationId: 'home', enRouteEncounterRoll: 0 })!;
  const store = resolveActionNarrativeContext('前往便利店', new Date(context.startTime), 0, { currentLocationId: 'school', enRouteEncounterRoll: 0 })!;
  const projected = projectExecutedPlan({ ...plan, revelations: [] }, partial, [], {}, [school.sceneContract, store.sceneContract]);
  expect(projected.beats.filter(beat => beat.id.startsWith('executed:en-route:'))).toHaveLength(2);
  for (const segmentIndex of [0, 2]) {
    const encounter = projected.beats.findIndex(beat => beat.id === `executed:en-route:${segmentIndex}`);
    const arrival = projected.beats.findIndex(beat => beat.id === `executed:${segmentIndex}`);
    expect(encounter).toBeGreaterThanOrEqual(0);
    expect(encounter).toBeLessThan(arrival);
  }
  const resumedJourney = { ...partial, segments: partial.segments.map((segment, index) => index === 0
    ? { ...segment, cumulativeExecutedMinutes: segment.executedMinutes + 1 } : segment) };
  const resumed = projectExecutedPlan({ ...plan, revelations: [] }, resumedJourney, [], {}, [school.sceneContract, store.sceneContract]);
  expect(resumed.beats.filter(beat => beat.id.startsWith('executed:en-route:')).map(beat => beat.id)).toEqual(['executed:en-route:2']);
});
