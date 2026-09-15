import { describe, expect, it } from 'vitest';
import { settleCycleVariables } from './cycle-settlement';
import { compileTurnContext, buildTurnCommit } from '../memory/world-memory';
import { maintextToScene } from './scene-parser';
import { investigatedStoryState } from '../test-support/story-state';
import type { ChatMessage } from '../sillytavern/types';

describe('story version boundaries', () => {
  it('keeps an unfinished selected version through an ordinary repeated morning', () => {
    const next = settleCycleVariables({ ...investigatedStoryState('A'), overlay: 'CULT', finalChoice: null });
    expect(next.lockedRoute).toBe('A');
    expect(next.overlay).toBe('CULT');
    expect(next.cycleCount).toBe(6);
  });

  it('opens a new version after a final choice without importing the old exclusive answer', () => {
    const previous = investigatedStoryState('A');
    const next = settleCycleVariables({ ...previous, finalChoice: 'report', unlockedClues: Object.keys(previous.mysteryKnowledge as object) });
    expect(next.lockedRoute ?? null).toBeNull();
    expect(next.storyProgress?.versionStartCycle).toBe(6);
    expect(next.mysteryKnowledge).not.toHaveProperty('a-murder-staged-fall');
    expect(next.mysteryKnowledge).not.toHaveProperty('a-window-transfer-match');
    expect(next.mysteryKnowledge).not.toHaveProperty('cult-sacrifice-powers-loop');
    expect(next.mysteryKnowledge).toHaveProperty('a-sacrifice-list', 'clue');
    expect(next.unlockedClues).not.toContain('a-window-transfer-match');
  });

  it('does not offer previous-version prose as an accepted historical source, including legacy history fallback', () => {
    const oldText = '旧版本已经确认周德明杀害了文穗。';
    const commit = buildTurnCommit({ turnId: 'old-case', turnIndex: 1, createdAt: 1,
      occurredAt: '2024-09-09T17:00:00', cycleCount: 5, locationId: 'home', summary: oldText,
      scene: maintextToScene(`对话|旁白|calm|${oldText}`), beforeVariables: {},
      settledVariables: { cycleCount: 5, mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' } },
      cognitionDeltas: [{ observerId: 'player', propositionId: 'belief:old-killer', status: 'confirmed', confidence: 1, summary: oldText }],
    });
    const history: ChatMessage[] = [{ id: 'old-case', role: 'assistant', timestamp: 1,
      content: `<maintext>对话|旁白|calm|${oldText}</maintext><sum>${oldText}</sum>`, variables: { cycleCount: 5 } }];
    for (const memory of [commit.worldMemory, undefined]) {
      const bundle = compileTurnContext({ userInput: '核对周德明的材料', locationId: 'home', activeNpcIds: [], history,
        variables: { cycleCount: 6, storyProgress: { presentedBeatIds: [], versionStartCycle: 6 }, worldMemory: memory } });
      expect(JSON.stringify(bundle)).not.toContain(oldText);
      expect(bundle.selectedIds).not.toContain('message:old-case');
    }
    expect(history[0].content).toContain(oldText);
    expect(commit.worldMemory.episodes.some(episode => episode.summary === oldText)).toBe(true);
  });
});
