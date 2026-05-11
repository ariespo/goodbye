import { create } from 'zustand';
import type {
  AppSettings, ChatPreset, Lorebook, ChatSession, ChatMessage,
  GameStatus, CurrentState, Mood, Scene, TurnSnapshot, Notification,
  ParsedContent, SaveSlot,
} from '../sillytavern/types';

interface GameStore {
  game: {
    currentScene: Scene | null;
    currentLineIndex: number;
    gameStatus: GameStatus;
    currentState: CurrentState;
    isTyping: boolean;
    isWaitingForAI: boolean;
    history: TurnSnapshot[];
  };
  tavern: {
    settings: AppSettings | null;
    lorebooks: Lorebook[];
    presets: ChatPreset[];
    chats: ChatSession[];
    activeChatId: string | null;
    variables: Record<string, any>;
  };
  api: {
    isStreaming: boolean;
    streamBuffer: string;
    parsedContent: ParsedContent;
    error: string | null;
    abortController: AbortController | null;
  };
  ui: {
    showSettings: boolean;
    showLorebook: boolean;
    showPreset: boolean;
    showHistory: boolean;
    showMap: boolean;
    notifications: Notification[];
    introPlayed: boolean;
  };

  actions: {
    setSettings: (settings: AppSettings) => void;
    setLorebooks: (lorebooks: Lorebook[]) => void;
    setPresets: (presets: ChatPreset[]) => void;
    setChats: (chats: ChatSession[]) => void;
    setActiveChatId: (id: string | null) => void;
    setVariables: (vars: Record<string, any>) => void;
    setCurrentScene: (scene: Scene | null) => void;
    setCurrentLineIndex: (index: number) => void;
    setGameStatus: (status: Partial<GameStatus>) => void;
    setCurrentState: (state: Partial<CurrentState>) => void;
    setIsTyping: (typing: boolean) => void;
    setIsWaitingForAI: (waiting: boolean) => void;
    addHistorySnapshot: (snapshot: TurnSnapshot) => void;
    setStreaming: (streaming: boolean) => void;
    setStreamBuffer: (buffer: string) => void;
    setParsedContent: (content: Partial<ParsedContent>) => void;
    setApiError: (error: string | null) => void;
    setAbortController: (controller: AbortController | null) => void;
    toggleModal: (modal: 'settings' | 'lorebook' | 'preset' | 'history' | 'map') => void;
    addNotification: (notification: Omit<Notification, 'id'>) => void;
    removeNotification: (id: string) => void;
    setIntroPlayed: (played: boolean) => void;
  };
}

const defaultGameStatus: GameStatus = {
  time: new Date(2024, 8, 9, 9, 0),
  stamina: 100,
  sanity: 100,
  items: [],
};

const defaultCurrentState: CurrentState = {
  bgm: null,
  background: null,
  character: null,
  speaker: null,
  mood: 'calm',
};

const defaultParsedContent: ParsedContent = {
  thinking: '',
  maintext: '',
  options: [],
  summary: '',
  vars: {},
};

export const useGameStore = create<GameStore>((set) => ({
  game: {
    currentScene: null,
    currentLineIndex: 0,
    gameStatus: defaultGameStatus,
    currentState: defaultCurrentState,
    isTyping: false,
    isWaitingForAI: false,
    history: [],
  },
  tavern: {
    settings: null,
    lorebooks: [],
    presets: [],
    chats: [],
    activeChatId: null,
    variables: {},
  },
  api: {
    isStreaming: false,
    streamBuffer: '',
    parsedContent: defaultParsedContent,
    error: null,
    abortController: null,
  },
  ui: {
    showSettings: false,
    showLorebook: false,
    showPreset: false,
    showHistory: false,
    showMap: false,
    notifications: [],
    introPlayed: false,
  },

  actions: {
    setSettings: (settings) => set(state => ({ tavern: { ...state.tavern, settings } })),
    setLorebooks: (lorebooks) => set(state => ({ tavern: { ...state.tavern, lorebooks } })),
    setPresets: (presets) => set(state => ({ tavern: { ...state.tavern, presets } })),
    setChats: (chats) => set(state => ({ tavern: { ...state.tavern, chats } })),
    setActiveChatId: (id) => set(state => ({ tavern: { ...state.tavern, activeChatId: id } })),
    setVariables: (vars) => set(state => ({ tavern: { ...state.tavern, variables: vars } })),
    setCurrentScene: (scene) => set(state => ({ game: { ...state.game, currentScene: scene, currentLineIndex: 0 } })),
    setCurrentLineIndex: (index) => set(state => ({ game: { ...state.game, currentLineIndex: index } })),
    setGameStatus: (status) => set(state => ({ game: { ...state.game, gameStatus: { ...state.game.gameStatus, ...status } } })),
    setCurrentState: (newState) => set(state => ({ game: { ...state.game, currentState: { ...state.game.currentState, ...newState } } })),
    setIsTyping: (typing) => set(state => ({ game: { ...state.game, isTyping: typing } })),
    setIsWaitingForAI: (waiting) => set(state => ({ game: { ...state.game, isWaitingForAI: waiting } })),
    addHistorySnapshot: (snapshot) => set(state => ({ game: { ...state.game, history: [...state.game.history, snapshot] } })),
    setStreaming: (streaming) => set(state => ({ api: { ...state.api, isStreaming: streaming } })),
    setStreamBuffer: (buffer) => set(state => ({ api: { ...state.api, streamBuffer: buffer } })),
    setParsedContent: (content) => set(state => ({ api: { ...state.api, parsedContent: { ...state.api.parsedContent, ...content } } })),
    setApiError: (error) => set(state => ({ api: { ...state.api, error } })),
    setAbortController: (controller) => set(state => ({ api: { ...state.api, abortController: controller } })),
    toggleModal: (modal) => set(state => {
      const key = `show${modal.charAt(0).toUpperCase() + modal.slice(1)}` as keyof typeof state.ui;
      return { ui: { ...state.ui, [key]: !state.ui[key] } };
    }),
    addNotification: (notification) => set(state => ({
      ui: {
        ...state.ui,
        notifications: [...state.ui.notifications, { ...notification, id: crypto.randomUUID() }],
      },
    })),
    removeNotification: (id) => set(state => ({
      ui: { ...state.ui, notifications: state.ui.notifications.filter(n => n.id !== id) },
    })),
    setIntroPlayed: (played) => set(state => ({ ui: { ...state.ui, introPlayed: played } })),
  },
}));
