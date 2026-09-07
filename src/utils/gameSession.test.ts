import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ParsedContent, SaveSlot } from '../sillytavern/types';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { createParseState, parseChunk } from '../sillytavern/stream-parser';
import { useGameStore } from '../stores/gameStore';
import {
  buildSaveSlotPayload,
  createDefaultGameStatus,
  loadGameFromSave,
  OPENING_ASSISTANT_CONTENT,
  resolveSavedParsedContent,
  startNewGame,
} from './gameSession';
import { parseOpeningStoryline } from '../engine/opening-storyline';

vi.mock('../sillytavern/database', () => ({
  getChats: vi.fn(async () => []),
  saveChat: vi.fn(async () => undefined),
}));

const parsed: ParsedContent = {
  thinking: '',
  maintext: '对话|旁白|calm|雨还在下。',
  options: ['去便利店', '留在家里'],
  summary: '玩家准备出门',
  vars: { location: 'home' },
  observe: '观察窗外',
  investigateItems: [],
  actionItems: [],
};

const assistantMessage: ChatMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: `<maintext>${parsed.maintext}</maintext><option>去便利店\n留在家里</option><sum>${parsed.summary}</sum><vars>{"location":"home"}</vars>`,
  timestamp: 1,
  variables: { location: 'home' },
};

function createSave(overrides: Partial<SaveSlot['gameState']> = {}): SaveSlot {
  return {
    id: 'save-1',
    name: '选项界面存档',
    createdAt: 1,
    thumbnail: '',
    gameState: {
      currentSceneIndex: 0,
      currentLineIndex: 0,
      gameStatus: { time: new Date('2024-09-09T10:00:00'), stamina: 90, sanity: 80, items: [] },
      currentState: {
        bgm: null,
        background: 'home-day.png',
        character: null,
        speaker: '旁白',
        mood: 'calm',
        effect: null,
        environment: 'indoor-audible-rain',
        item: null,
      },
      sceneComplete: true,
      ...overrides,
    },
    tavernState: { variables: { location: 'home' }, messages: [assistantMessage] },
    historyIndex: 0,
  };
}

describe('new-game resource initialization', () => {
  it('starts both runtime status and Agent variables at 70 sanity', () => {
    expect(createDefaultGameStatus().sanity).toBe(70);
    expect(createDefaultVariables().sanity).toBe(70);
  });

  it('serializes one authoritative opening payload for every new chat path', () => {
    const parsedOpening = parseChunk(createParseState(), OPENING_ASSISTANT_CONTENT, { strict: true }).parsed;

    expect(parsedOpening.maintext).toContain('雨声一直响着。');
    expect(parsedOpening.maintext).toContain('先想该从哪里问起。');
    expect(parsedOpening.actionItems).toHaveLength(5);
    expect(parsedOpening.summary).toBe('开局:暴雨第五天，文穗临时不去学校且暂时联系不上');
    expect(parsedOpening.vars).toMatchObject({ location: 'home', stamina: 100, sanity: 70 });
  });

  it('replaces stale parsed options when starting a new game', async () => {
    useGameStore.setState(state => ({
      api: { ...state.api, parsedContent: parsed },
    }));

    await startNewGame();

    const next = useGameStore.getState();
    expect(next.api.parsedContent.options).toEqual([]);
    expect(next.api.parsedContent.actionItems).toHaveLength(5);
    expect(next.api.parsedContent.maintext).toContain('雨声一直响着。');
  });
});

describe('choice-screen save restoration', () => {
  beforeEach(() => {
    useGameStore.setState(state => ({
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-1',
        chats: [{
          id: 'chat-1',
          name: 'test',
          messages: [assistantMessage],
          characterName: '文穗',
          userName: '玩家',
          presetId: null,
          lorebookIds: [],
          variables: { location: 'home' },
          createdAt: 1,
          updatedAt: 1,
        }],
      },
      api: { ...state.api, parsedContent: parsed },
      game: { ...state.game, sceneComplete: true },
    }));
  });

  it('saves the accepted options together with a completed scene', () => {
    const save = buildSaveSlotPayload('test', '');
    expect(save.gameState.sceneComplete).toBe(true);
    expect(save.gameState.parsedContent?.options).toEqual(['去便利店', '留在家里']);

    parsed.options.push('不应污染存档');
    expect(save.gameState.parsedContent?.options).toEqual(['去便利店', '留在家里']);
    parsed.options.pop();
  });

  it('restores both scene completion and options so play can continue', async () => {
    await loadGameFromSave(createSave({ parsedContent: parsed }));

    const state = useGameStore.getState();
    expect(state.game.sceneComplete).toBe(true);
    expect(state.api.parsedContent.options).toEqual(['去便利店', '留在家里']);
    expect(state.api.isStreaming).toBe(false);
    expect(state.game.isWaitingForAI).toBe(false);
    expect(state.api.turnRecovery.phase).toBe('idle');
  });

  it('recovers options from the last AI response for legacy saves', () => {
    const recovered = resolveSavedParsedContent(createSave(), [assistantMessage]);
    expect(recovered.maintext).toBe(parsed.maintext);
    expect(recovered.options).toEqual(['去便利店', '留在家里']);
    expect(recovered.summary).toBe(parsed.summary);
  });

  it('preserves opening knowledge events when restoring a mid-prologue save', async () => {
    const openingScene = parseOpeningStoryline();
    const toukoUnlockIndex = openingScene.lines.findIndex(line => line.knowledgeEvents?.includes('meet:touko'));
    const save = createSave({ currentLineIndex: toukoUnlockIndex });
    save.tavernState.messages = [{
      id: 'opening-message',
      role: 'assistant',
      content: OPENING_ASSISTANT_CONTENT,
      timestamp: 1,
      variables: { location: 'home' },
    }];

    await loadGameFromSave(save);

    const restoredLine = useGameStore.getState().game.currentScene?.lines[toukoUnlockIndex];
    expect(restoredLine?.knowledgeEvents).toContain('meet:touko');
  });
});
