import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import { commitProgramConclusion, lockProgramConclusion } from './conclusionFlow';

const initialState = useGameStore.getState();

afterEach(() => {
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
      mysteryKnowledge: { 'a-sacrifice-list': 'clue', 'a-lured-inside': 'clue' },
    });

    const result = await lockProgramConclusion('A');

    expect(result.accepted).toBe(true);
    expect(useGameStore.getState().tavern.variables.lockedRoute).toBe('A');
    expect(useGameStore.getState().ui.showConclusion).toBe(true);
  });

  it('commits a deterministic ending and closes the conclusion panel', async () => {
    setTestState({ lockedRoute: 'A', mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' } });

    const result = await commitProgramConclusion('private');
    const state = useGameStore.getState();

    expect(result).toMatchObject({ accepted: true, endingId: 'A-2' });
    expect(state.tavern.variables.finalChoice).toBe('private');
    expect(state.game.endingPanel.pendingEndingId).toBe('A-2');
    expect(state.game.sceneComplete).toBe(false);
    expect(state.game.currentScene?.lines.some(line => line.text.includes('最后一次对质'))).toBe(true);
    expect(state.ui.showConclusion).toBe(false);
  });

  it('refuses a final choice while the current scene is still playing', async () => {
    setTestState({ lockedRoute: 'A' }, false);

    const result = await commitProgramConclusion('report');

    expect(result.accepted).toBe(false);
    expect(useGameStore.getState().game.endingPanel.pendingEndingId).toBeNull();
  });
});
