import { describe, expect, it } from 'vitest';
import { enforceNarrativeSceneContract, reviewDirectorPlan } from './review';
import type { DirectorPlan, MysteryBrief } from './types';

function brief(): MysteryBrief {
  return {
    graphVersion: 'test',
    routeMode: 'exploratory',
    playerKnownFacts: [],
    usableFacts: [],
    hiddenFacts: [],
    allowedRedHerrings: [],
    npcKnowledge: [
      { npcId: 'detective-a', facts: [] },
      { npcId: 'chen-huihui', facts: [] },
    ],
    forbiddenReveals: [],
    revealBudget: { maxNewFacts: 0, maxRevealLevel: 'atmosphere', allowConfirmation: false, reason: 'test' },
    continuityWarnings: [],
    playerPresentation: { locations: [], entities: [], namingRules: [], allowedDiscoveries: [] },
    characterPerformances: [],
    sceneContract: {
      destinationLocationId: 'supermarket',
      destinationBackground: 'supermarket-day',
      entryMode: 'destination',
      requiredDestinationNpcIds: ['chen-huihui'],
      requiredEnRouteNpcIds: ['detective-a'],
      forbiddenNpcIds: [],
      requiredKnowledgeEvents: [],
      forbiddenKnowledgeEventIds: [],
      directive: '便利店由陈慧慧承接剧情。',
    },
  };
}

function plan(): DirectorPlan {
  return {
    turnGoal: '去便利店',
    tone: '雨中调查',
    beats: [{ id: 'generic', purpose: '抵达', description: '店员回应玩家。', locationId: 'supermarket', speakerIds: [] }],
    revelations: [],
    optionIntents: [],
    assetRequests: [],
  };
}

describe('deterministic narrative scene contract review', () => {
  it('rejects a plan that omits the fixed destination and en-route NPCs', () => {
    const result = reviewDirectorPlan(plan(), brief());
    expect(result.approved).toBe(false);
    expect(result.violations.filter(item => item.code === 'scene-contract-violation')).toHaveLength(2);
  });

  it('repairs the plan before writer generation without inventing facts', () => {
    const repaired = enforceNarrativeSceneContract(plan(), brief());
    expect(repaired.beats[0]).toMatchObject({ locationId: 'street', speakerIds: ['detective-a'] });
    expect(repaired.beats[1]).toMatchObject({ locationId: 'supermarket', speakerIds: ['chen-huihui'] });
    expect(repaired.revelations).toEqual([]);
    expect(reviewDirectorPlan(repaired, brief()).approved).toBe(true);
  });

  it('adds required introduction events and strips forbidden identity events', () => {
    const constrainedBrief = brief();
    constrainedBrief.sceneContract = {
      ...constrainedBrief.sceneContract!,
      requiredKnowledgeEvents: [{ eventId: 'meet:chen-huihui', evidence: '玩家在旁白中认出陈慧慧。' }],
      forbiddenKnowledgeEventIds: ['identify:lin-jing-name'],
    };
    const constrainedPlan = {
      ...plan(),
      knowledgeEvents: [{ eventId: 'identify:lin-jing-name', evidence: '错误地提前实名。' }],
    };

    const repaired = enforceNarrativeSceneContract(constrainedPlan, constrainedBrief);
    expect(repaired.knowledgeEvents).toEqual([
      { eventId: 'meet:chen-huihui', evidence: '玩家在旁白中认出陈慧慧。' },
    ]);
  });

  it('rejects invented past dialogue unless the beat cites a selected memory', () => {
    const repaired = enforceNarrativeSceneContract(plan(), brief());
    repaired.beats[1] = {
      ...repaired.beats[1]!,
      description: '陈慧慧说，文穗昨天来过，还说今天要去某个地方。',
    };
    const rejected = reviewDirectorPlan(repaired, brief(), {
      contextSelectionIds: ['episode:known-visit'],
    });
    expect(rejected.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ungrounded-past-claim' }),
    ]));

    repaired.beats[1]!.sourceMemoryIds = ['episode:known-visit'];
    expect(reviewDirectorPlan(repaired, brief(), {
      contextSelectionIds: ['episode:known-visit'],
    }).approved).toBe(true);
  });
});
