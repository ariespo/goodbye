import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import { commitProgramConclusion, lockProgramConclusion } from './conclusionFlow';
import { investigatedStoryState } from '../test-support/story-state';
import * as database from '../sillytavern/database';

const initialState = useGameStore.getState();

afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(initialState, true);
});

function setTestState(variables: Record<string, unknown>, sceneComplete = true) {
  useGameStore.setState(state => ({
    tavern: {
      ...state.tavern,
      activeChatId: null,
      chats: [],
      variables: { ...createDefaultVariables(), ...variables },
    },
    game: {
      ...state.game,
      sceneComplete,
      isWaitingForAI: false,
      endingPanel: {
        visible: false,
        activeEndingId: null,
        pendingEndingId: null,
        isPreview: false,
        isAnimating: false,
      },
    },
    ui: { ...state.ui, showConclusion: true },
  }));
}

describe('program conclusion flow', () => {
  it('locks an eligible route in the store', async () => {
    setTestState({
      cycleCount: 4,
      suspicion: { ...createDefaultVariables().suspicion, 'old-man': 50 },
      mysteryKnowledge: { 'a-orphanage-contact': 'clue', 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' },
    });

    const result = await lockProgramConclusion('A');

    expect(result.accepted).toBe(true);
    expect(useGameStore.getState().tavern.variables.lockedRoute).toBe('A');
    expect(useGameStore.getState().ui.showConclusion).toBe(true);
  });

  it('commits a deterministic ending and closes the conclusion panel', async () => {
    setTestState(investigatedStoryState('A'));

    const result = await commitProgramConclusion('private');
    const state = useGameStore.getState();

    expect(result).toMatchObject({ accepted: true, endingId: 'A-2' });
    expect(state.tavern.variables.finalChoice).toBe('private');
    expect(state.game.endingPanel.pendingEndingId).toBe('A-2');
    expect(state.game.sceneComplete).toBe(false);
    expect(state.game.currentScene?.lines.some(line => line.text.includes('私下报复周德明'))).toBe(true);
    expect(state.ui.showConclusion).toBe(false);
  });

  it('refuses a final choice while the current scene is still playing', async () => {
    setTestState({ lockedRoute: 'A' }, false);

    const result = await commitProgramConclusion('report');

    expect(result.accepted).toBe(false);
    expect(useGameStore.getState().game.endingPanel.pendingEndingId).toBeNull();
  });

  it('publishes the pending ending with its unread bridge before a slow save can release playback', async () => {
    setTestState(investigatedStoryState('A'));
    let release!: () => void;
    vi.spyOn(database, 'saveChat').mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'ending-save', chats: [{
      id: 'ending-save', name: 'test', messages: [], characterName: 'fumi', userName: 'player',
      presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
    }] } }));
    const exposedStates: Array<{ pending: string | null; complete: boolean; text: string }> = [];
    const stop = useGameStore.subscribe(state => exposedStates.push({
      pending: state.game.endingPanel.pendingEndingId,
      complete: state.game.sceneComplete,
      text: state.game.currentScene?.lines.map(line => line.text).join('') ?? '',
    }));
    const task = commitProgramConclusion('private');
    try {
      expect(useGameStore.getState().game.sceneComplete).toBe(false);
      expect(exposedStates.filter(state => state.pending === 'A-2')).not.toHaveLength(0);
      expect(exposedStates.filter(state => state.pending === 'A-2').every(state => !state.complete && state.text.includes('私下报复周德明'))).toBe(true);
    } finally {
      stop();
      release();
      await task;
    }
  });
});
