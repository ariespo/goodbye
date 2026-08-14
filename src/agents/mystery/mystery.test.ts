import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { buildWriterUserPrompt } from './prompts';
import { buildWriterPacket, removeConfessionBySilence, reviewDirectorPlan } from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, TruthContext } from './types';
import { validateTruthGraph } from './validate';
import { buildPlayerKnowledgeBrief } from '../../data/playerKnowledge';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';
import { selectSaturationPivot } from './saturation-pivot';

function context(overrides: Partial<TruthContext> = {}): TruthContext {
  return {
    cycleCount: 1,
    currentLocation: 'home',
    lockedRoute: null,
    unlockedClueIds: [],
    playerKnowledge: {},
    suspicion: { self: 10, 'old-man': 0, 'detective-a': 0 },
    activeNpcIds: [],
    ...overrides,
  };
}

function plan(revelations: DirectorPlan['revelations']): DirectorPlan {
  return {
    turnGoal: '推进当前调查',
    tone: '克制',
    beats: [],
    revelations,
    optionIntents: [],
    assetRequests: [],
  };
}

describe('mystery brief', () => {
  it('selects an authorized other-character clue for a saturated investigation', () => {
    const truthContext = context({
      cycleCount: 2,
      currentLocation: 'school',
      activeNpcIds: ['school-guard'],
      suspicion: { self: 10, 'old-man': 15, 'detective-a': 0 },
    });
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, truthContext);
    const pivot = selectSaturationPivot(MYSTERY_TRUTH_GRAPH, brief, truthContext, 'old-man');
    expect(pivot).toMatchObject({
      blockedActorId: 'old-man',
      redirectedActorId: 'detective-b',
      factId: 'shared-nurse-school-inquiry',
      interveningNpcId: 'school-guard',
      currentLocationId: 'school',
      requiredSuspicionGain: 5,
    });
  });

  it('hard-rejects a saturated plan that omits the selected intervention', () => {
    const truthContext = context({ cycleCount: 2, currentLocation: 'school', activeNpcIds: ['school-guard'] });
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, truthContext);
    brief.saturationPivot = selectSaturationPivot(MYSTERY_TRUTH_GRAPH, brief, truthContext, 'old-man');
    const result = reviewDirectorPlan(plan([]), brief);
    expect(result.approved).toBe(false);
    expect(result.violations.some(item => item.code === 'saturation-pivot-violation')).toBe(true);
  });
  it('ships a structurally valid canonical graph', () => {
    expect(validateTruthGraph(MYSTERY_TRUTH_GRAPH)).toEqual({ valid: true, errors: [] });
  });

  it('only exposes atmospheric information in the first cycle', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context());
    expect(brief.revealBudget.maxRevealLevel).toBe('atmosphere');
    expect(brief.usableFacts.find((fact) => fact.id === 'shared-apron-missing')?.maxRevealLevel).toBe('atmosphere');
    expect(brief.hiddenFacts.some((fact) => fact.id === 'c-player-killed-fumi')).toBe(true);
  });

  it('projects character performance rules into both director and writer packets', () => {
    const internalBrief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      playerPresentation: buildPlayerKnowledgeBrief({ location: 'home', knowledgeEvents: ['meet:touko'] }),
    }));
    expect(internalBrief.characterPerformances.find(profile => profile.id === 'touko')?.dialogueRules)
      .toContain('措辞克制、简短、具体，不说空泛安慰；温柔中带有不平等但真实的保护感。');
    expect(internalBrief.characterPerformances.some(profile => profile.id === 'detective-b')).toBe(false);

    const brief = buildAliasedMysteryBrief(internalBrief, createFactAliasTable(MYSTERY_TRUTH_GRAPH));
    const packet = buildWriterPacket(plan([]), brief);
    expect(packet.characterPerformances.find(profile => profile.id === 'touko')?.emotionRules.join(' '))
      .toContain('生气时不提高音量');
    expect(JSON.stringify(packet.characterPerformances)).not.toContain('雇主');
    expect(JSON.stringify(packet.characterPerformances)).not.toContain('掩盖行为');
    expect(JSON.stringify(packet.characterPerformances)).not.toContain('轮回知识');
  });

  it('does not give conditional suspects murder knowledge before suspicion locks their reality', () => {
    const oldMan = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      activeNpcIds: ['old-man'],
      suspicion: { 'old-man': 49 },
    }));
    expect(oldMan.npcKnowledge[0].facts.some(fact => fact.factId === 'a-murder-staged-fall')).toBe(false);

    const detectives = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'detective-inn',
      activeNpcIds: ['detective-a', 'detective-b'],
      unlockedClueIds: ['b-water-tower-blood'],
      suspicion: { 'detective-a': 49, 'detective-b': 49 },
    }));
    expect(detectives.usableFacts.some(fact => fact.id === 'b-detective-coverup')).toBe(false);
    expect(detectives.npcKnowledge.flatMap(npc => npc.facts).some(fact => fact.factId === 'b-detective-coverup')).toBe(false);
    expect(detectives.npcKnowledge.flatMap(npc => npc.facts).some(fact => fact.factId === 'b-accidental-killing')).toBe(false);
  });

  it('adds only the suspicion-stage hidden prompts at their matching 26 threshold', () => {
    const oldManBefore = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 3,
      currentLocation: 'old-man-building',
      activeNpcIds: ['old-man'],
      suspicion: { 'old-man': 25 },
    }));
    const oldManAfter = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 3,
      currentLocation: 'old-man-building',
      activeNpcIds: ['old-man'],
      suspicion: { 'old-man': 26 },
    }));
    expect(oldManBefore.npcKnowledge[0].facts.some(fact => fact.factId === 'a-sacrifice-list')).toBe(false);
    expect(oldManAfter.npcKnowledge[0].facts.some(fact => fact.factId === 'a-sacrifice-list')).toBe(true);

    const zhaoBefore = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 3,
      currentLocation: 'water-tower',
      activeNpcIds: ['detective-a'],
      suspicion: { 'detective-a': 25 },
    }));
    const zhaoAfter = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 3,
      currentLocation: 'water-tower',
      activeNpcIds: ['detective-a'],
      suspicion: { 'detective-a': 26 },
    }));
    expect(zhaoBefore.npcKnowledge[0].facts.some(fact => fact.factId === 'b-water-tower-blood')).toBe(false);
    expect(zhaoAfter.npcKnowledge[0].facts.some(fact => fact.factId === 'b-water-tower-blood')).toBe(true);
  });

  it('adds detective hidden reality at suspicion 50 and reserves confirmation for route B lock', () => {
    const beforeLock = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'detective-inn',
      activeNpcIds: ['detective-a', 'detective-b'],
      unlockedClueIds: ['b-water-tower-blood', 'b-detective-coverup'],
      suspicion: { 'detective-a': 49, 'detective-b': 50 },
    }));
    expect(beforeLock.usableFacts.find(fact => fact.id === 'b-detective-coverup')?.maxRevealLevel).toBe('clue');
    expect(beforeLock.usableFacts.find(fact => fact.id === 'b-accidental-killing')?.maxRevealLevel).toBe('clue');

    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'detective-inn',
      lockedRoute: 'B',
      activeNpcIds: ['detective-a', 'detective-b'],
      unlockedClueIds: ['b-water-tower-blood', 'b-detective-coverup'],
      suspicion: { 'detective-a': 49, 'detective-b': 50 },
    }));
    expect(brief.usableFacts.some(fact => fact.id === 'b-detective-coverup')).toBe(true);
    expect(brief.usableFacts.some(fact => fact.id === 'b-accidental-killing')).toBe(true);
    expect(brief.usableFacts.find(fact => fact.id === 'b-accidental-killing')?.maxRevealLevel).toBe('confirmation');
    for (const npcId of ['detective-a', 'detective-b']) {
      expect(brief.npcKnowledge.find(npc => npc.npcId === npcId)?.facts).toEqual(expect.arrayContaining([
        expect.objectContaining({ factId: 'b-detective-coverup' }),
        expect.objectContaining({ factId: 'b-accidental-killing' }),
      ]));
    }
  });

  it('gives the old man hidden reality at suspicion 50 and full confirmation only after route A lock', () => {
    const beforeLock = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      activeNpcIds: ['old-man'],
      unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
      suspicion: { 'old-man': 50 },
    }));
    expect(beforeLock.usableFacts.find(fact => fact.id === 'a-murder-staged-fall')?.maxRevealLevel).toBe('clue');
    expect(beforeLock.npcKnowledge[0].facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factId: 'a-murder-staged-fall' }),
    ]));

    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      activeNpcIds: ['old-man'],
      unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
      suspicion: { 'old-man': 50 },
    }));
    expect(brief.npcKnowledge[0].facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ factId: 'a-murder-staged-fall' }),
    ]));
    expect(brief.usableFacts.find(fact => fact.id === 'a-murder-staged-fall')?.maxRevealLevel).toBe('confirmation');
  });

  it('hides facts from other routes after route lock', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
      suspicion: { 'old-man': 60 },
    }));
    expect(brief.usableFacts.some((fact) => fact.id === 'a-murder-staged-fall')).toBe(true);
    expect(brief.usableFacts.some((fact) => fact.route === 'B' || fact.route === 'C')).toBe(false);
  });

  it('treats NONE as a controlled route with a gated solution', () => {
    const fragments = ['none-letter-bedroom', 'none-letter-water-tower', 'none-letter-door-gap'];
    const beforeLock = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'water-tower',
      unlockedClueIds: fragments,
      tripProgress: 100,
    }));
    expect(beforeLock.usableFacts.some(fact => fact.id === 'none-accidental-goodbye')).toBe(false);

    const afterLock = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'water-tower',
      lockedRoute: 'NONE',
      unlockedClueIds: fragments,
      tripProgress: 100,
    }));
    expect(afterLock.usableFacts.find(fact => fact.id === 'none-accidental-goodbye')?.maxRevealLevel)
      .toBe('confirmation');
    expect(afterLock.usableFacts.some(fact => fact.route === 'A' || fact.route === 'B' || fact.route === 'C'))
      .toBe(false);
  });

  it('treats FAKE as a controlled route after three independent evidence facts', () => {
    const evidence = ['fake-body-mismatch', 'fake-alias-ticket', 'fake-postdeath-sighting'];
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'observation-deck',
      lockedRoute: 'FAKE',
      unlockedClueIds: evidence,
    }));
    expect(brief.usableFacts.find(fact => fact.id === 'fake-staged-death-escape')?.maxRevealLevel)
      .toBe('confirmation');
    expect(brief.usableFacts.some(fact => fact.route === 'NONE')).toBe(false);
  });

  it('projects CULT clues only on A and reserves the solution for the locked overlay', () => {
    const cultClues = ['cult-symbol-sun-room', 'cult-rain-death-pattern', 'cult-old-man-ageless'];
    const beforeOverlay = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      unlockedClueIds: cultClues,
      suspicion: { 'old-man': 50 },
    }));
    expect(beforeOverlay.usableFacts.some(fact => fact.id === 'cult-symbol-sun-room')).toBe(true);
    expect(beforeOverlay.usableFacts.some(fact => fact.id === 'cult-sacrifice-powers-loop')).toBe(false);

    const afterOverlay = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      activeOverlay: 'CULT',
      unlockedClueIds: cultClues,
      suspicion: { 'old-man': 50 },
    }));
    expect(afterOverlay.usableFacts.find(fact => fact.id === 'cult-sacrifice-powers-loop')?.maxRevealLevel)
      .toBe('confirmation');
    expect(afterOverlay.usableFacts.some(fact => fact.route === 'PSYCH')).toBe(false);
  });

  it('projects PSYCH only on low-sanity C and reserves its solution for the overlay', () => {
    const glitchClues = ['psych-receipt-year-drift', 'psych-doctor-badge', 'psych-medication-label'];
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'community-hospital',
      lockedRoute: 'C',
      activeOverlay: 'PSYCH',
      sanity: 15,
      unlockedClueIds: glitchClues,
      suspicion: { self: 50 },
    }));
    expect(brief.usableFacts.find(fact => fact.id === 'psych-investigation-is-episode')?.maxRevealLevel)
      .toBe('confirmation');
    expect(brief.usableFacts.some(fact => fact.route === 'CULT')).toBe(false);
  });

  it('reports stale fact ids as continuity warnings', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      playerKnowledge: { 'removed-fact': 'hint' },
      unlockedClueIds: ['missing-clue'],
    }));
    expect(brief.continuityWarnings).toHaveLength(2);
  });
});

describe('director fact review', () => {
  it('only authorizes knowledge events whose prerequisites are currently satisfied', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      playerPresentation: buildPlayerKnowledgeBrief({ location: 'home' }),
    }));
    const allowedPlan = {
      ...plan([]),
      knowledgeEvents: [{ eventId: 'meet:old-man', evidence: '周大爷在楼道与玩家打招呼并自我介绍。' }],
    };
    expect(reviewDirectorPlan(allowedPlan, brief).approved).toBe(true);

    const skippedPrerequisite = {
      ...plan([]),
      knowledgeEvents: [{ eventId: 'locate:water-tower-route', evidence: '直接得知水塔位置。' }],
    };
    expect(reviewDirectorPlan(skippedPrerequisite, brief).violations)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'player-knowledge-violation' })]));
  });

  it('requires concrete evidence for character knowledge progression', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      playerPresentation: buildPlayerKnowledgeBrief({
        location: 'street',
        knowledgeEvents: ['observe:shaved-man'],
      }),
    }));
    const vague = {
      ...plan([]),
      knowledgeEvents: [{ eventId: 'identify:zhao-gang-name', evidence: '他说了名字。' }],
    };
    expect(reviewDirectorPlan(vague, brief).violations)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'player-knowledge-violation' })]));

    const concrete = {
      ...plan([]),
      knowledgeEvents: [{ eventId: 'identify:zhao-gang-name', evidence: '玩家亲眼看到旅社实名登记簿上的姓名“赵刚”，照片与寸头男人一致。' }],
    };
    expect(reviewDirectorPlan(concrete, brief).approved).toBe(true);
  });

  it('allows name and public job to update together but not a behavior insight', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      playerPresentation: buildPlayerKnowledgeBrief({ location: 'street' }),
    }));
    const identityPair = {
      ...plan([]),
      knowledgeEvents: [
        { eventId: 'identify:zhao-gang-name', evidence: '玩家查看驾驶证，照片与眼前男人一致，姓名栏写着“赵刚”。' },
        { eventId: 'learn:zhao-gang-job', evidence: '同一证件和随车货运单共同表明他以货车运输为业。' },
      ],
    };
    expect(reviewDirectorPlan(identityPair, brief).approved).toBe(true);

    const withBehavior = {
      ...identityPair,
      knowledgeEvents: [
        identityPair.knowledgeEvents[0],
        { eventId: 'insight:zhao-gang-reckless', evidence: '玩家觉得他说话很冒失，应该一直都是这种性格。' },
      ],
    };
    expect(reviewDirectorPlan(withBehavior, brief).approved).toBe(false);
  });

  it('requires the complete post-anger chocolate reveal for Huihui', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      currentLocation: 'supermarket',
      activeNpcIds: ['chen-huihui'],
      playerPresentation: buildPlayerKnowledgeBrief({
        location: 'supermarket',
        knowledgeEvents: ['meet:chen-huihui'],
      }),
    }));
    const unauthorizedAnger: DirectorPlan = {
      ...plan([]),
      beats: [{
        id: 'anger', purpose: '施压', description: '陈慧慧愤怒地反驳玩家。', speakerIds: ['chen-huihui'],
      }],
    };
    expect(reviewDirectorPlan(unauthorizedAnger, brief).violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'character-performance-violation' }),
    ]));

    const completeReveal: DirectorPlan = {
      ...plan([]),
      beats: [
        { id: 'anger', purpose: '罕见失态', description: '陈慧慧的愤怒动作完整播放。', speakerIds: ['chen-huihui'] },
        { id: 'reveal', purpose: '人物揭示', description: '动作结束后，她咬下大号巧克力，说明自己低血糖，并吐槽“我一个收银员拿文件夹做什么？”', speakerIds: ['chen-huihui'] },
      ],
      knowledgeEvents: [{
        eventId: 'insight:chen-huihui-hypoglycemia',
        evidence: '愤怒动作结束后，陈慧慧当场咬下大号巧克力，说明低血糖，并说“我一个收银员拿文件夹做什么？”',
      }],
    };
    expect(reviewDirectorPlan(completeReveal, brief).approved).toBe(true);
  });

  it('rejects Zhou Deming insane until the player has confirmation-level killer knowledge', () => {
    const insanePlan: DirectorPlan = {
      ...plan([]),
      beats: [{
        id: 'break', purpose: '施压', description: '周德明露出疯狂神态，进入 insane 状态。', speakerIds: ['old-man'],
      }],
    };
    const before = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      activeNpcIds: ['old-man'],
      suspicion: { 'old-man': 50 },
      playerKnowledge: { 'a-murder-staged-fall': 'clue' },
    }));
    expect(reviewDirectorPlan(insanePlan, before).violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'character-performance-violation', factId: 'a-murder-staged-fall' }),
    ]));

    const confirmed = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      activeNpcIds: ['old-man'],
      unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
      suspicion: { 'old-man': 50 },
      playerKnowledge: { 'a-murder-staged-fall': 'confirmation' },
    }));
    expect(reviewDirectorPlan(insanePlan, confirmed).approved).toBe(true);

    const sameTurnReveal: DirectorPlan = {
      ...plan([{ factId: 'a-murder-staged-fall', level: 'confirmation', delivery: 'narration' }]),
      beats: [
        { id: 'confirm', purpose: '确认凶手', description: '证据闭合，玩家确认周德明是凶手。', speakerIds: [] },
        ...insanePlan.beats,
      ],
    };
    const eligibleSameTurn = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'old-man-building',
      lockedRoute: 'A',
      activeNpcIds: ['old-man'],
      unlockedClueIds: ['a-sacrifice-list', 'a-lured-inside'],
      suspicion: { 'old-man': 50 },
      playerKnowledge: { 'a-murder-staged-fall': 'clue' },
    }));
    expect(reviewDirectorPlan(sameTurnReveal, eligibleSameTurn).approved).toBe(true);
  });

  it('distinguishes an explicit denial from a confession-by-silence for lies-about characters', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 5,
      currentLocation: 'water-tower',
      lockedRoute: 'B',
      activeNpcIds: ['detective-a'],
      suspicion: { 'old-man': 0, 'detective-a': 50, 'detective-b': 42, self: 0 },
      unlockedClueIds: ['b-water-tower-blood', 'b-detective-coverup'],
      playerKnowledge: {
        'b-water-tower-blood': 'clue',
        'b-detective-coverup': 'clue',
      },
    }));
    const denial: DirectorPlan = {
      ...plan([]),
      beats: [{
        id: 'deny', purpose: '拒绝自白',
        description: '赵刚始终不承认，并明确否认玩家的指控。',
        speakerIds: ['detective-a'],
      }],
    };
    expect(reviewDirectorPlan(denial, brief).violations)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'character-performance-violation' })]));

    const impliedAdmission: DirectorPlan = {
      ...plan([]),
      beats: [{
        id: 'silence', purpose: '默认认罪',
        description: '玩家陈述罪行后，赵刚低头沉默，不再反驳。',
        speakerIds: ['detective-a'],
      }],
    };
    expect(reviewDirectorPlan(impliedAdmission, brief).violations)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'character-performance-violation' })]));
    const repaired = removeConfessionBySilence({
      ...impliedAdmission,
      beats: [{ ...impliedAdmission.beats[0]!, purpose: '玩家以证据确认获准真相' }],
      revelations: [{ factId: 'b-accidental-killing', level: 'confirmation', delivery: 'narration' }],
    }, brief);
    expect(repaired.beats[0]).toMatchObject({ speakerIds: [], purpose: '由玩家以外部证据独立确认获准事实' });
    expect(reviewDirectorPlan(repaired, brief).violations)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'character-performance-violation' })]));
  });

  it('rejects a premature solution reveal', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context());
    const review = reviewDirectorPlan(plan([
      { factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' },
    ]), brief);
    expect(review.approved).toBe(false);
    expect(review.violations.some((violation) => violation.code === 'fact-not-usable')).toBe(true);
  });

  it('rejects dialogue spoken beyond npc knowledge', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({
      cycleCount: 2,
      currentLocation: 'mountain-trail',
      activeNpcIds: ['morning-witness'],
    }));
    const review = reviewDirectorPlan(plan([
      { factId: 'shared-detective-tail', level: 'hint', delivery: 'dialogue', speakerId: 'school-guard' },
    ]), brief);
    expect(review.violations.some((violation) => violation.code === 'npc-knowledge-violation')).toBe(true);
  });

  it('rejects scene plan intents pointing at unusable facts, allows plans without one', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context());
    const withPlan: DirectorPlan = {
      ...plan([]),
      scenePlan: {
        observeFocus: '客厅异常',
        investigateIntents: [
          { intent: '追查真相', factId: 'c-player-killed-fumi', costTier: 'light' },
          { intent: '无事实指向的调查', costTier: 'light' },
        ],
        actionIntents: [],
      },
    };
    const review = reviewDirectorPlan(withPlan, brief);
    expect(review.violations).toEqual([
      expect.objectContaining({ code: 'unknown-fact', factId: 'c-player-killed-fumi' }),
    ]);

    expect(reviewDirectorPlan(plan([]), brief).approved).toBe(true);
  });

  it('creates a writer packet without canonical or hidden truth', () => {
    const internalBrief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({ cycleCount: 2 }));
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const brief = buildAliasedMysteryBrief(internalBrief, aliases);
    const factAlias = aliases.factIdToAlias['shared-apron-missing'];
    const packet = buildWriterPacket(plan([
      { factId: factAlias, level: 'hint', delivery: 'object' },
    ]), brief);
    const serialized = JSON.stringify(packet);
    expect(packet.authorizedFacts[0]?.text).toContain('绿色围裙');
    expect(serialized).not.toContain('canonicalTruth');
    expect(serialized).not.toContain('玩家前夜失控扼死文穗');
    expect(serialized).not.toContain('shared-apron-missing');
  });

  it('serializes only the isolated writer packet into the writer prompt', () => {
    const internalBrief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context({ cycleCount: 2 }));
    const aliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
    const brief = buildAliasedMysteryBrief(internalBrief, aliases);
    const factAlias = aliases.factIdToAlias['shared-apron-missing'];
    const packet = buildWriterPacket(plan([
      { factId: factAlias, level: 'hint', delivery: 'object' },
    ]), brief);
    const promptText = buildWriterUserPrompt(packet, { location: 'home' });
    expect(promptText).toContain(factAlias);
    expect(promptText).not.toContain('shared-apron-missing');
    expect(promptText).not.toContain('c-player-killed-fumi');
    expect(promptText).not.toContain('canonicalTruth');
    expect(promptText).toContain('characterPerformances');
  });
});
