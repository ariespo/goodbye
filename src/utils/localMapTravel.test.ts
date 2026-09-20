import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { createDefaultGameStatus } from './gameSession';
import { buildMapTravelTransaction, prepareMapTravel } from './mapTravel';
import { resumeLocalMapTravelContinuation } from './localMapTravel';

vi.mock('../sillytavern/database', () => ({ saveChat: vi.fn(async () => {}) }));

describe('local travel summary', () => {
  const initialState = useGameStore.getState();
  afterEach(() => { useGameStore.setState(initialState, true); });

  it('summarizes only the resumed part of an interrupted trip and binds its read progress', async () => {
    const variables = createDefaultVariables();
    const gameStatus = { ...createDefaultGameStatus(), time: new Date('2024-09-09T15:55:00') };
    const prepared = prepareMapTravel({ variables, gameStatus, destinationLocationId: 'school' });
    if (prepared.kind !== 'travel') throw new Error('expected partial trip');
    const transaction = buildMapTravelTransaction({ variables, gameStatus, prepared,
      knowledgeEvents: [], endings: [], endingsSeen: [], hasEndingInProgress: false });
    const pendingVariables = { ...transaction.variables, deathNews: 'delivered' };
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: 'travel', variables: pendingVariables,
        chats: [{ id: 'travel', name: 'travel', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: pendingVariables, createdAt: 1, updatedAt: 1 }] },
      game: { ...state.game, gameStatus: transaction.gameStatus, history: [] },
    }));
    const continuation = pendingVariables.actionContinuity!.continuation!;
    await resumeLocalMapTravelContinuation(continuation.actionId);
    const state = useGameStore.getState();
    const accepted = state.tavern.chats[0].messages.at(-1)!;
    expect(accepted.narrativeSummary).toMatchObject({ version: 1,
      startedAt: new Date('2024-09-09T16:00:00').toISOString(), endedAt: new Date('2024-09-09T16:05:00').toISOString(),
      startLocationId: 'home', endLocationId: 'school', participants: ['玩家'], cycleCount: 1 });
    expect(accepted.parsed?.summary).toContain('继续');
    expect(accepted.parsed?.summary).toContain('5分钟');
    expect(accepted.parsed?.summary).not.toContain('10分钟');
    expect(state.game.currentScene?.sourceMessageId).toBe(accepted.id);
  });
});
