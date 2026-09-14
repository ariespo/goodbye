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

  it('keeps optional opening panels outside played maintext and stores the parsed assistant history', async () => {
    await startNewGame();
    const state = useGameStore.getState();
    const message = state.tavern.chats.find(chat => chat.id === state.tavern.activeChatId)!.messages[0];

    expect(message.parsed?.maintext).toContain('先想该从哪里问起。');
    expect(message.parsed?.maintext).not.toMatch(/<\/?(?:observe|investigate|action)>/);
    expect(message.parsed?.maintext).not.toContain('一只空衣架');
    expect(message.parsed?.observe).toContain('衣柜');
    expect(message.parsed?.actionItems).toHaveLength(5);
    expect(message.content.indexOf('</maintext>')).toBeLessThan(message.content.indexOf('<observe>'));
  });

  it('seeds only public opening continuity without treating optional observations as discovered mystery evidence', async () => {
    await startNewGame();
    const state = useGameStore.getState();
    const facts = state.tavern.variables.openingPublicContinuity as Array<{ id: string; text: string }>;

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'opening-message-0650', text: expect.stringContaining('06:50') }),
      expect.objectContaining({ id: 'opening-note', text: expect.stringContaining('可能晚一点回来') }),
      expect.objectContaining({ id: 'opening-unanswered-contact' }),
    ]));
    expect(JSON.stringify(facts)).not.toMatch(/绿色围裙|空衣架|校门口|男性|真凶/);
    expect(state.tavern.variables.mysteryKnowledge ?? {}).toEqual({});
    expect(state.api.parsedContent.observe).not.toContain('绿色围裙');
  });

  it('keeps the current opening clock distinct from the message time and unconfirmed disappearance', async () => {
    await startNewGame();
    const state = useGameStore.getState();
    expect(state.game.gameStatus.time.getHours()).toBe(8);
    expect(state.game.gameStatus.time.getMinutes()).toBe(0);
    const facts = state.tavern.variables.openingPublicContinuity as Array<{ id: string; text: string }>;
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'opening-message-0650', text: expect.stringContaining('今天不去学校') }),
      expect.objectContaining({ id: 'opening-unanswered-contact', text: expect.stringContaining('暂时联系不上') }),
    ]));
    expect(JSON.stringify(facts)).not.toMatch(/昨晚失踪|昨夜失踪|从昨晚|从昨夜/);
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

  it('restores the accepted local map arrival observation without changing saved resources or history', async () => {
    const observe = '文穗平日上学的地方。可以确认她今天是否到校。';
    const outcome = {
      resolutionId: 'map-resolution', actionId: 'map-travel:home:school', executedMinutes: 10,
      executedWorkMinutes: 0, executedTravelMinutes: 10, endTime: '2024-09-09T08:10:00',
      staminaDelta: -4, sanityDelta: 0,
    };
    const mapParsed: ParsedContent = {
      thinking: '', maintext: '场景|school-day\n对话|旁白|calm|你抵达了文穗的中学。',
      options: [], summary: '抵达学校。', vars: {}, observe,
      investigateItems: [], actionItems: [], actionOutcome: outcome,
    };
    const mapMessage: ChatMessage = {
      id: 'map-assistant', role: 'assistant', localAction: 'map-travel', timestamp: 2,
      content: `<maintext>${mapParsed.maintext}</maintext><option></option><sum>${mapParsed.summary}</sum><vars>{}</vars>`,
      variables: { location: 'school', time: '2024-09-09T08:10:00' },
      acceptedActionOutcome: outcome, parsed: mapParsed,
    };
    const history = [{
      turnIndex: 0, timestamp: 2, summary: '抵达学校。',
      gameStatus: { time: new Date('2024-09-09T08:10:00'), stamina: 96, sanity: 70, items: [] },
      variables: mapMessage.variables,
    }];
    const save = createSave({
      parsedContent: mapParsed,
      gameStatus: { time: new Date('2024-09-09T08:10:00'), stamina: 96, sanity: 70, items: [] },
      history,
      currentState: {
        bgm: null, background: 'school-day', character: null, speaker: '旁白', mood: 'calm',
        effect: null, environment: 'outdoor-heavy-rain', item: null,
      },
    });
    save.tavernState = { variables: mapMessage.variables, messages: [mapMessage] };

    await loadGameFromSave(save);

    const state = useGameStore.getState();
    expect(state.game.currentScene?.observe).toBe(observe);
    expect(state.api.parsedContent.observe).toBe(observe);
    expect(state.game.gameStatus).toMatchObject({ stamina: 96, sanity: 70 });
    expect(state.game.gameStatus.time).toEqual(new Date('2024-09-09T08:10:00'));
    expect(state.game.history).toHaveLength(1);
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
