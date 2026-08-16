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

  it('rejects invented evidence objects when no facts are authorized or known', () => {
    const repaired = enforceNarrativeSceneContract(plan(), brief());
    const unsafePlan = {
      ...repaired,
      beats: [...repaired.beats, {
        id: 'invented-evidence',
        purpose: '凭空提供线索',
        description: '陈慧慧从柜台下拿出一个文件夹，里面夹着文穗留下的小票。',
        locationId: 'supermarket',
        speakerIds: ['chen-huihui'],
      }],
    };

    expect(reviewDirectorPlan(unsafePlan, brief()).violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ungrounded-evidence-detail' }),
    ]));
    expect(enforceNarrativeSceneContract(unsafePlan, brief()).beats)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'invented-evidence' })]));
  });

  it('deterministically removes an uncited same-morning visit claim', () => {
    const unsafePlan = {
      ...plan(),
      beats: [...plan().beats, {
        id: 'invented-visit',
        purpose: '打听行踪',
        description: '陈慧慧说今天早上好像见过一个穿校服的女孩。',
        locationId: 'supermarket',
        speakerIds: ['chen-huihui'],
      }],
    };

    expect(enforceNarrativeSceneContract(unsafePlan, brief()).beats)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'invented-visit' })]));
  });

  it('sanitizes unsupported evidence on follow-up turns without a scene contract', () => {
    const followUpBrief = { ...brief(), sceneContract: undefined };
    const unsafePlan = {
      ...plan(),
      beats: [{
        id: 'follow-up',
        purpose: '回应玩家询问',
        description: '陈慧慧回答玩家当下的问题。她又去摸收银台旁的文件夹，并暗示文穗今早来买过东西。',
        locationId: 'supermarket',
        speakerIds: ['chen-huihui'],
      }],
      optionIntents: [{
        id: 'inspect-folder', intent: '追问她手里的文件夹', tone: '直接', expectedPressure: 'medium' as const,
      }],
      scenePlan: {
        observeFocus: '陈慧慧与收银台旁的文件夹',
        observeConceal: '文件夹里的物证',
        investigateIntents: [
          { intent: '检查文件夹', costTier: 'light' as const },
          { intent: '观察陈慧慧的当下反应', costTier: 'light' as const },
        ],
        actionIntents: [{ intent: '查看监控录像', costTier: 'medium' as const }],
      },
    };

    const repaired = enforceNarrativeSceneContract(unsafePlan, followUpBrief);
    expect(repaired.beats[0]?.description).toBe('陈慧慧回答玩家当下的问题。');
    expect(repaired.optionIntents).toEqual([]);
    expect(repaired.scenePlan).toMatchObject({
      observeFocus: '当前可观察的人物反应与普通环境',
      investigateIntents: [{ intent: '观察陈慧慧的当下反应', costTier: 'light' }],
      actionIntents: [],
    });
    expect(reviewDirectorPlan(repaired, followUpBrief).approved).toBe(true);
  });
});
