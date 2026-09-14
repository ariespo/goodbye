import { describe, expect, it } from 'vitest';
import type { ChatMessage, Scene } from '../sillytavern/types';
import {
  buildTurnCommit,
  compileTurnContext,
  estimateTokens,
  migrateChatWorldMemory,
  normalizeWorldMemory,
} from './world-memory';
import { candidateFingerprint, resetCharacterContinuity, type ValidatedCharacterContinuityEffects } from './character-continuity';

const scene = (knowledgeEvents: string[] = []): Scene => ({
  id: 'scene-1',
  lines: [
    { id: 'scene-1:line:0', speaker: '店员', text: '欢、欢迎光临……吃吃。' },
    {
      id: 'scene-1:line:1',
      speaker: '旁白',
      text: '这是附近便利店的店员陈慧慧，她总是紧张兮兮，笑得很不自然。',
      knowledgeEvents,
    },
  ],
});

describe('unified world memory', () => {
  it('migrates legacy knowledge idempotently', () => {
    const chat = {
      id: 'chat-1', name: 'test', messages: [], characterName: '少女', userName: 'CC',
      presetId: null, lorebookIds: [], createdAt: 1, updatedAt: 1,
      variables: {
        knowledgeEvents: ['meet:chen-huihui'],
        mysteryKnowledge: { F001: 'clue' },
        playerNameKnownByNpcIds: ['detective-b'],
      },
    };
    const once = migrateChatWorldMemory(chat);
    const twice = migrateChatWorldMemory(once);
    expect(twice.variables.worldMemory).toEqual(once.variables.worldMemory);
    expect(once.variables.worldMemory.cognition).toEqual(expect.arrayContaining([
      expect.objectContaining({ cognitionId: 'player|knowledge:meet:chen-huihui' }),
      expect.objectContaining({ cognitionId: 'player|fact:F001', status: 'believed' }),
      expect.objectContaining({ cognitionId: 'detective-b|identity:player-name', identityScope: 'full-name' }),
    ]));
  });

  it('commits Huihui introduction, profile cognition and episode as one turn', () => {
    const before = {
      cycleCount: 1,
      knowledgeEvents: ['know:home', 'know:supermarket'],
      mysteryKnowledge: {},
      playerNameKnownByNpcIds: [],
    };
    const accepted = {
      ...before,
      location: 'supermarket',
      knowledgeEvents: [...before.knowledgeEvents, 'meet:chen-huihui'],
    };
    const commit = buildTurnCommit({
      turnId: 'turn-1', turnIndex: 1, createdAt: 2,
      occurredAt: '2026-08-15T08:30:00.000Z', locationId: 'supermarket', cycleCount: 1,
      summary: '玩家在便利店认出了陈慧慧。',
      scene: scene(['meet:chen-huihui']),
      beforeVariables: before,
      settledVariables: accepted,
    });
    expect(commit.knowledgeEvents).toContain('meet:chen-huihui');
    expect(commit.worldMemory.events).toContainEqual(expect.objectContaining({
      eventId: 'turn:turn-1', locationId: 'supermarket', actorIds: ['chen-huihui'],
    }));
    expect(commit.worldMemory.cognition).toContainEqual(expect.objectContaining({
      cognitionId: 'player|knowledge:meet:chen-huihui', status: 'confirmed',
      sourceEventIds: ['turn:turn-1'],
    }));
    expect(commit.worldMemory.episodes).toContainEqual(expect.objectContaining({
      episodeId: 'episode:turn-1', summary: '玩家在便利店认出了陈慧慧。',
    }));
  });

  it('revises one observer belief without changing objective events or other observers', () => {
    const first = buildTurnCommit({
      turnId: 'turn-1', turnIndex: 1, createdAt: 1, occurredAt: '2026-08-15T08:10:00.000Z',
      locationId: 'supermarket', cycleCount: 1, summary: '玩家觉得慧慧有些可疑。', scene: scene(),
      beforeVariables: {}, settledVariables: {}, cognitionDeltas: [{
        observerId: 'player', propositionId: 'belief:huihui-hostile', subjectId: 'chen-huihui',
        status: 'suspected', confidence: 0.6, summary: '玩家怀疑慧慧在隐瞒敌意。',
      }, {
        observerId: 'old-man', propositionId: 'belief:huihui-hostile', subjectId: 'chen-huihui',
        status: 'believed', confidence: 0.4, summary: '周德明觉得慧慧只是怕生。',
      }],
    });
    const second = buildTurnCommit({
      turnId: 'turn-2', turnIndex: 2, createdAt: 2, occurredAt: '2026-08-15T09:10:00.000Z',
      locationId: 'supermarket', cycleCount: 1, summary: '玩家理解了慧慧不自然的原因。', scene: scene(),
      beforeVariables: { worldMemory: first.worldMemory }, settledVariables: { worldMemory: first.worldMemory },
      cognitionDeltas: [{
        observerId: 'player', propositionId: 'belief:huihui-hostile', subjectId: 'chen-huihui',
        status: 'disproved', confidence: 0.9, summary: '玩家确认她的不自然主要来自长期孤僻和受欺凌经历。',
      }],
    });
    expect(second.worldMemory.events).toHaveLength(2);
    expect(second.worldMemory.cognition.find(item => item.cognitionId === 'player|belief:huihui-hostile'))
      .toMatchObject({ status: 'disproved', lastUpdatedTurn: 2 });
    expect(second.worldMemory.cognition.find(item => item.cognitionId === 'old-man|belief:huihui-hostile'))
      .toMatchObject({ status: 'believed', lastUpdatedTurn: 1 });
  });

  it('retrieves relevant old episodes while keeping only two raw turns', () => {
    const oldEpisode = {
      episodeId: 'episode:old', turnId: 'old', turnIndex: 1, cycleCount: 1,
      locationId: 'supermarket', actorIds: ['chen-huihui'], summary: '慧慧曾因紧张把零钱撒了一地。',
      factIds: [], cognitionIds: [], unresolvedTags: ['慧慧'], salience: 0.9, createdAt: 1,
    };
    const variables = { worldMemory: { ...normalizeWorldMemory({}), episodes: [oldEpisode] } };
    const history: ChatMessage[] = Array.from({ length: 10 }, (_, index) => ({
      id: `m-${index}`, role: index % 2 ? 'assistant' : 'user', content: `无关历史 ${index}`,
      timestamp: index, variables: {},
    }));
    const bundle = compileTurnContext({
      userInput: '去便利店找慧慧', locationId: 'supermarket', activeNpcIds: ['chen-huihui'], history, variables,
    });
    expect(bundle.recentMessages.map(item => item.id)).toEqual(['m-6', 'm-7', 'm-8', 'm-9']);
    expect(bundle.relevantEpisodes.map(item => item.episodeId)).toContain('episode:old');
    expect(bundle.selectedIds).toContain('episode:old');
    expect(bundle.relevantBackgroundFacts.map(item => item.factId)).toContain('bg:supermarket-regulars');
    expect(JSON.stringify(bundle.writerMemory)).not.toContain('bg:detective-dossier');
  });

  it('commits approved soft canon only when its evidence text is actually presented', () => {
    const proposal = {
      proposalId: 'huihui-remembers-coffee',
      text: '慧慧记得玩家常买无糖咖啡。',
      characterIds: ['player', 'chen-huihui'],
      locationIds: ['supermarket'],
      knowerIds: ['chen-huihui'],
      evidenceText: '你以前常买无糖的，对吧',
    };
    const absent = buildTurnCommit({
      turnId: 'soft-absent', turnIndex: 2, createdAt: 2, occurredAt: '2026-08-15T09:00:00.000Z',
      locationId: 'supermarket', cycleCount: 1, summary: '普通结账。', scene: scene(),
      beforeVariables: {}, settledVariables: {}, approvedBackgroundFactProposals: [proposal], narrativeText: '欢迎光临。',
    });
    expect(absent.worldMemory.softCanonFacts).toEqual([]);
    const committed = buildTurnCommit({
      turnId: 'soft-present', turnIndex: 2, createdAt: 2, occurredAt: '2026-08-15T09:00:00.000Z',
      locationId: 'supermarket', cycleCount: 1, summary: '慧慧记得玩家的口味。', scene: scene(),
      beforeVariables: {}, settledVariables: {}, approvedBackgroundFactProposals: [proposal],
      narrativeText: '慧慧小声问：“你以前常买无糖的，对吧”',
    });
    expect(committed.worldMemory.softCanonFacts).toContainEqual(expect.objectContaining({
      factId: 'soft:huihui-remembers-coffee', level: 'soft',
    }));
    expect(committed.worldMemory.cognition).toContainEqual(expect.objectContaining({
      cognitionId: 'chen-huihui|background:soft:huihui-remembers-coffee',
    }));
  });

  it('uses a conservative CJK-aware token estimate', () => {
    expect(estimateTokens('这是十个左右的中文字')).toBeGreaterThan(8);
    expect(estimateTokens('abcdefghijkl')).toBeLessThan(10);
  });

  it('shows detective dossier knowledge to the director but not to the undercover writer', () => {
    const bundle = compileTurnContext({
      userInput: '去医院询问新来的护士', locationId: 'hospital', activeNpcIds: ['detective-b'],
      history: [], variables: {},
    });
    expect(JSON.stringify(bundle.directorMemory)).toContain('bg:detective-dossier');
    expect(JSON.stringify(bundle.writerMemory)).not.toContain('bg:detective-dossier');
    expect(bundle.relevantCognition).toContainEqual(expect.objectContaining({
      cognitionId: 'detective-b|identity:player-name', identityScope: 'full-name',
    }));
  });

  it('normalizes old v2 ledgers and downgrades forged baseline provenance', () => {
    const memory = normalizeWorldMemory({ cycleCount: 3, worldMemory: {
      version: 2,
      canonicalTruthVersion: 'mystery-truth-graph',
      events: [], episodes: [], softCanonFacts: [],
      cognition: [{
        cognitionId: 'detective-a|claim:forged', observerId: 'detective-a', propositionId: 'claim:forged',
        status: 'confirmed', confidence: 1, sourceEventIds: ['forged'], firstLearnedTurn: 1,
        lastUpdatedTurn: 1, summary: '伪造的永久认知', provenance: 'authored-baseline', scope: 'durable', acquiredCycle: 1,
      }, {
        cognitionId: 'detective-a|identity:player-name', observerId: 'detective-a', propositionId: 'identity:player-name',
        subjectId: 'player', status: 'disproved', confidence: 0, sourceEventIds: ['forged'], firstLearnedTurn: 9,
        lastUpdatedTurn: 9, summary: '篡改的身份基线', provenance: 'authored-baseline', scope: 'day', acquiredCycle: 3,
      }, {
        cognitionId: 'detective-b|claim:invalid', observerId: 'detective-b', propositionId: 'claim:invalid',
        status: 'omniscient', confidence: 1, sourceEventIds: [], firstLearnedTurn: 1, lastUpdatedTurn: 1,
        summary: '无效认知状态',
      }],
      disclosures: [{ id: 'bad-disclosure', cycleCount: 3, speakerId: 'player', listenerIds: [], propositionId: 'claim:x', sourceEventId: 'turn:x', evidenceQuote: 'x' }],
      commitments: [{ id: 'bad-commitment', cycleCount: 3, actorId: 'detective-a', recipientId: 'player', action: '会面', locationId: 'police-station', dueAt: '2024-09-09T10:00:00', status: 'active', sourceEventId: 'turn:x', evidenceQuote: '会面' }],
    } });
    expect(memory.disclosures).toEqual([]);
    expect(memory.commitments).toEqual([]);
    expect(memory.acknowledgedCommitmentBoundaryIds).toEqual([]);
    expect(memory.cognition.some(item => item.cognitionId === 'detective-b|claim:invalid')).toBe(false);
    expect(memory.cognition).toContainEqual(expect.objectContaining({
      cognitionId: 'detective-a|claim:forged', provenance: 'legacy-import', scope: 'day', acquiredCycle: 3,
    }));
    expect(memory.cognition).toContainEqual(expect.objectContaining({
      cognitionId: 'detective-a|identity:player-name', provenance: 'authored-baseline', status: 'confirmed', acquiredCycle: 0,
    }));
    expect(normalizeWorldMemory({ cycleCount: 3, worldMemory: memory })).toEqual(memory);
  });

  it('commits validated continuity effects atomically with stable turn IDs', () => {
    const narrativeText = '<maintext>对话|赵刚|calm|我十点在学校把值班表给你。</maintext><sum>约定</sum>';
    const effects: ValidatedCharacterContinuityEffects = {
      candidateId: candidateFingerprint(narrativeText),
      cognitionDeltas: [{
        observerId: 'player', propositionId: 'claim:promise', status: 'heard', confidence: 1,
        summary: '玩家听到赵刚的承诺', provenance: 'accepted-turn', scope: 'durable', acquiredCycle: 1,
        evidenceSpans: [{ lineIndex: 0, quote: '我十点在学校把值班表给你' }],
      }],
      disclosures: [{
        speakerId: 'detective-a', listenerIds: ['player'], propositionId: 'claim:promise',
        evidenceQuote: '我十点在学校把值班表给你', evidenceSpans: [{ assertionIndex: 0, lineIndex: 0, quote: '我十点在学校把值班表给你' }],
      }],
      commitmentOperations: [{
        operation: 'accept', actorId: 'detective-a', recipientId: 'player', action: '把值班表交给玩家',
        locationId: 'school', dueAt: '2024-09-09T10:00:00', evidenceQuote: '我十点在学校把值班表给你',
      }],
    };
    const options = {
      turnId: 'continuity-1', turnIndex: 1, createdAt: 10, occurredAt: '2024-09-09T09:00:00',
      locationId: 'school', cycleCount: 1, summary: '赵刚答应交出值班表。',
      scene: scene(), settledVariables: {}, continuityEffects: effects, narrativeText,
    };
    const first = buildTurnCommit({ ...options, beforeVariables: {} });
    const second = buildTurnCommit({ ...options, beforeVariables: { cycleCount: 1, worldMemory: first.worldMemory } });
    expect(second.worldMemory.events.filter(item => item.eventId === 'turn:continuity-1')).toHaveLength(1);
    expect(second.worldMemory.episodes.filter(item => item.episodeId === 'episode:continuity-1')).toHaveLength(1);
    expect(second.worldMemory.disclosures).toEqual([expect.objectContaining({
      id: 'disclosure:continuity-1:0', sourceEventId: 'turn:continuity-1', cycleCount: 1,
    })]);
    expect(second.worldMemory.commitments).toEqual([expect.objectContaining({
      id: 'commitment:continuity-1:0', sourceEventId: 'turn:continuity-1', status: 'active',
    })]);
    expect(second.worldMemory.cognition.find(item => item.cognitionId === 'player|claim:promise')?.sourceEventIds)
      .toEqual(['turn:continuity-1']);
  });

  it('rejects the entire continuity effect set when accepted maintext changes', () => {
    const effects: ValidatedCharacterContinuityEffects = {
      candidateId: candidateFingerprint('对话|赵刚|calm|原候选。'),
      cognitionDeltas: [{ observerId: 'player', propositionId: 'claim:x', status: 'heard', confidence: 1, summary: 'x' }],
      disclosures: [], commitmentOperations: [],
    };
    expect(() => buildTurnCommit({
      turnId: 'mismatch', turnIndex: 1, createdAt: 1, occurredAt: '2024-09-09T09:00:00',
      locationId: 'home', cycleCount: 1, summary: 'changed', scene: scene(), beforeVariables: {}, settledVariables: {},
      narrativeText: '对话|赵刚|calm|修复后的候选。', continuityEffects: effects,
    })).toThrow(/fingerprint mismatch/i);
  });

  it('scopes NPC cognition to active observers and the current cycle', () => {
    const base = normalizeWorldMemory({ cycleCount: 3 });
    const cognition = [
      ...base.cognition,
      { cognitionId: 'player|claim:durable', observerId: 'player', propositionId: 'claim:durable', status: 'believed' as const, confidence: 1, sourceEventIds: ['turn:x'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '玩家跨日记得', provenance: 'accepted-turn' as const, scope: 'durable' as const, acquiredCycle: 2 },
      { cognitionId: 'detective-a|claim:today', observerId: 'detective-a', propositionId: 'claim:today', status: 'heard' as const, confidence: 1, sourceEventIds: ['turn:y'], firstLearnedTurn: 2, lastUpdatedTurn: 2, summary: '赵刚今天听到', provenance: 'accepted-turn' as const, scope: 'day' as const, acquiredCycle: 3 },
      { cognitionId: 'detective-a|claim:yesterday', observerId: 'detective-a', propositionId: 'claim:yesterday', status: 'heard' as const, confidence: 1, sourceEventIds: ['turn:z'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '赵刚昨天听到', provenance: 'accepted-turn' as const, scope: 'day' as const, acquiredCycle: 2 },
      { cognitionId: 'detective-b|claim:inactive', observerId: 'detective-b', propositionId: 'claim:inactive', status: 'believed' as const, confidence: 1, sourceEventIds: ['turn:q'], firstLearnedTurn: 2, lastUpdatedTurn: 2, summary: '林静认知与输入文字相关', provenance: 'accepted-turn' as const, scope: 'day' as const, acquiredCycle: 3 },
    ];
    const bundle = compileTurnContext({
      userInput: '林静认知与输入文字相关', locationId: 'school', activeNpcIds: ['detective-a'], history: [],
      variables: { cycleCount: 3, worldMemory: { ...base, cognition } },
    });
    expect(bundle.relevantCognition.map(item => item.cognitionId)).toEqual(expect.arrayContaining([
      'player|claim:durable', 'detective-a|claim:today', 'detective-a|identity:player-name',
    ]));
    expect(bundle.relevantCognition.map(item => item.cognitionId)).not.toContain('detective-a|claim:yesterday');
    expect(bundle.relevantCognition.map(item => item.cognitionId)).not.toContain('detective-b|claim:inactive');
    expect(JSON.stringify(bundle.writerMemory)).not.toContain('detective-a|identity:player-name');
  });

  it('keeps historical disclosures as player recollection without restoring NPC day cognition', () => {
    const before = normalizeWorldMemory({ cycleCount: 3, worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 3 }),
      cognition: [{ cognitionId: 'detective-a|claim:old', observerId: 'detective-a', propositionId: 'claim:old', status: 'heard', confidence: 1, sourceEventIds: ['turn:x'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '旧日听闻', provenance: 'accepted-turn', scope: 'day', acquiredCycle: 3 }],
      disclosures: [{ id: 'disclosure:x:0', cycleCount: 3, speakerId: 'player', listenerIds: ['detective-a'], propositionId: 'fact:canonical-secret', sourceEventId: 'turn:x', evidenceQuote: '旧日陈述', evidenceSpans: [{ lineIndex: 0, quote: '旧日陈述' }] }],
    } });
    const after = resetCharacterContinuity(before, 4);
    const bundle = compileTurnContext({
      userInput: '回想旧日陈述', locationId: 'home', activeNpcIds: ['detective-a'], history: [],
      variables: { cycleCount: 4, worldMemory: after },
    });
    expect(JSON.stringify(bundle.writerMemory)).toContain('旧日陈述');
    expect(JSON.stringify(bundle.writerMemory)).not.toContain('fact:canonical-secret');
    expect(bundle.relevantCognition.some(item => item.cognitionId === 'detective-a|claim:old')).toBe(false);
  });
});
