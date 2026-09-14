import { describe, expect, it } from 'vitest';
import { buildPlayerKnowledgeBrief } from '../data/playerKnowledge';
import { createFactAliasTable } from '../agents/mystery/fact-aliases';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import type { TruthContext } from '../agents/mystery/types';
import {
  buildInvestigationOpportunities,
  findInvestigationOpportunity,
  projectPublicInvestigationOpportunities,
  settleOpportunityProgress,
  type InvestigationOpportunity,
  type OpportunityProgress,
} from './investigation-opportunities';
import type { ResolvedActionOutcome } from './action-resolution';

const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);

function progress(cycleCount: number, overrides: Partial<OpportunityProgress> = {}): OpportunityProgress {
  return {
    cycleCount,
    completedIds: [],
    noProgressByTopic: {},
    ...overrides,
  };
}

function context(overrides: Partial<TruthContext> = {}): TruthContext {
  return {
    cycleCount: 1,
    currentLocation: 'home',
    lockedRoute: null,
    unlockedClueIds: [],
    playerKnowledge: {},
    suspicion: {},
    activeNpcIds: [],
    playerPresentation: buildPlayerKnowledgeBrief({ location: 'home' }),
    ...overrides,
  };
}

function withTravel(...ids: string[]): TruthContext['playerPresentation'] {
  return {
    locations: ids.map(id => ({ id, stage: 'located', name: id, canTravel: true })),
    entities: [],
    namingRules: [],
    allowedDiscoveries: [],
  };
}

function hasFactOpportunity(overrides: Partial<TruthContext>, factId: string): boolean {
  const alias = aliases.factIdToAlias[factId];
  return buildInvestigationOpportunities({
    graph: MYSTERY_TRUTH_GRAPH,
    context: context(overrides),
    progress: progress(overrides.cycleCount ?? 1),
  }).some(opportunity => opportunity.sourceIds.some(source => source.startsWith(`fact:${alias}:`)));
}

describe('buildInvestigationOpportunities', () => {
  it('offers a public home search from the legal day-one brief', () => {
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context(),
      progress: progress(1),
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: 'home',
        publicGoal: '检查文穗留下的衣物和随身物品',
        scope: 'short',
        sourceIds: ['fact:F001:atmosphere'],
      }),
    ]));
  });

  it('offers the real day-one school absence milestone without day-two school facts', () => {
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context(),
      progress: progress(1),
    });
    const school = opportunities.find(opportunity => opportunity.locationId === 'school');

    expect(school).toMatchObject({
      publicGoal: '向门卫确认文穗今天是否到校',
      scope: 'normal',
      sourceIds: [`fact:${aliases.factIdToAlias['shared-school-absence']}:atmosphere`],
    });
    expect(opportunities.flatMap(opportunity => opportunity.sourceIds)).not.toContain(
      `fact:${aliases.factIdToAlias['shared-male-leave-call']}:atmosphere`,
    );
    expect(opportunities.flatMap(opportunity => opportunity.sourceIds)).not.toContain(
      `fact:${aliases.factIdToAlias['shared-nurse-school-inquiry']}:atmosphere`,
    );
  });

  it('offers a newer legal level but omits an already-known equal level', () => {
    const dayTwo = context({ cycleCount: 2, currentLocation: 'school' });
    const initial = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: dayTwo,
      progress: progress(2),
    }).find(opportunity => opportunity.sourceIds.includes('fact:F002:hint'))!;
    const knownHint = context({
      cycleCount: 2,
      currentLocation: 'school',
      playerKnowledge: { 'shared-school-absence': 'hint' },
    });

    const repeated = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: knownHint,
      progress: progress(2, { completedIds: [initial.id] }),
    });
    const laterUpgrade = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({
        cycleCount: 4,
        currentLocation: 'school',
        playerKnowledge: { 'shared-school-absence': 'hint' },
      }),
      progress: progress(4),
    });

    expect(repeated.some(opportunity => opportunity.sourceIds.includes('fact:F002:hint'))).toBe(false);
    expect(laterUpgrade).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceIds: ['fact:F002:clue'] }),
    ]));
  });

  it('offers distinct public school actions for the legal day-two milestones', () => {
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({ cycleCount: 2, currentLocation: 'school' }),
      progress: progress(2),
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        publicGoal: '核对文穗的请假记录',
        scope: 'short',
        sourceIds: ['fact:F003:hint'],
      }),
      expect.objectContaining({
        publicGoal: '询问是否还有其他人来找过文穗',
        scope: 'normal',
        sourceIds: ['fact:F004:hint'],
      }),
    ]));
    const published = JSON.stringify(projectPublicInvestigationOpportunities(opportunities));
    expect(published).not.toContain('林静');
    expect(published).not.toContain('社区医院临时工牌');
  });

  it('keeps an exhausted unearned attempt executable but ranks a fresh topic first', () => {
    const baseInput = {
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({ cycleCount: 2, currentLocation: 'school' }),
      progress: progress(2),
    };
    const initial = buildInvestigationOpportunities(baseInput);
    const attendance = initial.find(opportunity => opportunity.sourceIds.includes('fact:F002:hint'))!;
    const ranked = buildInvestigationOpportunities({
      ...baseInput,
      progress: progress(2, { noProgressByTopic: { [attendance.topicKey]: 2 } }),
    });

    expect(ranked[0].topicKey).not.toBe(attendance.topicKey);
    expect(ranked.some(opportunity => opportunity.id === attendance.id)).toBe(true);
  });

  it('ranks an affordable action that completes before the next event first', () => {
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({ cycleCount: 2, currentLocation: 'school' }),
      progress: progress(2),
      currentTime: '2024-09-09T15:30:00',
      stamina: 4,
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });

    expect(opportunities[0]).toMatchObject({
      scope: 'short',
      sourceIds: ['fact:F003:hint'],
    });
  });

  it('offers a water-tower search only when that destination is publicly travelable', () => {
    const hidden = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({ cycleCount: 2 }),
      progress: progress(2),
    });
    const visible = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({
        cycleCount: 2,
        currentLocation: 'home',
        playerPresentation: {
          locations: [{ id: 'water-tower', stage: 'located', name: '废弃水塔', canTravel: true }],
          entities: [],
          namingRules: [],
          allowedDiscoveries: [],
        },
      }),
      progress: progress(2),
    });

    expect(hidden.some(opportunity => opportunity.locationId === 'water-tower')).toBe(false);
    expect(visible).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: 'water-tower',
        publicGoal: '检查水塔内可见的生活痕迹和遗留物',
        sourceIds: ['fact:F005:hint'],
      }),
    ]));
  });

  it('uses public questions for the legal mountain and supermarket leads', () => {
    const destinations = [
      { id: 'mountain-trail', stage: 'located' as const, name: '黔灵山脚步道', canTravel: true },
      { id: 'supermarket', stage: 'located' as const, name: '社区便利店', canTravel: true },
    ];
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({
        cycleCount: 2,
        playerPresentation: {
          locations: destinations,
          entities: [],
          namingRules: [],
          allowedDiscoveries: [],
        },
      }),
      progress: progress(2),
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: 'mountain-trail',
        publicGoal: '沿山路询问当天见过文穗的人',
        sourceIds: ['fact:F006:hint'],
      }),
      expect.objectContaining({
        locationId: 'supermarket',
        publicGoal: '向店员询问文穗最近是否来过便利店',
        sourceIds: ['fact:F007:hint'],
      }),
    ]));
  });

  it('offers the legal day-two bedroom search after the shared opening leads are known', () => {
    const opportunities = buildInvestigationOpportunities({
      graph: MYSTERY_TRUTH_GRAPH,
      context: context({
        cycleCount: 2,
        playerKnowledge: {
          'shared-apron-missing': 'atmosphere',
          'red-herring-part-time-job': 'hint',
        },
      }),
      progress: progress(2),
    });

    expect(opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        locationId: 'home',
        publicGoal: '仔细检查卧室抽屉和夹层',
        sourceIds: [expect.stringMatching(/^fact:F\d+:hint$/)],
      }),
    ]));
  });

  it.each([
    ['A first', 'a-sacrifice-list', { cycleCount: 3, suspicion: { 'old-man': 26 }, playerPresentation: withTravel('old-man-building') }],
    ['A middle', 'a-lured-inside', { cycleCount: 4, suspicion: { 'old-man': 26 }, unlockedClueIds: ['a-sacrifice-list'], playerKnowledge: { 'a-sacrifice-list': 'clue' }, playerPresentation: withTravel('old-man-building') }],
    ['A final', 'a-murder-staged-fall', { cycleCount: 5, lockedRoute: 'A', suspicion: { 'old-man': 50 }, unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'], playerKnowledge: { 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' }, playerPresentation: withTravel('old-man-building') }],
    ['B first', 'b-water-tower-blood', { cycleCount: 3, suspicion: { 'detective-a': 26 }, playerPresentation: withTravel('water-tower') }],
    ['B middle', 'b-detective-coverup', { cycleCount: 4, suspicion: { 'detective-a': 50 }, unlockedClueIds: ['b-water-tower-blood'], playerKnowledge: { 'b-water-tower-blood': 'clue' }, playerPresentation: withTravel('water-tower') }],
    ['B final', 'b-accidental-killing', { cycleCount: 5, lockedRoute: 'B', suspicion: { 'detective-a': 50 }, unlockedClueIds: ['b-water-tower-blood', 'b-detective-coverup'], playerKnowledge: { 'b-water-tower-blood': 'clue', 'b-detective-coverup': 'clue' }, playerPresentation: withTravel('water-tower') }],
    ['C first', 'c-player-made-leave-call', { cycleCount: 4, suspicion: { self: 30 }, unlockedClueIds: ['shared-male-leave-call'], playerKnowledge: { 'shared-male-leave-call': 'clue' } }],
    ['C middle', 'c-loop-is-reenactment', { cycleCount: 4, suspicion: { self: 40 } }],
    ['C final', 'c-player-killed-fumi', { cycleCount: 5, lockedRoute: 'C', suspicion: { self: 50 }, unlockedClueIds: ['c-player-made-leave-call', 'c-loop-is-reenactment'], playerKnowledge: { 'c-player-made-leave-call': 'clue', 'c-loop-is-reenactment': 'clue' } }],
    ['NONE second', 'none-letter-water-tower', { cycleCount: 3, unlockedClueIds: ['none-letter-bedroom'], playerKnowledge: { 'none-letter-bedroom': 'clue' }, playerPresentation: withTravel('water-tower') }],
    ['NONE third', 'none-letter-door-gap', { cycleCount: 4, unlockedClueIds: ['none-letter-bedroom', 'none-letter-water-tower'], playerKnowledge: { 'none-letter-bedroom': 'clue', 'none-letter-water-tower': 'clue' } }],
    ['NONE final', 'none-accidental-goodbye', { cycleCount: 5, lockedRoute: 'NONE', tripProgress: 100, unlockedClueIds: ['none-letter-bedroom', 'none-letter-water-tower', 'none-letter-door-gap'], playerKnowledge: { 'none-letter-bedroom': 'clue', 'none-letter-water-tower': 'clue', 'none-letter-door-gap': 'clue' }, playerPresentation: withTravel('observation-deck') }],
    ['FAKE body', 'fake-body-mismatch', { cycleCount: 3, playerPresentation: withTravel('community-hospital') }],
    ['FAKE ticket', 'fake-alias-ticket', { cycleCount: 3 }],
    ['FAKE savings', 'fake-empty-savings', { cycleCount: 3, playerPresentation: withTravel('supermarket') }],
    ['FAKE sighting', 'fake-postdeath-sighting', { cycleCount: 4, playerPresentation: withTravel('mountain-trail') }],
    ['FAKE request', 'fake-touko-request', { cycleCount: 4, affinity: { touko: 80 }, playerPresentation: withTravel('senpai-building') }],
    ['FAKE final', 'fake-staged-death-escape', { cycleCount: 5, lockedRoute: 'FAKE', unlockedClueIds: ['fake-body-mismatch', 'fake-alias-ticket', 'fake-empty-savings'], playerKnowledge: { 'fake-body-mismatch': 'clue', 'fake-alias-ticket': 'clue', 'fake-empty-savings': 'clue' }, playerPresentation: withTravel('observation-deck') }],
  ] as Array<[string, string, Partial<TruthContext>]>)('catalogs the legal %s milestone through the real brief gate', (_name, factId, overrides) => {
    expect(hasFactOpportunity(overrides, factId)).toBe(true);
  });

  it('recovers an exact same-cycle authored opportunity even after its level is known', () => {
    const initialContext = context({ cycleCount: 2, currentLocation: 'school' });
    const input = {
      graph: MYSTERY_TRUTH_GRAPH,
      context: initialContext,
      progress: progress(2),
    };
    const initial = buildInvestigationOpportunities(input)
      .find(opportunity => opportunity.sourceIds.includes('fact:F002:hint'))!;
    const knownInput = {
      ...input,
      context: context({
        cycleCount: 2,
        currentLocation: 'school',
        playerKnowledge: { 'shared-school-absence': 'hint' as const },
      }),
      progress: progress(2, { completedIds: [initial.id] }),
    };

    expect(findInvestigationOpportunity(knownInput, initial.id)).toEqual(initial);
    expect(findInvestigationOpportunity({ ...knownInput, context: { ...knownInput.context, cycleCount: 3 } }, initial.id))
      .toBeUndefined();
    expect(findInvestigationOpportunity(knownInput, `${initial.id}:invented`)).toBeUndefined();
  });

  it('publishes only the public opportunity projection', () => {
    const internal: InvestigationOpportunity = {
      id: 'investigation:c1:F002:atmosphere:school',
      locationId: 'school',
      publicGoal: '向门卫确认文穗今天是否到校',
      scope: 'normal',
      sourceIds: ['fact:F002:atmosphere'],
      topicKey: 'school:attendance',
      availableUntil: '2024-09-09T12:00:00',
    };

    expect(projectPublicInvestigationOpportunities([internal])).toEqual([{
      id: internal.id,
      locationId: 'school',
      publicGoal: internal.publicGoal,
      scope: 'normal',
      availableUntil: '2024-09-09T12:00:00',
    }]);
    expect(JSON.stringify(projectPublicInvestigationOpportunities([internal]))).not.toContain('sourceIds');
    expect(JSON.stringify(projectPublicInvestigationOpportunities([internal]))).not.toContain('topicKey');
  });
});

function resolution(
  id: string,
  selected: InvestigationOpportunity,
  options: { completed?: boolean; completedSourceIds?: string[] } = {},
): ResolvedActionOutcome {
  const completed = options.completed ?? true;
  return {
    id,
    cycleCount: 1,
    startTime: '2024-09-09T10:00:00',
    endTime: completed ? '2024-09-09T10:55:00' : '2024-09-09T10:30:00',
    startLocationId: selected.locationId,
    endLocationId: selected.locationId,
    plannedMinutes: 55,
    executedMinutes: completed ? 55 : 30,
    segments: [{
      step: {
        id: `work:${id}`,
        kind: 'inquiry',
        scope: selected.scope,
        locationId: selected.locationId,
        opportunityId: selected.id,
        completionSourceIds: [...selected.sourceIds],
      },
      plannedMinutes: 55,
      executedMinutes: completed ? 55 : 30,
      cumulativeExecutedMinutes: completed ? 55 : 30,
      staminaDelta: completed ? -7 : -4,
      completed,
    }],
    resources: {
      before: { stamina: 100, sanity: 70 },
      after: { stamina: completed ? 93 : 96, sanity: 70 },
    },
    completedSourceIds: options.completedSourceIds ?? [],
    eventEffectIds: [],
  };
}

describe('settleOpportunityProgress', () => {
  const selected: InvestigationOpportunity = {
    id: 'investigation:c1:F002:atmosphere:school',
    locationId: 'school',
    publicGoal: '向门卫确认文穗今天是否到校',
    scope: 'normal',
    sourceIds: ['fact:F002:atmosphere'],
    topicKey: 'school:attendance',
  };

  it('counts distinct completed attempts with no actual award and ignores duplicate settlement', () => {
    const once = settleOpportunityProgress({
      previous: progress(1),
      selected,
      resolution: resolution('attempt-1', selected),
      newSourceIds: [],
    });
    const duplicate = settleOpportunityProgress({
      previous: once,
      selected,
      resolution: resolution('attempt-1', selected),
      newSourceIds: [],
    });
    const twice = settleOpportunityProgress({
      previous: duplicate,
      selected,
      resolution: resolution('attempt-2', selected),
      newSourceIds: [],
    });

    expect(once.noProgressByTopic['school:attendance']).toBe(1);
    expect(duplicate).toEqual(once);
    expect(twice.noProgressByTopic['school:attendance']).toBe(2);
    expect(twice.settledResolutionIds).toEqual(['attempt-1', 'attempt-2']);
  });

  it('requires the selected source to be both completed and newly committed', () => {
    const resolved = resolution('award', selected, { completedSourceIds: selected.sourceIds });
    const awarded = settleOpportunityProgress({
      previous: progress(1),
      selected,
      resolution: resolved,
      newSourceIds: selected.sourceIds,
    });
    const unrelated = settleOpportunityProgress({
      previous: progress(1),
      selected,
      resolution: resolution('unrelated', selected, { completedSourceIds: selected.sourceIds }),
      newSourceIds: ['accepted-event:weather-changed'],
    });

    expect(awarded.completedIds).toEqual([selected.id]);
    expect(awarded.noProgressByTopic['school:attendance']).toBeUndefined();
    expect(unrelated.completedIds).toEqual([]);
    expect(unrelated.noProgressByTopic['school:attendance']).toBe(1);
  });

  it('does not count partial work or an unrelated event as a failed opportunity attempt', () => {
    const partial = settleOpportunityProgress({
      previous: progress(1),
      selected,
      resolution: resolution('partial', selected, { completed: false }),
      newSourceIds: [],
    });
    const eventOnly: ResolvedActionOutcome = {
      ...resolution('event', selected),
      executedMinutes: 0,
      plannedMinutes: 0,
      segments: [{
        step: {
          id: 'death-news',
          kind: 'event',
          eventId: 'death-news',
          scope: 'normal',
          locationId: 'school',
          completionSourceIds: [],
        },
        plannedMinutes: 0,
        executedMinutes: 0,
        cumulativeExecutedMinutes: 0,
        staminaDelta: 0,
        completed: true,
      }],
    };
    const afterEvent = settleOpportunityProgress({
      previous: partial,
      selected,
      resolution: eventOnly,
      newSourceIds: [],
    });

    expect(afterEvent.noProgressByTopic).toEqual({});
    expect(afterEvent.settledResolutionIds).toEqual(['partial', 'event']);
  });
});
