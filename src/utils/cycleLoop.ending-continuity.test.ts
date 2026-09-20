import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../stores/gameStore';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { GOODBYE_OPTION_TEXT, STAY_OPTION_TEXT, handleCycleMetaOption } from './cycleLoop';

const baseline = useGameStore.getState();
afterEach(() => useGameStore.setState(baseline, true));

describe('meta ending entry', () => {
  it.each([
    [STAY_OPTION_TEXT, 'STAY'], ['不出门，陪文穗过完今天', 'STAY'],
    [GOODBYE_OPTION_TEXT, 'TRUE'], ['对文穗说再见', 'TRUE'],
  ])('plays a recollection bridge for %s before releasing %s to the ending player', async (option, endingId) => {
    const variables = { ...createDefaultVariables(), cycleCount: 9, stayStreak: 2, stayedEver: true,
      lockedRoute: 'C', routesLockedEver: ['A', 'B', 'C'], mysteryKnowledge: { 'c-player-killed-fumi': 'confirmation' } };
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: null, chats: [], variables },
      game: { ...state.game, sceneComplete: true, currentScene: null, endingsSeen: ['A-1', 'B-1', 'C-1'] },
    }));
    expect(await handleCycleMetaOption(option)).toBe(true);
    const state = useGameStore.getState();
    expect(state.game.endingPanel.pendingEndingId).toBe(endingId);
    expect(state.game.sceneComplete).toBe(false);
    expect(state.game.currentScene?.lines.some(line => /记忆|回忆/.test(line.text))).toBe(true);
    expect(state.game.currentScene?.lines.every(line => !line.character)).toBe(true);
    expect(state.tavern.variables.lockedRoute).toBe('C');
    expect(state.tavern.variables.mysteryKnowledge).toEqual(variables.mysteryKnowledge);
  });
});
