// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CycleResetWatcher } from './CycleResetWatcher';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import * as database from '../../sillytavern/database';

describe('cycle reset persistence boundary', () => {
  const baseline = useGameStore.getState();
  afterEach(() => { cleanup(); vi.restoreAllMocks(); useGameStore.setState(baseline, true); });
  it.each([false, true])('keeps the pending reset until saved (reselect same chat: %s)', async reselectChat => {
    let finish!: () => void;
    vi.spyOn(database, 'saveChat').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const variables = { ...createDefaultVariables(), cycleCount: 1, stamina: 0 };
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: 'watcher', variables,
        chats: [{ id: 'watcher', name: 'test', messages: [], variables, characterName: 'fumi', userName: 'player',
          presetId: null, lorebookIds: [], createdAt: 1, updatedAt: 1 }] },
      api: { ...state.api, isStreaming: false },
      game: { ...state.game, pendingCycleReset: 'stamina', sceneComplete: true,
        currentScene: { id: 'previous-scene', lines: [
          { speaker: '旁白', text: '你走到路口。' }, { speaker: '旁白', text: '你耗尽体力，倒在雨里。' },
        ] },
        currentLineIndex: 1,
        endingPanel: { ...state.game.endingPanel, visible: false, pendingEndingId: null } },
    }));
    render(<CycleResetWatcher />);
    if (reselectChat) {
      act(() => { useGameStore.getState().actions.setActiveChatId('watcher'); });
    }
    expect(useGameStore.getState().game.pendingCycleReset).toBe('stamina');
    expect(useGameStore.getState().game.sceneComplete).toBe(true);
    expect(useGameStore.getState().game.currentScene?.id).toBe('previous-scene');
    expect(useGameStore.getState().game.currentLineIndex).toBe(1);
    expect(useGameStore.getState().tavern.variables.cycleCount).toBe(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(useGameStore.getState().game.pendingCycleReset).toBeNull());
    expect(useGameStore.getState().tavern.chats[0].messages).toHaveLength(1);
    expect(useGameStore.getState().game.currentScene?.lines.some(line => line.text.includes('熟悉'))).toBe(true);
  });

  it('does not consume another chat\'s pending reset when switching during a save', async () => {
    let finishPreviousSave!: () => void;
    vi.spyOn(database, 'saveChat').mockImplementation(chat => chat.id === 'previous'
      ? new Promise<void>(resolve => { finishPreviousSave = resolve; })
      : Promise.resolve());
    const previousVariables = { ...createDefaultVariables(), cycleCount: 1, stamina: 0 };
    const nextVariables = { ...createDefaultVariables(), cycleCount: 1, stamina: 100, sanity: 80,
      time: '2024-09-09T10:30:00' };
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: 'previous', variables: previousVariables,
        chats: [
          { id: 'previous', name: 'previous', messages: [], variables: previousVariables,
            characterName: 'fumi', userName: 'player', presetId: null, lorebookIds: [], createdAt: 1, updatedAt: 1 },
          { id: 'next', name: 'next', messages: [], variables: nextVariables,
            characterName: 'fumi', userName: 'player', presetId: null, lorebookIds: [], createdAt: 1, updatedAt: 1 },
        ] },
      api: { ...state.api, isStreaming: false },
      game: { ...state.game, pendingCycleReset: 'stamina', sceneComplete: true,
        gameStatus: { ...state.game.gameStatus, stamina: 0, sanity: 8, time: new Date('2024-09-09T23:00:00') },
        currentState: { ...state.game.currentState, speaker: '赵刚', character: 'detective-a' },
        currentScene: { id: 'previous-scene', lines: [
          { speaker: '旁白', text: '你走到路口。' }, { speaker: '旁白', text: '你耗尽体力，倒在雨里。' },
        ] },
        currentLineIndex: 1,
        endingPanel: { ...state.game.endingPanel, visible: false, pendingEndingId: null } },
    }));
    render(<CycleResetWatcher />);

    await act(async () => { useGameStore.getState().actions.setActiveChatId('next'); });
    await act(async () => { finishPreviousSave(); });

    const state = useGameStore.getState();
    expect(state.tavern.activeChatId).toBe('next');
    expect(state.tavern.variables.cycleCount).toBe(1);
    expect(state.tavern.variables.stamina).toBe(100);
    expect(state.game.gameStatus.stamina).toBe(100);
    expect(state.game.gameStatus.sanity).toBe(80);
    expect(state.game.gameStatus.time).toEqual(new Date('2024-09-09T10:30:00'));
    expect(state.tavern.chats.every(chat => chat.messages.length === 0)).toBe(true);
    expect(state.game.pendingCycleReset).toBeNull();
    expect(state.game.currentScene).toBeNull();
    expect(state.game.currentLineIndex).toBe(0);
    expect(state.game.sceneComplete).toBe(false);
    expect(state.game.currentState.speaker).toBeNull();
    expect(state.game.currentState.character).toBeNull();
    expect(state.api.error).toBeNull();
  });
});
