import { describe, expect, it } from 'vitest';
import type { ChatMessage, Scene } from '../sillytavern/types';
import {
  buildTurnCommit,
  compileTurnContext,
  estimateTokens,
  migrateChatWorldMemory,
  normalizeWorldMemory,
} from './world-memory';

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
  });

  it('uses a conservative CJK-aware token estimate', () => {
    expect(estimateTokens('这是十个左右的中文字')).toBeGreaterThan(8);
    expect(estimateTokens('abcdefghijkl')).toBeLessThan(10);
  });
});
