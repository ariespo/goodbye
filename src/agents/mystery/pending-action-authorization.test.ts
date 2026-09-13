import { describe, expect, it } from 'vitest';
import { buildPlayerKnowledgeBrief } from '../../data/playerKnowledge';
import { resolveAction, type ActionContinuation, type ResolvedActionOutcome } from '../../engine/action-resolution';
import { buildActionAuthorityInput } from './action-authority';
import { buildMysteryBrief } from './brief';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';
import {
  capturePendingActionAuthorization,
  restorePendingActionAuthorization,
  type PendingActionAuthorization,
} from './pending-action-authorization';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, MysteryTruthGraph, TruthContext } from './types';

function truthContext(overrides: Partial<TruthContext> = {}): TruthContext {
  return {
    cycleCount: 1,
    currentLocation: 'home',
    lockedRoute: null,
    unlockedClueIds: [],
    playerKnowledge: {},
    suspicion: { self: 10, 'old-man': 0, 'detective-a': 0, 'detective-b': 0 },
    activeNpcIds: [],
    ...overrides,
  };
}

function plan(revelations: DirectorPlan['revelations'], knowledgeEvents: DirectorPlan['knowledgeEvents'] = []): DirectorPlan {
  return {
    turnGoal: '完成获准调查',
    tone: '克制',
    beats: [],
    revelations,
    knowledgeEvents,
    optionIntents: [],
    assetRequests: [],
  };
}

function originalApronAttempt() {
  const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
  const context = truthContext();
  const brief = buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases);
  const originalPlan = plan([{ factId: 'F001', level: 'atmosphere', delivery: 'object' }]);
  const input = buildActionAuthorityInput(originalPlan, {
    cycleCount: 1,
    startTime: '2024-09-09T15:30:00',
    currentLocationId: 'home',
    stamina: 100,
    sanity: 70,
    originalInput: '深入调查房间',
    sourceLocationId: 'home',
    nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
  }, 'apron-action');
  const resolution = resolveAction(input);
  const ledger = capturePendingActionAuthorization({
    plan: originalPlan,
    brief,
    aliases,
    graph: MYSTERY_TRUTH_GRAPH,
    resolution,
    sourceLocationId: 'home',
  });
  if (!resolution.continuation || !ledger) throw new Error('fixture must produce a pending authorization');
  return { aliases, context, originalPlan, resolution, ledger };
}

describe('pending action authorization', () => {
  it('restores the original F001 authorization when a 30+75 resume Director omits it', () => {
    const { aliases, context, resolution, ledger } = originalApronAttempt();
    const omittedPlan = plan([]);

    const restored = restorePendingActionAuthorization({
      ledger,
      continuation: resolution.continuation!,
      graph: MYSTERY_TRUTH_GRAPH,
      aliases,
      truthContext: context,
    });
    const resumed = resolveAction(buildActionAuthorityInput(omittedPlan, {
      cycleCount: 1,
      startTime: resolution.endTime,
      currentLocationId: resolution.endLocationId,
      stamina: resolution.resources.after.stamina,
      sanity: resolution.resources.after.sanity,
      originalInput: '继续调查',
      continuation: resolution.continuation,
      resumeActionId: resolution.continuation!.actionId,
    }, 'ignored-new-id'));

    expect(resolution.executedMinutes).toBe(30);
    expect(resumed.executedMinutes).toBe(75);
    expect(resumed.completedSourceIds).toEqual(['fact:F001:atmosphere']);
    expect(restored.revelations).toEqual([
      { factId: 'F001', level: 'atmosphere', delivery: 'object' },
    ]);
    expect(restored.usableFacts[0]?.revealOptions).toContainEqual(expect.objectContaining({
      id: 'F001',
      level: 'atmosphere',
      text: '衣柜里有一处不自然的空缺。',
    }));
  });

  it('keeps a prior authorization across another partial resume when the new plan omits it', () => {
    const { aliases, context, resolution, ledger } = originalApronAttempt();
    const second = resolveAction({
      id: resolution.continuation!.actionId,
      cycleCount: 1,
      startTime: resolution.endTime,
      currentLocationId: resolution.endLocationId,
      stamina: resolution.resources.after.stamina,
      sanity: resolution.resources.after.sanity,
      steps: resolution.continuation!.steps,
      continuation: resolution.continuation,
      nextBoundary: { id: 'appointment', at: '2024-09-09T16:30:00' },
    });

    const nextLedger = capturePendingActionAuthorization({
      plan: plan([]),
      brief: buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases),
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution: second,
      sourceLocationId: 'home',
      previous: ledger,
    });

    expect(second.continuation?.completedMinutesByStep[second.continuation.activeStepId]).toBe(60);
    expect(nextLedger?.revelations).toHaveLength(1);
    expect(nextLedger?.revelations[0]).toMatchObject({ alias: 'F001', canonicalFactId: 'shared-apron-missing' });
  });

  it('keeps the original source location when repeated interrupted travel is prepared from the origin', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const context = truthContext({ cycleCount: 2, currentLocation: 'school', activeNpcIds: ['school-guard'] });
    const brief = buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases);
    const originalPlan = plan([{ factId: 'F002', level: 'hint', delivery: 'dialogue', speakerId: 'school-guard' }]);
    const first = resolveAction({
      id: 'travel-to-school', cycleCount: 2, startTime: '2024-09-09T15:55:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'ask', kind: 'inquiry', scope: 'deep', locationId: 'school', completionSourceIds: ['fact:F002:hint'] }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    const firstLedger = capturePendingActionAuthorization({
      plan: originalPlan, brief, aliases, graph: MYSTERY_TRUTH_GRAPH, resolution: first, sourceLocationId: 'school',
    })!;
    const second = resolveAction({
      id: first.continuation!.actionId,
      cycleCount: 2,
      startTime: first.endTime,
      currentLocationId: first.endLocationId,
      stamina: first.resources.after.stamina,
      sanity: first.resources.after.sanity,
      steps: first.continuation!.steps,
      continuation: first.continuation,
      nextBoundary: { id: 'second-pause', at: '2024-09-09T16:02:00' },
    });

    const nextLedger = capturePendingActionAuthorization({
      plan: originalPlan,
      brief,
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution: second,
      sourceLocationId: 'home',
      previous: firstLedger,
    });

    expect(second.endLocationId).toBe('home');
    expect(nextLedger?.revelations[0]).toMatchObject({
      sourceId: 'fact:F002:hint',
      sourceLocationId: 'school',
      delivery: 'dialogue',
      speakerId: 'school-guard',
    });
  });

  it('drops sources completed in this segment while retaining later pending milestones', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const context = truthContext();
    const brief = buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases);
    const originalPlan = plan(
      [{ factId: 'F001', level: 'atmosphere', delivery: 'environment' }],
      [{ eventId: 'meet:touko', evidence: '灯织本人接通电话并明确自我介绍。' }],
    );
    const resolution = resolveAction({
      id: 'two-milestones', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70, explicitBudgetMinutes: 55,
      steps: [
        { id: 'first', kind: 'inquiry', scope: 'normal', locationId: 'home', completionSourceIds: ['accepted-event:meet:touko'] },
        { id: 'second', kind: 'investigation', scope: 'normal', locationId: 'home', completionSourceIds: ['fact:F001:atmosphere'] },
      ],
    });

    const ledger = capturePendingActionAuthorization({
      plan: originalPlan, brief, aliases, graph: MYSTERY_TRUTH_GRAPH, resolution, sourceLocationId: 'home',
    });

    expect(resolution.completedSourceIds).toEqual(['accepted-event:meet:touko']);
    expect(ledger?.knowledgeMilestones).toEqual([]);
    expect(ledger?.revelations.map(item => item.sourceId)).toEqual(['fact:F001:atmosphere']);
  });

  it('rejects a reordered fact table before restoring any public outcome', () => {
    const { context, resolution, ledger } = originalApronAttempt();
    const reordered: MysteryTruthGraph = {
      ...MYSTERY_TRUTH_GRAPH,
      facts: [MYSTERY_TRUTH_GRAPH.facts[1], MYSTERY_TRUTH_GRAPH.facts[0], ...MYSTERY_TRUTH_GRAPH.facts.slice(2)],
    };
    const reorderedAliases = createFactAliasTable(reordered);

    expect(() => restorePendingActionAuthorization({
      ledger,
      continuation: resolution.continuation!,
      graph: reordered,
      aliases: reorderedAliases,
      truthContext: context,
    })).toThrow(/graph/i);
  });

  it('rejects an original reveal whose current suspicion gate is no longer legal', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const alias = aliases.factIdToAlias['a-sacrifice-list'];
    const initialContext = truthContext({
      cycleCount: 3,
      currentLocation: 'old-man-building',
      suspicion: { self: 10, 'old-man': 26, 'detective-a': 0, 'detective-b': 0 },
      activeNpcIds: ['old-man'],
    });
    const originalPlan = plan([{ factId: alias, level: 'hint', delivery: 'object' }]);
    const resolution = resolveAction({
      id: 'gated-action', cycleCount: 3, startTime: '2024-09-09T15:30:00',
      currentLocationId: 'old-man-building', stamina: 100, sanity: 70,
      steps: [{ id: 'search', kind: 'search', scope: 'deep', locationId: 'old-man-building', completionSourceIds: [`fact:${alias}:hint`] }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    const ledger = capturePendingActionAuthorization({
      plan: originalPlan,
      brief: buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, initialContext), aliases),
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution,
      sourceLocationId: 'old-man-building',
    })!;

    expect(() => restorePendingActionAuthorization({
      ledger,
      continuation: resolution.continuation!,
      graph: MYSTERY_TRUTH_GRAPH,
      aliases,
      truthContext: {
        ...initialContext,
        suspicion: { ...initialContext.suspicion, 'old-man': 0 },
      },
    })).toThrow(/授权|审查|可用|usable/);
  });

  it('preserves the original dialogue delivery and speaker without exposing canonical truth', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const context = truthContext({ cycleCount: 2, currentLocation: 'school', activeNpcIds: ['school-guard'] });
    const originalPlan = plan([{ factId: 'F002', level: 'hint', delivery: 'dialogue', speakerId: 'school-guard' }]);
    const resolution = resolveAction({
      id: 'school-action', cycleCount: 2, startTime: '2024-09-09T15:30:00',
      currentLocationId: 'school', stamina: 100, sanity: 70,
      steps: [{ id: 'ask', kind: 'inquiry', scope: 'deep', locationId: 'school', completionSourceIds: ['fact:F002:hint'] }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    const ledger = capturePendingActionAuthorization({
      plan: originalPlan,
      brief: buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases),
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution,
      sourceLocationId: 'school',
    })!;
    const restored = restorePendingActionAuthorization({
      ledger, continuation: resolution.continuation!, graph: MYSTERY_TRUTH_GRAPH, aliases, truthContext: context,
    });

    expect(restored.revelations).toEqual([
      { factId: 'F002', level: 'hint', delivery: 'dialogue', speakerId: 'school-guard' },
    ]);
    expect(JSON.stringify(restored)).not.toContain('canonicalTruth');
    expect(JSON.stringify(restored)).not.toContain('shared-school-absence');
  });

  it.each([
    ['action', (continuation: ActionContinuation) => ({ ...continuation, actionId: 'other-action' })],
    ['cycle', (continuation: ActionContinuation) => ({ ...continuation, cycleCount: continuation.cycleCount + 1 })],
  ])('rejects a mismatched continuation %s', (_label, mutate) => {
    const { aliases, context, resolution, ledger } = originalApronAttempt();
    expect(() => restorePendingActionAuthorization({
      ledger,
      continuation: mutate(resolution.continuation!),
      graph: MYSTERY_TRUTH_GRAPH,
      aliases,
      truthContext: context,
    })).toThrow(/action|cycle/i);
  });

  it('restores only knowledge milestones still referenced by remaining continuation steps', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const context = truthContext({
      playerPresentation: {
        locations: [], entities: [], namingRules: [],
        allowedDiscoveries: [{
          eventId: 'meet:touko', kind: 'introduction', subjectId: 'touko',
          meaning: '确认灯织的称呼。', evidenceStandard: '灯织本人自我介绍。',
        }],
      },
    });
    const originalPlan = plan([], [{ eventId: 'meet:touko', evidence: '灯织本人接通电话并明确自我介绍。' }]);
    const resolution = resolveAction({
      id: 'knowledge-action', cycleCount: 1, startTime: '2024-09-09T15:30:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'call', kind: 'inquiry', scope: 'deep', locationId: 'home', completionSourceIds: ['accepted-event:meet:touko'] }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    const ledger = capturePendingActionAuthorization({
      plan: originalPlan,
      brief: buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context), aliases),
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution,
      sourceLocationId: 'home',
    })!;
    const restored = restorePendingActionAuthorization({
      ledger, continuation: resolution.continuation!, graph: MYSTERY_TRUTH_GRAPH, aliases, truthContext: context,
    });

    expect(restored.knowledgeEvents).toEqual([
      { eventId: 'meet:touko', evidence: '灯织本人接通电话并明确自我介绍。' },
    ]);
    expect(restored.revelations).toEqual([]);
  });

  it('rebuilds destination discovery authorization when resume still starts at home', () => {
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const originalVariables = { location: 'school', knowledgeEvents: [] };
    const schoolContext = truthContext({
      currentLocation: 'school',
      activeNpcIds: ['school-guard'],
      playerIdentityVariables: originalVariables,
      playerPresentation: buildPlayerKnowledgeBrief(originalVariables),
    });
    const originalPlan = plan([], [{
      eventId: 'meet:liu-renguang',
      evidence: '刘仁光本人出示教师证并说明自己是文穗学校的体育老师。',
    }]);
    const resolution = resolveAction({
      id: 'school-introduction', cycleCount: 1, startTime: '2024-09-09T15:55:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{
        id: 'ask-teacher', kind: 'inquiry', scope: 'deep', locationId: 'school',
        completionSourceIds: ['accepted-event:meet:liu-renguang'],
      }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });
    const ledger = capturePendingActionAuthorization({
      plan: originalPlan,
      brief: buildAliasedMysteryBrief(buildMysteryBrief(MYSTERY_TRUTH_GRAPH, schoolContext), aliases),
      aliases,
      graph: MYSTERY_TRUTH_GRAPH,
      resolution,
      sourceLocationId: 'school',
    })!;
    const homeVariables = { location: 'home', knowledgeEvents: [] };
    const restored = restorePendingActionAuthorization({
      ledger,
      continuation: resolution.continuation!,
      graph: MYSTERY_TRUTH_GRAPH,
      aliases,
      truthContext: {
        ...schoolContext,
        currentLocation: 'home',
        activeNpcIds: [],
        playerIdentityVariables: homeVariables,
        playerPresentation: buildPlayerKnowledgeBrief(homeVariables),
      },
    });

    expect(restored.knowledgeEvents).toEqual([{
      eventId: 'meet:liu-renguang',
      evidence: '刘仁光本人出示教师证并说明自己是文穗学校的体育老师。',
    }]);
    expect(restored.allowedDiscoveries).toContainEqual(expect.objectContaining({
      eventId: 'meet:liu-renguang',
      subjectId: 'liu-renguang',
    }));
  });
});

// Compile-time fixture: persisted ledgers stay program-owned and are never packet-shaped.
void (undefined as unknown as PendingActionAuthorization | ResolvedActionOutcome);
