import { maintextToScene } from '../engine/scene-parser';
import { OPENING_STORYLINE } from '../engine/opening-storyline';
import { deleteChat, getChats, saveChat } from '../sillytavern/database';
import type {
  ChatMessage,
  ChatSession,
  CurrentState,
  GameStatus,
  SaveSlot,
  TurnSnapshot,
} from '../sillytavern/types';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';

const OPENING_ASSISTANT_CONTENT =
  `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穂的早晨</sum>\n<vars>{ "stamina": 100, "sanity": 80 }</vars>`;

export function createDefaultGameStatus(): GameStatus {
  return {
    time: new Date(2024, 8, 9, 9, 0),
    stamina: 100,
    sanity: 80,
    items: [],
  };
}

export function createDefaultCurrentState(): CurrentState {
  return {
    bgm: null,
    background: null,
    character: null,
    speaker: null,
    mood: 'calm',
  };
}

/** IndexedDB / JSON 反序列化后 time 可能是 string */
export function reviveGameStatus(status: GameStatus | Partial<GameStatus> | null | undefined): GameStatus {
  const base = createDefaultGameStatus();
  if (!status) return base;
  const rawTime = (status as GameStatus).time as Date | string | number | undefined;
  let time = base.time;
  if (rawTime instanceof Date && !Number.isNaN(rawTime.getTime())) {
    time = rawTime;
  } else if (rawTime != null) {
    const parsed = new Date(rawTime);
    if (!Number.isNaN(parsed.getTime())) time = parsed;
  }
  return {
    time,
    stamina: typeof status.stamina === 'number' ? status.stamina : base.stamina,
    sanity: typeof status.sanity === 'number' ? status.sanity : base.sanity,
    items: Array.isArray(status.items) ? status.items : base.items,
  };
}

function abortActiveStream() {
  const { api, actions } = useGameStore.getState();
  if (api.abortController) {
    try { api.abortController.abort(); } catch { /* ignore */ }
  }
  actions.setAbortController(null);
  actions.setStreaming(false);
  actions.setStreamBuffer('');
  actions.setApiError(null);
  actions.setIsWaitingForAI(false);
  actions.setIsTyping(false);
}

/**
 * 标题页「开始游戏」：完全重置运行时状态，新建开局会话并进入游戏。
 */
export async function startNewGame(): Promise<void> {
  const state = useGameStore.getState();
  const settings = state.tavern.settings;
  const actions = state.actions;

  abortActiveStream();

  const variables = createDefaultVariables();
  const openingMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: OPENING_ASSISTANT_CONTENT,
    timestamp: Date.now(),
    variables,
  };

  const newChat: ChatSession = {
    id: crypto.randomUUID(),
    name: `${settings?.characterName || '少女'} - 新游戏 ${new Date().toLocaleString('zh-CN')}`,
    messages: [openingMsg],
    characterName: settings?.characterName || '少女',
    userName: settings?.userName || '玩家',
    presetId: settings?.activePresetId || state.tavern.presets[0]?.id || null,
    lorebookIds: settings ? [...settings.activeLorebookIds] : [],
    variables,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 清掉旧会话，避免刷新后又把上一局进度载回来
  const existingChats = await getChats();
  for (const chat of existingChats) {
    await deleteChat(chat.id);
  }
  await saveChat(newChat);

  const scene = maintextToScene(OPENING_STORYLINE);
  const first = scene.lines[0];

  // 保留设置/世界书/预设，只替换会话与局内运行时
  useGameStore.setState(s => ({
    tavern: {
      ...s.tavern,
      chats: [newChat],
      activeChatId: newChat.id,
      variables,
    },
    game: {
      ...s.game,
      currentScene: scene,
      currentLineIndex: 0,
      gameStatus: createDefaultGameStatus(),
      currentState: first
        ? {
            background: first.background || null,
            bgm: first.bgm || null,
            character: first.character ?? null,
            speaker: first.speaker || null,
            mood: first.emotion || 'calm',
          }
        : createDefaultCurrentState(),
      isTyping: false,
      isWaitingForAI: false,
      history: [],
      autoMode: false,
      sceneComplete: false,
      actionPanel: { visible: false, type: null, content: '', selectedIndex: null },
      endingsSeen: [],
      endingCheckContext: variablesToEndingContext(variables, []) as typeof s.game.endingCheckContext,
      endingPanel: {
        visible: false,
        activeEndingId: null,
        pendingEndingId: null,
        isPreview: false,
        isAnimating: false,
      },
    },
    api: {
      ...s.api,
      isStreaming: false,
      streamBuffer: '',
      error: null,
      abortController: null,
    },
    ui: {
      ...s.ui,
      showMap: false,
      showClues: false,
      showHistory: false,
      showEndingEditor: false,
      showPromptInspector: false,
      showTitle: false,
    },
  }));

  actions.addNotification({ type: 'info', message: '新的轮回开始了', duration: 2200 });
}

/**
 * 从存档完整恢复游戏状态并进入游戏。
 */
export async function loadGameFromSave(save: SaveSlot): Promise<void> {
  const state = useGameStore.getState();
  const settings = state.tavern.settings;
  const actions = state.actions;

  abortActiveStream();

  const variables = save.tavernState?.variables && Object.keys(save.tavernState.variables).length > 0
    ? { ...createDefaultVariables(), ...save.tavernState.variables }
    : createDefaultVariables();

  const messages = Array.isArray(save.tavernState?.messages) ? save.tavernState.messages : [];
  const history: TurnSnapshot[] = Array.isArray(save.gameState?.history)
    ? save.gameState.history
    : [];
  const endingsSeen = Array.isArray(save.gameState?.endingsSeen)
    ? save.gameState.endingsSeen
    : Array.isArray(variables.endingsSeen)
      ? variables.endingsSeen
      : [];

  const gameStatus = reviveGameStatus(save.gameState?.gameStatus);
  const currentState: CurrentState = {
    ...createDefaultCurrentState(),
    ...(save.gameState?.currentState || {}),
  };

  // 写入/覆盖当前会话
  let targetChat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId)
    || state.tavern.chats[0]
    || null;

  if (targetChat) {
    targetChat = {
      ...targetChat,
      messages,
      variables,
      updatedAt: Date.now(),
    };
    await saveChat(targetChat);
    actions.setChats(state.tavern.chats.map(c => c.id === targetChat!.id ? targetChat! : c));
    actions.setActiveChatId(targetChat.id);
  } else {
    targetChat = {
      id: crypto.randomUUID(),
      name: `${settings?.characterName || '少女'} - 读档`,
      messages,
      characterName: settings?.characterName || '少女',
      userName: settings?.userName || '玩家',
      presetId: settings?.activePresetId || state.tavern.presets[0]?.id || null,
      lorebookIds: settings ? [...settings.activeLorebookIds] : [],
      variables,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveChat(targetChat);
    actions.setChats([targetChat]);
    actions.setActiveChatId(targetChat.id);
  }

  // 从最后一条 assistant maintext 重建场景
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const maintext = lastAssistant?.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim()
    || OPENING_STORYLINE;
  const scene = maintextToScene(maintext);
  const lineIndex = Math.max(
    0,
    Math.min(save.gameState?.currentLineIndex ?? 0, Math.max(0, scene.lines.length - 1)),
  );
  const line = scene.lines[lineIndex] || scene.lines[0];

  useGameStore.setState(s => ({
    tavern: {
      ...s.tavern,
      variables,
    },
    game: {
      ...s.game,
      currentScene: scene,
      currentLineIndex: lineIndex,
      gameStatus,
      currentState: {
        ...currentState,
        // 行级状态优先（与对话推进一致）
        background: line?.background || currentState.background,
        bgm: line?.bgm || currentState.bgm,
        character: line?.character ?? currentState.character,
        mood: line?.emotion || currentState.mood || 'calm',
        speaker: line?.speaker || currentState.speaker,
      },
      isTyping: false,
      isWaitingForAI: false,
      history,
      autoMode: Boolean(save.gameState?.autoMode),
      sceneComplete: Boolean(save.gameState?.sceneComplete),
      actionPanel: { visible: false, type: null, content: '', selectedIndex: null },
      endingsSeen,
      endingCheckContext: variablesToEndingContext(variables, endingsSeen) as typeof s.game.endingCheckContext,
      endingPanel: {
        visible: false,
        activeEndingId: null,
        pendingEndingId: null,
        isPreview: false,
        isAnimating: false,
      },
    },
    api: {
      ...s.api,
      isStreaming: false,
      streamBuffer: '',
      error: null,
      abortController: null,
    },
    ui: {
      ...s.ui,
      showMap: false,
      showClues: false,
      showHistory: false,
      showEndingEditor: false,
      showPromptInspector: false,
      showTitle: false,
    },
  }));

  actions.addNotification({ type: 'success', message: '存档已读取', duration: 2500 });
}

/** 构造完整存档载荷（供 SaveModal 使用） */
export function buildSaveSlotPayload(name: string, thumbnail: string): SaveSlot {
  const { game, tavern } = useGameStore.getState();
  const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);

  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    thumbnail,
    gameState: {
      currentSceneIndex: 0,
      currentLineIndex: game.currentLineIndex,
      gameStatus: {
        ...game.gameStatus,
        time: game.gameStatus.time instanceof Date
          ? game.gameStatus.time
          : new Date(game.gameStatus.time),
      },
      currentState: { ...game.currentState },
      history: game.history.map(h => ({
        ...h,
        gameStatus: {
          ...h.gameStatus,
          time: h.gameStatus.time instanceof Date
            ? h.gameStatus.time
            : new Date(h.gameStatus.time),
        },
      })),
      endingsSeen: [...game.endingsSeen],
      autoMode: game.autoMode,
      sceneComplete: game.sceneComplete,
    },
    tavernState: {
      variables: { ...tavern.variables },
      messages: activeChat?.messages ? [...activeChat.messages] : [],
    },
    historyIndex: game.history.length,
  };
}
