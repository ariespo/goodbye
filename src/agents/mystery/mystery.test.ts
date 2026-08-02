import { describe, expect, it } from 'vitest';
import { buildMysteryBrief } from './brief';
import { buildWriterUserPrompt } from './prompts';
import { buildWriterPacket, reviewDirectorPlan } from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, TruthContext } from './types';
import { validateTruthGraph } from './validate';
import { buildPlayerKnowledgeBrief } from '../../data/playerKnowledge';
import { buildAliasedMysteryBrief, createFactAliasTable } from './fact-aliases';

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
  it('ships a structurally valid canonical graph', () => {
    expect(validateTruthGraph(MYSTERY_TRUTH_GRAPH)).toEqual({ valid: true, errors: [] });
  });

  it('only exposes atmospheric information in the first cycle', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, context());
    expect(brief.revealBudget.maxRevealLevel).toBe('atmosphere');
    expect(brief.usableFacts.find((fact) => fact.id === 'shared-apron-missing')?.maxRevealLevel).toBe('atmosphere');
    expect(brief.hiddenFacts.some((fact) => fact.id === 'c-player-killed-fumi')).toBe(true);
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
  });
});
