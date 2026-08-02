import { create } from 'zustand';
import type {
  AppSettings, ChatPreset, Lorebook, ChatSession,
  GameStatus, CurrentState, Scene, TurnSnapshot, Notification,
  ParsedContent, Ending, EndingPanelState, EndingCheckContext,
} from '../sillytavern/types';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { recordEndingProgress } from '../utils/metaProgress';

export interface TurnRecoveryState {
  phase: 'idle' | 'failed_stream' | 'blocked_pipeline';
  userInput: string | null;
  errorMessage: string | null;
}

export const IDLE_TURN_RECOVERY: TurnRecoveryState = { phase: 'idle', userInput: null, errorMessage: null };

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
    /** 待执行的轮回重置原因(体力/理智耗尽或一天结束)，场景播放完毕后由 CycleResetWatcher 执行 */
    pendingCycleReset: string | null;
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
    turnRecovery: TurnRecoveryState;
  };
  ui: {
    showSettings: boolean;
    showLorebook: boolean;
    showPreset: boolean;
    showHistory: boolean;
    showMap: boolean;
    showClues: boolean;
    showCharacters: boolean;
    showConclusion: boolean;
    showTitle: boolean;
    showEndingEditor: boolean;
    showPromptInspector: boolean;
    showOrchestrationLog: boolean;
    showApiGuide: boolean;
    notifications: Notification[];
    introPlayed: boolean;
    /** 开场动画中的标题是否已显示（用于触发标题音乐） */
    titleRevealed: boolean;
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
    setPendingEnding: (id: string | null) => void;
    setEndingCheckContext: (ctx: Partial<EndingCheckContext>) => void;
    setPendingCycleReset: (reason: string | null) => void;
    addHistorySnapshot: (snapshot: TurnSnapshot) => void;
    removeLastHistorySnapshot: () => void;
    setStreaming: (streaming: boolean) => void;
    setStreamBuffer: (buffer: string) => void;
    setParsedContent: (content: Partial<ParsedContent>) => void;
    setApiError: (error: string | null) => void;
    setAbortController: (controller: AbortController | null) => void;
    setTurnRecovery: (recovery: TurnRecoveryState) => void;
    clearTurnRecovery: () => void;
    toggleModal: (modal: 'settings' | 'lorebook' | 'preset' | 'history' | 'map' | 'clues' | 'characters') => void;
    setShowConclusion: (show: boolean) => void;
    setShowTitle: (show: boolean) => void;
    setShowEndingEditor: (show: boolean) => void;
    setShowPromptInspector: (show: boolean) => void;
    setShowOrchestrationLog: (show: boolean) => void;
    setShowApiGuide: (show: boolean) => void;
    addNotification: (notification: Omit<Notification, 'id'>) => void;
    removeNotification: (id: string) => void;
    setIntroPlayed: (played: boolean) => void;
    setTitleRevealed: (revealed: boolean) => void;
  };
}

const defaultGameStatus: GameStatus = {
  time: new Date(2024, 8, 9, 9, 0),
  stamina: 100,
  sanity: 80,
  items: [],
};

const defaultCurrentState: CurrentState = {
  bgm: null,
  background: null,
  character: null,
  speaker: null,
  mood: 'calm',
  effect: null,
  environment: 'none',
  item: null,
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

/** 内置默认结局(可编辑) — 三层体系: 锁凶层 A/B/C/NONE/FAKE + 解释层 CULT/PSYCH + 元层 STAY/TRUE + 兜底 LOOP */
export function createDefaultEndings(): Ending[] {
  const cg = (
    id: string,
    name: string,
    conditions: Ending['conditionGroups'][number]['conditions'],
  ): Ending['conditionGroups'][number] => ({ id, name, mode: 'all', conditions });

  return [
    {
      id: 'A-1',
      name: '报警·审判',
      truthType: 'A',
      tag: 'normal',
      description: '玩家带着祭坛证据报警。老头被逮捕，文穗的死被重新定性为他杀。法律正义无法让她回来。',
      conditionGroups: [cg('A-1-cg', '锁定A线且选择报警', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'A' },
        { variablePath: 'overlay', operator: '!=', targetValue: 'CULT' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'report' },
      ])],
      isUnlocked: false,
      order: 10,
    },
    {
      id: 'A-2',
      name: '私了·了断',
      truthType: 'A',
      tag: 'bad',
      description: '玩家选择自己处理。暴雨中的灰色了断——暴力填补不了空洞，玩家离"控制欲"比想象中更近。',
      conditionGroups: [cg('A-2-cg', '锁定A线且选择私了', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'A' },
        { variablePath: 'overlay', operator: '!=', targetValue: 'CULT' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'private' },
      ])],
      isUnlocked: false,
      order: 11,
    },
    {
      id: 'B-1',
      name: '报警·揭露',
      truthType: 'B',
      tag: 'normal',
      description: '玩家将证据提交警方。侦探A/B被逮捕，生父的雇佣关系曝光。文穗用沉默交换了玩家的安心。',
      conditionGroups: [cg('B-1-cg', '锁定B线且选择报警', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'B' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'report' },
      ])],
      isUnlocked: false,
      order: 20,
    },
    {
      id: 'B-2',
      name: '接受·妥协',
      truthType: 'B',
      tag: 'bad',
      description: '玩家接受生父的补偿，不再追究。真相被用钱买走，但良心不会。',
      conditionGroups: [cg('B-2-cg', '锁定B线且选择妥协', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'B' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'accept' },
      ])],
      isUnlocked: false,
      order: 21,
    },
    {
      id: 'C-1',
      name: '接受·清醒',
      truthType: 'C',
      tag: 'normal',
      description: '玩家承认自己杀了文穗。轮回停止——不是被打破，是不再被需要。灰暗但真实。',
      conditionGroups: [cg('C-1-cg', '锁定C线且接受真相', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'C' },
        { variablePath: 'overlay', operator: '!=', targetValue: 'PSYCH' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'accept' },
      ])],
      isUnlocked: false,
      order: 30,
    },
    {
      id: 'C-2',
      name: '否认·囚禁',
      truthType: 'C',
      tag: 'bad',
      description: '玩家拒绝接受，继续寻找不存在的凶手。永恒的自我囚禁——玩家选择了幻觉。',
      conditionGroups: [cg('C-2-cg', '锁定C线且否认真相', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'C' },
        { variablePath: 'overlay', operator: '!=', targetValue: 'PSYCH' },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'deny' },
      ])],
      isUnlocked: false,
      order: 31,
    },
    {
      id: 'N-1',
      name: '读信·放手',
      truthType: 'NONE',
      tag: 'good',
      description: '没有凶手。玩家拼合告别信，接受文穗早已写好的告别。雨停了，"再见"第一次被完整说出。',
      conditionGroups: [cg('N-1-cg', '无凶手真相且接受告别', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'NONE' },
        { variablePath: 'letterFragmentCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'letgo' },
      ])],
      isUnlocked: false,
      order: 40,
    },
    {
      id: 'N-2',
      name: '拒信·回环',
      truthType: 'NONE',
      tag: 'bad',
      description: '玩家撕掉信，回到轮回。从此每轮清晨，口袋里都会多出一片湿透的碎纸。',
      conditionGroups: [cg('N-2-cg', '无凶手真相且拒绝接受', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'NONE' },
        { variablePath: 'letterFragmentCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'refuse' },
      ])],
      isUnlocked: false,
      order: 41,
    },
    {
      id: 'F-1',
      name: '放她走',
      truthType: 'FAKE',
      tag: 'good',
      description: '文穗还活着。玩家在人群中与她对视，然后转身离开。唯一一个她活着的世界——代价是永远失去她。',
      conditionGroups: [cg('F-1-cg', '识破假死且放手', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'FAKE' },
        { variablePath: 'fakeEvidenceCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'release' },
      ])],
      isUnlocked: false,
      order: 50,
    },
    {
      id: 'F-2',
      name: '追到底',
      truthType: 'FAKE',
      tag: 'bad',
      description: '玩家抓住了她的手腕，也抓碎了她的计划。生父的人循着玩家找到了她。这一次是真的再见不到了。',
      conditionGroups: [cg('F-2-cg', '识破假死且追寻', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'FAKE' },
        { variablePath: 'fakeEvidenceCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'pursue' },
      ])],
      isUnlocked: false,
      order: 51,
    },
    {
      id: 'X-1',
      name: '毁坛·渎神',
      truthType: 'CULT',
      tag: 'normal',
      description: '献祭是真的。玩家砸毁祭坛，轮回的支点断了。世界正常了，也空了。',
      conditionGroups: [cg('X-1-cg', '邪神真相且毁坛', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'A' },
        { variablePath: 'overlay', operator: '=', targetValue: 'CULT' },
        { variablePath: 'cultClueCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'destroy' },
      ])],
      isUnlocked: false,
      order: 60,
    },
    {
      id: 'X-2',
      name: '献祭·续命',
      truthType: 'CULT',
      tag: 'bad',
      description: '玩家读懂了仪式的另一种用法，让那个清晨永远凝固。文穗永远十四岁，而只有玩家在老去。',
      conditionGroups: [cg('X-2-cg', '邪神真相且献祭', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'A' },
        { variablePath: 'overlay', operator: '=', targetValue: 'CULT' },
        { variablePath: 'cultClueCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'sacrifice' },
      ])],
      isUnlocked: false,
      order: 61,
    },
    {
      id: 'P-1',
      name: '醒来',
      truthType: 'PSYCH',
      tag: 'normal',
      description: '白墙。消毒水味盖过了草莓味。窗外在下雨——只是普通的、会停的雨。',
      conditionGroups: [cg('P-1-cg', '内室真相且醒来', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'C' },
        { variablePath: 'overlay', operator: '=', targetValue: 'PSYCH' },
        { variablePath: 'glitchClueCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'wake' },
      ])],
      isUnlocked: false,
      order: 70,
    },
    {
      id: 'P-2',
      name: '沉入',
      truthType: 'PSYCH',
      tag: 'bad',
      description: '玩家选择永远住在内室里。病床上的人嘴唇动了动，像是在说"早安"。',
      conditionGroups: [cg('P-2-cg', '内室真相且沉入', [
        { variablePath: 'lockedRoute', operator: '=', targetValue: 'C' },
        { variablePath: 'overlay', operator: '=', targetValue: 'PSYCH' },
        { variablePath: 'glitchClueCount', operator: '>=', targetValue: 3 },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'sink' },
      ])],
      isUnlocked: false,
      order: 71,
    },
    {
      id: 'STAY',
      name: '早安·永远',
      truthType: 'META',
      tag: 'hidden',
      description: '知晓一切之后，玩家选择不出门，陪文穗过完今天。然后明天再来一次。最清醒的沉沦——软结局，可以反悔。',
      conditionGroups: [cg('STAY-cg', '连续三轮选择留下', [
        { variablePath: 'stayStreak', operator: '>=', targetValue: 3 },
      ])],
      isUnlocked: false,
      order: 80,
    },
    {
      id: 'TRUE',
      name: '九点零一分',
      truthType: 'META',
      tag: 'true',
      description: '最后一个清晨，玩家说出完整的告别。雨停，闹钟走到9:01——第一次，时间前进了。',
      conditionGroups: [cg('TRUE-cg', '走完一切并选择告别', [
        { variablePath: 'routesLockedCount', operator: '>=', targetValue: 3 },
        { variablePath: 'stayedEver', operator: '=', targetValue: true },
        { variablePath: 'finalChoice', operator: '=', targetValue: 'goodbye' },
      ])],
      isUnlocked: false,
      order: 90,
    },
    {
      id: 'LOOP',
      name: '困局',
      truthType: 'LOOP',
      tag: 'bad',
      description: '第七轮之后仍无法锁定任何真相。文穗不断死去，玩家不断重来，直到不记得她的样子。',
      conditionGroups: [cg('LOOP-cg', '高轮回且一无所获', [
        { variablePath: 'cycleCount', operator: '>=', targetValue: 7 },
        { variablePath: 'routesLockedCount', operator: '=', targetValue: 0 },
      ])],
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
      affinity: { fumi: 70, touko: 40 },
      suspicion: { 'old-man': 0, 'detective-a': 0, 'detective-b': 0, self: 10, clerk: 0, teacher: 0, senpai: 0 },
      investigation: { psych: 0, crime: 0, occult: 0, science: 0 },
      unlockedClues: [],
      endingsSeen: [],
    },
    endingPanel: { visible: false, activeEndingId: null, pendingEndingId: null, isPreview: false, isAnimating: false },
    pendingCycleReset: null,
  },
  tavern: {
    settings: null,
    lorebooks: [],
    presets: [],
    chats: [],
    activeChatId: null,
    variables: createDefaultVariables(),
  },
  api: {
    isStreaming: false,
    streamBuffer: '',
    turnRecovery: IDLE_TURN_RECOVERY,
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
    showClues: false,
    showCharacters: false,
    showConclusion: false,
    showTitle: true,
    showEndingEditor: false,
    showPromptInspector: false,
    showOrchestrationLog: false,
    showApiGuide: false,
    notifications: [],
    introPlayed: false,
    titleRevealed: false,
  },

  actions: {
    setSettings: (settings) => set(state => ({ tavern: { ...state.tavern, settings } })),
    setLorebooks: (lorebooks) => set(state => ({ tavern: { ...state.tavern, lorebooks } })),
    setPresets: (presets) => set(state => ({ tavern: { ...state.tavern, presets } })),
    setChats: (chats) => set(state => ({ tavern: { ...state.tavern, chats } })),
    setActiveChatId: (id) => set(state => {
      const activeChat = state.tavern.chats.find(c => c.id === id);
      const variables = activeChat?.variables && Object.keys(activeChat.variables).length > 0
        ? activeChat.variables
        : state.tavern.variables;
      return {
        tavern: { ...state.tavern, activeChatId: id, variables },
        game: {
          ...state.game,
          endingCheckContext: variablesToEndingContext(variables, state.game.endingsSeen) as EndingCheckContext,
        },
      };
    }),
    setVariables: (vars) => set(state => ({
      tavern: { ...state.tavern, variables: vars },
      game: {
        ...state.game,
        endingCheckContext: variablesToEndingContext(vars, state.game.endingsSeen) as EndingCheckContext,
      },
    })),
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
      ...(() => {
        const meta = recordEndingProgress(id, state.tavern.variables);
        return {
          tavern: {
            ...state.tavern,
            variables: {
              ...state.tavern.variables,
              routesLockedEver: meta.routesLockedEver,
              stayedEver: meta.stayedEver,
            },
          },
          game: {
            ...state.game,
            endingsSeen: meta.endingsSeen,
            endings: state.game.endings.map(ending => ending.id === id
              ? { ...ending, isUnlocked: true, unlockedAt: ending.unlockedAt ?? Date.now() }
              : ending),
            endingCheckContext: variablesToEndingContext(
              {
                ...state.tavern.variables,
                routesLockedEver: meta.routesLockedEver,
                stayedEver: meta.stayedEver,
              },
              meta.endingsSeen,
            ) as EndingCheckContext,
          },
        };
      })(),
    })),
    setEndingPanel: (panel) => set(state => ({ game: { ...state.game, endingPanel: { ...state.game.endingPanel, ...panel } } })),
    setPendingEnding: (id) => set(state => ({ game: { ...state.game, endingPanel: { ...state.game.endingPanel, pendingEndingId: id } } })),
    setEndingCheckContext: (ctx) => set(state => ({ game: { ...state.game, endingCheckContext: { ...state.game.endingCheckContext, ...ctx } } })),
    setPendingCycleReset: (reason) => set(state => ({ game: { ...state.game, pendingCycleReset: reason } })),
    addHistorySnapshot: (snapshot) => set(state => ({ game: { ...state.game, history: [...state.game.history, snapshot] } })),
    removeLastHistorySnapshot: () => set(state => ({ game: { ...state.game, history: state.game.history.slice(0, -1) } })),
    setStreaming: (streaming) => set(state => ({ api: { ...state.api, isStreaming: streaming } })),
    setStreamBuffer: (buffer) => set(state => ({ api: { ...state.api, streamBuffer: buffer } })),
    setParsedContent: (content) => set(state => ({ api: { ...state.api, parsedContent: { ...state.api.parsedContent, ...content } } })),
    setApiError: (error) => set(state => ({ api: { ...state.api, error } })),
    setAbortController: (controller) => set(state => ({ api: { ...state.api, abortController: controller } })),
    setTurnRecovery: (recovery) => set(state => ({ api: { ...state.api, turnRecovery: recovery } })),
    clearTurnRecovery: () => set(state => ({ api: { ...state.api, turnRecovery: IDLE_TURN_RECOVERY } })),
    toggleModal: (modal) => set(state => {
      const key = `show${modal.charAt(0).toUpperCase() + modal.slice(1)}` as keyof typeof state.ui;
      return { ui: { ...state.ui, [key]: !state.ui[key] } };
    }),
    setShowConclusion: (show) => set(state => ({ ui: { ...state.ui, showConclusion: show } })),
    setShowTitle: (show) => set(state => ({ ui: { ...state.ui, showTitle: show } })),
    setShowEndingEditor: (show) => set(state => ({ ui: { ...state.ui, showEndingEditor: show } })),
    setShowPromptInspector: (show) => set(state => ({ ui: { ...state.ui, showPromptInspector: show } })),
    setShowOrchestrationLog: (show) => set(state => ({ ui: { ...state.ui, showOrchestrationLog: show } })),
    setShowApiGuide: (show) => set(state => ({ ui: { ...state.ui, showApiGuide: show } })),
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
    setTitleRevealed: (revealed) => set(state => ({ ui: { ...state.ui, titleRevealed: revealed } })),
  },
}));

// dev 调试钩子：供 Playwright/控制台直接操作 store(生产构建剔除)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__gameStore = useGameStore;
}
