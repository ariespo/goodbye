import { describe, expect, it } from 'vitest';
import {
  quoteActionSteps,
  resolveAction,
  type ActionStep,
  type ResolveActionInput,
} from './action-resolution';

const deepStep: ActionStep = {
  id: 'work',
  kind: 'investigation',
  scope: 'deep',
  locationId: 'school',
  completionSourceIds: ['fact:school-result'],
};

const deepInput: ResolveActionInput = {
  id: 'test-action',
  cycleCount: 3,
  startTime: '2024-09-09T15:30:00',
  currentLocationId: 'school',
  stamina: 100,
  sanity: 70,
  steps: [deepStep],
};

describe('quoteActionSteps', () => {
  it.each([
    ['short', 25, 3],
    ['normal', 55, 7],
    ['deep', 105, 14],
  ] as const)('quotes %s inquiry work from program rates', (scope, minutes, stamina) => {
    const step: ActionStep = {
      id: `inquiry-${scope}`,
      kind: 'inquiry',
      scope,
      locationId: 'home',
      completionSourceIds: [],
    };

    expect(quoteActionSteps({ currentLocationId: 'home', steps: [step] })).toEqual({
      workMinutes: minutes,
      travelMinutes: 0,
      totalMinutes: minutes,
      staminaCost: stamina,
    });
  });

  it.each([
    ['short', 6],
    ['normal', 14],
    ['deep', 24],
  ] as const)('quotes %s physical search stamina independently of inquiry rates', (scope, staminaCost) => {
    expect(quoteActionSteps({
      currentLocationId: 'home',
      steps: [{ id: `search-${scope}`, kind: 'search', scope, locationId: 'home', completionSourceIds: [] }],
    }).staminaCost).toBe(staminaCost);
  });

  it('adds each actual travel leg once and shares arrival across work at one destination', () => {
    const steps: ActionStep[] = [
      { id: 'school-interview', kind: 'inquiry', scope: 'normal', locationId: 'school', completionSourceIds: [] },
      { id: 'school-search', kind: 'search', scope: 'short', locationId: 'school', completionSourceIds: [] },
      { id: 'store-interview', kind: 'inquiry', scope: 'short', locationId: 'supermarket', completionSourceIds: [] },
    ];

    expect(quoteActionSteps({ currentLocationId: 'home', steps })).toEqual({
      workMinutes: 105,
      travelMinutes: 20,
      totalMinutes: 125,
      staminaCost: 24,
    });
  });

  it('treats an explicit map travel step as the leg instead of adding it twice', () => {
    const steps: ActionStep[] = [
      { id: 'go-school', kind: 'travel', scope: 'short', locationId: 'school', completionSourceIds: [] },
      { id: 'ask-guard', kind: 'inquiry', scope: 'normal', locationId: 'school', completionSourceIds: [] },
    ];

    expect(quoteActionSteps({ currentLocationId: 'home', steps })).toEqual({
      workMinutes: 55,
      travelMinutes: 10,
      totalMinutes: 65,
      staminaCost: 11,
    });
  });
});

describe('resolveAction', () => {
  it('stops work at death news without its completion reward or sanity penalty', () => {
    const result = resolveAction({
      ...deepInput,
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });

    expect(result.executedMinutes).toBe(30);
    expect(result.endTime).toBe('2024-09-09T16:00:00');
    expect(result.resources.after).toEqual({ stamina: 96, sanity: 70 });
    expect(result.completedSourceIds).toEqual([]);
    expect(result.interruption).toEqual({ id: 'death-news', at: '2024-09-09T16:00:00' });
    expect(result.continuation?.completedMinutesByStep.work).toBe(30);
  });

  it('a five-minute budget cannot buy a full deep investigation', () => {
    const result = resolveAction({ ...deepInput, explicitBudgetMinutes: 5 });

    expect(result.executedMinutes).toBe(5);
    expect(result.resources.after.stamina).toBe(99);
    expect(result.completedSourceIds).toEqual([]);
    expect(result.continuation?.activeStepId).toBe('work');
  });

  it('treats an explicit allowance as an aggregate maximum without filler', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T08:00:00',
      explicitBudgetMinutes: 120,
      steps: [
        { id: 'preliminary', kind: 'inquiry', scope: 'short', locationId: 'school', completionSourceIds: ['fact:preliminary'] },
        deepStep,
      ],
    });

    expect(result.plannedMinutes).toBe(130);
    expect(result.executedMinutes).toBe(120);
    expect(result.completedSourceIds).toEqual(['fact:preliminary']);
    expect(result.continuation?.completedMinutesByStep).toMatchObject({ preliminary: 25, work: 95 });
  });

  it('preserves partial travel and conserves its cost across resume', () => {
    const first = resolveAction({
      ...deepInput,
      id: 'travel-action',
      startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home',
      steps: [{ id: 'ask-clerk', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: ['fact:clerk'] }],
      nextBoundary: { id: 'appointment:test', at: '2024-09-09T08:08:00' },
    });

    expect(first.endLocationId).toBe('home');
    expect(first.resources.after.stamina).toBe(97);
    expect(first.completedSourceIds).toEqual([]);
    expect(first.continuation?.activeStepId).toMatch(/^__travel__:/);
    expect(quoteActionSteps({
      currentLocationId: first.endLocationId,
      steps: first.continuation!.steps,
      continuation: first.continuation,
    })).toEqual({ workMinutes: 55, travelMinutes: 7, totalMinutes: 62, staminaCost: 9 });

    const resumed = resolveAction({
      id: 'travel-action',
      cycleCount: 3,
      startTime: first.endTime,
      currentLocationId: first.endLocationId,
      stamina: first.resources.after.stamina,
      sanity: first.resources.after.sanity,
      steps: first.continuation!.steps,
      continuation: first.continuation,
    });

    expect(resumed.executedMinutes).toBe(62);
    expect(resumed.endLocationId).toBe('supermarket');
    expect(resumed.resources.after.stamina).toBe(88);
    expect(resumed.completedSourceIds).toEqual(['fact:clerk']);
    expect(resumed.continuation).toBeUndefined();
  });

  it('records a milestone that completes exactly at a scheduled boundary', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T15:05:00',
      steps: [{ ...deepStep, scope: 'normal' }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });

    expect(result.executedMinutes).toBe(55);
    expect(result.completedSourceIds).toEqual(['fact:school-result']);
    expect(result.interruption).toBeUndefined();
    expect(result.continuation).toBeUndefined();
  });

  it('does not carry an unfinished action through midnight', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T23:30:00',
      nextBoundary: { id: 'midnight', at: '2024-09-10T00:00:00' },
    });

    expect(result.executedMinutes).toBe(30);
    expect(result.completedSourceIds).toEqual([]);
    expect(result.interruption?.id).toBe('midnight');
    expect(result.continuation).toBeUndefined();
  });

  it('keeps a budget-limited continuation when midnight is only a future boundary', () => {
    const first = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T17:00:00',
      explicitBudgetMinutes: 5,
      nextBoundary: { id: 'midnight', at: '2024-09-10T00:00:00' },
    });

    expect(first.endTime).toBe('2024-09-09T17:05:00');
    expect(first.interruption?.id).toBe('explicit-budget');
    expect(first.continuation?.completedMinutesByStep.work).toBe(5);
    expect(first.resources.after.stamina).toBe(99);

    const resumed = resolveAction({
      ...deepInput,
      startTime: first.endTime,
      stamina: first.resources.after.stamina,
      sanity: first.resources.after.sanity,
      steps: first.continuation!.steps,
      continuation: first.continuation,
      nextBoundary: { id: 'midnight', at: '2024-09-10T00:00:00' },
    });

    expect(resumed.executedMinutes).toBe(100);
    expect(resumed.resources.after.stamina).toBe(86);
    expect(resumed.completedSourceIds).toEqual(['fact:school-result']);
    expect(resumed.continuation).toBeUndefined();
  });

  it('rejects stale or altered continuations', () => {
    const first = resolveAction({ ...deepInput, explicitBudgetMinutes: 30 });
    const continuation = first.continuation!;
    const resume = {
      ...deepInput,
      startTime: first.endTime,
      stamina: first.resources.after.stamina,
      steps: continuation.steps,
      continuation,
    };

    expect(() => resolveAction({ ...resume, cycleCount: 4 })).toThrow(/cycle/i);
    expect(() => resolveAction({ ...resume, currentLocationId: 'home' })).toThrow(/location/i);
    expect(() => resolveAction({ ...resume, startTime: '2024-09-09T15:00:00' })).toThrow(/clock/i);
    expect(() => resolveAction({ ...resume, steps: [{ ...continuation.steps[0], scope: 'normal' }] })).toThrow(/digest/i);
  });

  it('applies cycle-scoped death and fantasy effects once', () => {
    const deathStep: ActionStep = {
      id: 'deliver-death-news', kind: 'event', eventId: 'death-news', scope: 'short',
      locationId: 'school', completionSourceIds: ['event:death-news'],
    };
    const death = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T16:00:00',
      steps: [deathStep],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    expect(death.executedMinutes).toBe(0);
    expect(death.resources.after.sanity).toBe(58);
    expect(death.completedSourceIds).toEqual(['event:death-news']);
    expect(death.eventEffectIds).toEqual(['death-news:cycle:3']);
    expect(death.interruption).toBeUndefined();

    const repeated = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T16:00:00',
      steps: [deathStep],
      appliedEventEffectIds: death.eventEffectIds,
    });
    expect(repeated.resources.after.sanity).toBe(70);
    expect(repeated.eventEffectIds).toEqual([]);

    const fantasy = resolveAction({
      ...deepInput,
      id: 'fantasy-action',
      startTime: '2024-09-09T08:00:00',
      steps: [{ id: 'fantasy', kind: 'fantasy', eventId: 'fantasy', scope: 'short', locationId: 'school', completionSourceIds: [] }],
    });
    expect(fantasy.executedMinutes).toBe(25);
    expect(fantasy.resources.after.sanity).toBe(62);
    expect(fantasy.eventEffectIds).toEqual(['fantasy:cycle:3']);
  });

  it('executes a reached zero-minute event after the time budget is exhausted', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T08:00:00',
      explicitBudgetMinutes: 25,
      steps: [
        { id: 'ask', kind: 'inquiry', scope: 'short', locationId: 'school', completionSourceIds: [] },
        { id: 'news', kind: 'event', eventId: 'death-news', scope: 'short', locationId: 'school', completionSourceIds: ['event:death-news'] },
      ],
    });

    expect(result.executedMinutes).toBe(25);
    expect(result.completedSourceIds).toEqual(['event:death-news']);
    expect(result.eventEffectIds).toEqual(['death-news:cycle:3']);
  });

  it('does not replay a completed zero-minute event when later work resumes', () => {
    const steps: ActionStep[] = [
      { id: 'news', kind: 'event', eventId: 'death-news', scope: 'short', locationId: 'school', completionSourceIds: ['event:death-news'] },
      { id: 'work-after-news', kind: 'inquiry', scope: 'short', locationId: 'school', completionSourceIds: ['fact:after-news'] },
    ];
    const first = resolveAction({ ...deepInput, startTime: '2024-09-09T16:00:00', steps, explicitBudgetMinutes: 5 });
    expect(first.completedSourceIds).toEqual(['event:death-news']);

    const resumed = resolveAction({
      ...deepInput,
      startTime: first.endTime,
      stamina: first.resources.after.stamina,
      sanity: first.resources.after.sanity,
      steps: first.continuation!.steps,
      continuation: first.continuation,
      appliedEventEffectIds: first.eventEffectIds,
    });

    expect(resumed.completedSourceIds).toEqual(['fact:after-news']);
    expect(resumed.eventEffectIds).toEqual([]);
  });

  it('restores twelve stamina per hour and caps the result at 120', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T08:00:00',
      stamina: 110,
      steps: [{ id: 'rest', kind: 'rest', scope: 'short', locationId: 'school', requestedMinutes: 120, completionSourceIds: [] }],
    });

    expect(result.executedMinutes).toBe(120);
    expect(result.segments[0].staminaDelta).toBe(10);
    expect(result.resources.after.stamina).toBe(120);
  });

  it('allows a deliberate long wait but stops it at the disclosed boundary', () => {
    const result = resolveAction({
      ...deepInput,
      startTime: '2024-09-09T08:00:00',
      steps: [{ id: 'wait', kind: 'wait', scope: 'short', locationId: 'school', requestedMinutes: 300, completionSourceIds: [] }],
      nextBoundary: { id: 'appointment:noon', at: '2024-09-09T12:00:00' },
    });

    expect(result.executedMinutes).toBe(240);
    expect(result.endTime).toBe('2024-09-09T12:00:00');
    expect(result.continuation?.completedMinutesByStep.wait).toBe(240);
  });

  it.each([
    ['duplicate step IDs', { ...deepInput, steps: [deepStep, deepStep] }],
    ['unknown location', { ...deepInput, currentLocationId: 'police_station' }],
    ['non-finite budget', { ...deepInput, explicitBudgetMinutes: Number.NaN }],
    ['wrong event identity', { ...deepInput, steps: [{ ...deepStep, kind: 'event', eventId: 'fantasy' }] }],
  ])('rejects invalid authority input: %s', (_label, input) => {
    expect(() => resolveAction(input as ResolveActionInput)).toThrow();
  });

  it('derives a stable resolution id from the validated attempt', () => {
    const first = resolveAction({ ...deepInput, explicitBudgetMinutes: 5 });
    const retry = resolveAction({ ...deepInput, explicitBudgetMinutes: 5 });
    const later = resolveAction({ ...deepInput, startTime: '2024-09-09T15:31:00', explicitBudgetMinutes: 5 });

    expect(retry.id).toBe(first.id);
    expect(later.id).not.toBe(first.id);
  });

  it('validates both the supplied steps and the saved continuation steps against the digest', () => {
    const first = resolveAction({ ...deepInput, explicitBudgetMinutes: 30 });
    const continuation = first.continuation!;

    expect(() => resolveAction({
      ...deepInput,
      startTime: first.endTime,
      stamina: first.resources.after.stamina,
      steps: continuation.steps,
      continuation: {
        ...continuation,
        steps: [{ ...continuation.steps[0], scope: 'normal' }],
      },
    })).toThrow(/digest/i);
  });

  it('rejects a continuation quote with a forged cumulative charge', () => {
    const first = resolveAction({ ...deepInput, explicitBudgetMinutes: 30 });
    const continuation = first.continuation!;

    expect(() => quoteActionSteps({
      currentLocationId: first.endLocationId,
      steps: continuation.steps,
      continuation: {
        ...continuation,
        chargedStaminaByStep: { ...continuation.chargedStaminaByStep, work: -1 },
      },
    })).toThrow(/charge/i);
  });
});
