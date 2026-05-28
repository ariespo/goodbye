import { create } from 'zustand';
import type {
  AppSettings, ChatPreset, Lorebook, ChatSession,
  GameStatus, CurrentState, Scene, TurnSnapshot, Notification,
  ParsedContent, Ending, EndingPanelState, EndingCheckContext,
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
    /** 自动播放模式 */
    autoMode: boolean;
    /** 当前场景是否已播放完毕 */
    sceneComplete: boolean;
    /** 当前显示的动作结果面板 */
    actionPanel: {
      visible: boolean;
      type: 'observe' | 'investigate' | 'act' | null;
      content: string;
      selectedIndex: number | null;
    };
    /** 结局定义列表 */
    endings: Ending[];
    /** 已解锁的结局ID */
    endingsSeen: string[];
    /** 结局检测上下文(核心变量) */
    endingCheckContext: EndingCheckContext;
    /** 结局面板状态 */
    endingPanel: EndingPanelState;
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
    showTitle: boolean;
    showEndingEditor: boolean;
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
    setAutoMode: (auto: boolean) => void;
    setSceneComplete: (complete: boolean) => void;
    setActionPanel: (panel: Partial<GameStore['game']['actionPanel']>) => void;
    setEndings: (endings: Ending[]) => void;
    addEnding: (ending: Ending) => void;
    removeEnding: (id: string) => void;
    updateEnding: (id: string, patch: Partial<Ending>) => void;
    markEndingSeen: (id: string) => void;
    setEndingPanel: (panel: Partial<EndingPanelState>) => void;
    setEndingCheckContext: (ctx: Partial<EndingCheckContext>) => void;
    addHistorySnapshot: (snapshot: TurnSnapshot) => void;
    setStreaming: (streaming: boolean) => void;
    setStreamBuffer: (buffer: string) => void;
    setParsedContent: (content: Partial<ParsedContent>) => void;
    setApiError: (error: string | null) => void;
    setAbortController: (controller: AbortController | null) => void;
    toggleModal: (modal: 'settings' | 'lorebook' | 'preset' | 'history' | 'map') => void;
    setShowTitle: (show: boolean) => void;
    setShowEndingEditor: (show: boolean) => void;
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
  observe: '',
  investigateItems: [],
  actionItems: [],
};

/** 内置默认结局(可编辑) */
function createDefaultEndings(): Ending[] {
  return [
    {
      id: 'A-1',
      name: '接受',
      truthType: 'A',
      tag: 'normal',
      description: '主角在 therapy 中接受真相，承认自己的罪行。灰暗但"清醒"的结局。',
      conditionGroups: [
        {
          id: 'A-1-cg',
          name: '自疑+心理',
          mode: 'any',
          conditions: [
            { variablePath: 'suspicion.self', operator: '>=', targetValue: 60 },
            { variablePath: 'investigation.psych', operator: '>=', targetValue: 70 },
          ],
        },
      ],
      isUnlocked: false,
      order: 10,
    },
    {
      id: 'A-2',
      name: '否认',
      truthType: 'A',
      tag: 'bad',
      description: '主角拒绝接受，继续轮回。永恒的自我囚禁。',
      conditionGroups: [
        {
          id: 'A-2-cg',
          name: '轮回+自疑',
          mode: 'all',
          conditions: [
            { variablePath: 'cycleCount', operator: '<=', targetValue: 3 },
            { variablePath: 'suspicion.self', operator: '>=', targetValue: 60 },
          ],
        },
      ],
      isUnlocked: false,
      order: 11,
    },
    {
      id: 'B-1',
      name: '告别',
      truthType: 'B',
      tag: 'good',
      description: '主角选择"放手"，文穂在梦中微笑消失。醒来后回到现实世界。',
      conditionGroups: [
        {
          id: 'B-1-cg',
          name: '好感+梦觉',
          mode: 'all',
          conditions: [
            { variablePath: 'affinity.fumi', operator: '>=', targetValue: 85 },
            { variablePath: 'investigation.psych', operator: '>=', targetValue: 70 },
          ],
        },
      ],
      isUnlocked: false,
      order: 20,
    },
    {
      id: 'B-2',
      name: '沉溺',
      truthType: 'B',
      tag: 'bad',
      description: '主角选择"永远在一起"。永远困在梦境中（温柔的囚笼）。',
      conditionGroups: [
        {
          id: 'B-2-cg',
          name: '好感',
          mode: 'all',
          conditions: [
            { variablePath: 'affinity.fumi', operator: '>=', targetValue: 85 },
            { variablePath: 'affinity.touko', operator: '<=', targetValue: 20 },
          ],
        },
      ],
      isUnlocked: false,
      order: 21,
    },
    {
      id: 'C-1',
      name: '封印',
      truthType: 'C',
      tag: 'normal',
      description: '主角在时坂朔的帮助下，用文穂的"牺牲"重新封印邪神。文穂死，城市得救。',
      conditionGroups: [
        {
          id: 'C-1-cg',
          name: '超自然',
          mode: 'all',
          conditions: [
            { variablePath: 'investigation.occult', operator: '>=', targetValue: 70 },
            { variablePath: 'cycleCount', operator: '>=', targetValue: 8 },
          ],
        },
      ],
      isUnlocked: false,
      order: 30,
    },
    {
      id: 'D-1',
      name: '放手',
      truthType: 'D',
      tag: 'normal',
      description: '主角停止轮回，接受文穂的死亡。文穂的灵魂融入锚点，成为永恒的守护者。',
      conditionGroups: [
        {
          id: 'D-1-cg',
          name: '科学+调查',
          mode: 'all',
          conditions: [
            { variablePath: 'investigation.science', operator: '>=', targetValue: 70 },
            { variablePath: 'cycleCount', operator: '>=', targetValue: 5 },
          ],
        },
      ],
      isUnlocked: false,
      order: 40,
    },
    {
      id: 'D-3',
      name: '共生',
      truthType: 'D',
      tag: 'true',
      description: '主角发现"情感"本身可以维持锚点——不需要牺牲生命，只需要"真诚的告别"。两人在不同的存在形式中继续相伴。',
      conditionGroups: [
        {
          id: 'D-3-cg',
          name: '均衡+科学',
          mode: 'all',
          conditions: [
            { variablePath: 'investigation.science', operator: '>=', targetValue: 70 },
            { variablePath: 'affinity.fumi', operator: '>=', targetValue: 60 },
            { variablePath: 'cycleCount', operator: '>=', targetValue: 5 },
          ],
        },
      ],
      isUnlocked: false,
      order: 42,
    },
    {
      id: 'E',
      name: '观测者',
      truthType: 'E',
      tag: 'hidden',
      description: '四种真相都是"部分正确"。真正的答案是：四种真相并不互斥，它们是同一个现象的四个观测面。主角选择不选择——接受不确定性。',
      conditionGroups: [
        {
          id: 'E-cg',
          name: '最难结局',
          mode: 'all',
          conditions: [
            { variablePath: 'cycleCount', operator: '=', targetValue: 13 },
          ],
        },
      ],
      isUnlocked: false,
      order: 99,
    },
  ];
}

export const useGameStore = create<GameStore>((set) => ({
  game: {
    currentScene: null,
    currentLineIndex: 0,
    gameStatus: defaultGameStatus,
    currentState: defaultCurrentState,
    isTyping: false,
    isWaitingForAI: false,
    history: [],
    autoMode: false,
    sceneComplete: false,
    actionPanel: { visible: false, type: null, content: '', selectedIndex: null },
    endings: createDefaultEndings(),
    endingsSeen: [],
    endingCheckContext: {
      cycleCount: 1,
      affinity: { fumi: 70, touko: 40, saku: 0 },
      suspicion: { self: 10, fumi: 0, touko: 5, occult: 0 },
      investigation: { psych: 0, crime: 0, occult: 0, science: 0 },
      unlockedClues: [],
      endingsSeen: [],
    },
    endingPanel: { visible: false, activeEndingId: null, isAnimating: false },
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
    showTitle: true,
    showEndingEditor: false,
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
    setCurrentScene: (scene) => set(state => ({ game: { ...state.game, currentScene: scene, currentLineIndex: 0, sceneComplete: false } })),
    setCurrentLineIndex: (index) => set(state => ({ game: { ...state.game, currentLineIndex: index } })),
    setGameStatus: (status) => set(state => ({ game: { ...state.game, gameStatus: { ...state.game.gameStatus, ...status } } })),
    setCurrentState: (newState) => set(state => ({ game: { ...state.game, currentState: { ...state.game.currentState, ...newState } } })),
    setIsTyping: (typing) => set(state => ({ game: { ...state.game, isTyping: typing } })),
    setIsWaitingForAI: (waiting) => set(state => ({ game: { ...state.game, isWaitingForAI: waiting } })),
    setAutoMode: (auto) => set(state => ({ game: { ...state.game, autoMode: auto } })),
    setSceneComplete: (complete) => set(state => ({ game: { ...state.game, sceneComplete: complete } })),
    setActionPanel: (panel) => set(state => ({ game: { ...state.game, actionPanel: { ...state.game.actionPanel, ...panel } } })),
    setEndings: (endings) => set(state => ({ game: { ...state.game, endings } })),
    addEnding: (ending) => set(state => ({ game: { ...state.game, endings: [...state.game.endings, ending] } })),
    removeEnding: (id) => set(state => ({ game: { ...state.game, endings: state.game.endings.filter(e => e.id !== id) } })),
    updateEnding: (id, patch) => set(state => ({
      game: {
        ...state.game,
        endings: state.game.endings.map(e => e.id === id ? { ...e, ...patch } : e),
      },
    })),
    markEndingSeen: (id) => set(state => ({
      game: {
        ...state.game,
        endingsSeen: state.game.endingsSeen.includes(id) ? state.game.endingsSeen : [...state.game.endingsSeen, id],
      },
    })),
    setEndingPanel: (panel) => set(state => ({ game: { ...state.game, endingPanel: { ...state.game.endingPanel, ...panel } } })),
    setEndingCheckContext: (ctx) => set(state => ({ game: { ...state.game, endingCheckContext: { ...state.game.endingCheckContext, ...ctx } } })),
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
    setShowTitle: (show) => set(state => ({ ui: { ...state.ui, showTitle: show } })),
    setShowEndingEditor: (show) => set(state => ({ ui: { ...state.ui, showEndingEditor: show } })),
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
