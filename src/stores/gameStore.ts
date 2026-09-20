import { create } from 'zustand';
import type {
  AppSettings, ChatPreset, Lorebook, ChatSession,
  GameStatus, CurrentState, Scene, TurnSnapshot, Notification,
  ParsedContent, Ending, EndingPanelState, EndingCheckContext,
  DynamicRecord,
} from '../sillytavern/types';
import { createDefaultVariables, variablesToEndingContext } from '../sillytavern/vars-merger';
import { INITIAL_PLAYER_RESOURCES } from '../data/gameDefaults';
import { recordEndingProgress } from '../utils/metaProgress';

export interface TurnRecoveryState {
  phase: 'idle' | 'failed_stream' | 'blocked_pipeline';
  userInput: string | null;
  errorMessage: string | null;
  /** 已保留失败正文与审查意见，可从原稿继续修复。 */
  repairable?: boolean;
}

export const IDLE_TURN_RECOVERY: TurnRecoveryState = { phase: 'idle', userInput: null, errorMessage: null };

interface GameStore {
  game: {
    currentScene: Scene | null;
    currentLineIndex: number;
    /** Monotonic, actually displayed prefix; independent of the local review cursor. */
    dialogueProgress: { sceneId: string; lineIndex: number; text: string } | null;
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
    variables: DynamicRecord;
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
    setVariables: (vars: DynamicRecord) => void;
    setCurrentScene: (scene: Scene | null) => void;
    setCurrentLineIndex: (index: number) => void;
    markDialogueSeen: (lineIndex: number, text: string) => void;
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
  ...INITIAL_PLAYER_RESOURCES,
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
      description: '在这条路线中，玩家提交周德明施暴、推落文穗及转移伪装现场的证据。调查与审理继续，正义无法让她回来。',
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
      description: '玩家把赵刚强行带人造成致命撞击、林静随后参与掩盖的证据交给警方。两人的行为与责任分别进入记录。',
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
      description: '玩家承认前夜在家中杀害文穗，配合记录并承担责任。旧日的问候留在记忆里，不能替她给予原谅。',
      backgroundImage: 'black',
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
      description: '玩家拒绝已核实的责任，反复躲入旧日问候。回忆结束，封存的证据仍在，文穗没有回来。',
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
      description: '独行失足、栏杆失效与伤情已经核实。玩家接受事故，也读完文穗生前写下的离开意愿，不再把两者混为一谈。',
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
      description: '玩家撕信却无法改写已核实的事故。旧日问候只在回忆中响起；跟随重置留下的是记忆，碎纸不会跨日累积。',
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
      description: '本人生还与初报误认已经分别核实。玩家停止追问去向，收到她安全到达的讯息，把是否再见留给以后的生活。',
      backgroundImage: 'black',
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
      description: '玩家追到离城后的中转站，也把跟踪者带到文穗身边。她被带走后失联；失联不能当成死讯。',
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
      description: '在仪式确实生效的这条路线中，玩家摧毁支点、终止循环。周德明的罪行与文穗的死亡没有被改写。',
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
      name: '封存·余生',
      truthType: 'CULT',
      tag: 'bad',
      description: '玩家耗用自己的余生维持仪式中的清晨画面。画面里的文穗不能走入现实；她的死亡与周德明的罪行仍然成立。',
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
      description: '玩家回到治疗环境，继续核对材料与配合调查。重构的雨城得到解释，前夜施暴致死的责任没有撤销。',
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
      description: '玩家沉入记忆重构的清晨。叙述回到病房时，治疗、调查与责任都仍在；现实里没有复活的文穗。',
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
      description: '连续三次留下，玩家反复回忆与文穗相处的旧日。她没有回到眼前，已知与未知都未被改变。仍可回到八点，重新出门。',
      backgroundImage: 'home',
      conditionGroups: [cg('STAY-cg', '连续三轮选择留下', [
        { variablePath: 'stayStreak', operator: '>=', targetValue: 3 },
      ])],
      isUnlocked: false,
      order: 80,
    },
    {
      id: 'TRUE',
      name: '八点零一分',
      truthType: 'META',
      tag: 'true',
      description: '在故事之外，玩家分别合上互不相容的篇章，向记忆中的文穗告别。想象里的钟走到8:01；各篇事实与责任依然保留。',
      backgroundImage: 'home',
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
      description: '第七个重复日起，仍未形成足以锁线的证据链。记忆开始模糊，材料与缺口却仍在；未解的身份和死因不能被擅自填上。',
      backgroundImage: 'black',
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
    dialogueProgress: null,
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
      const defaultTime = new Date(String(createDefaultVariables().time));
      const restoredTime = new Date(
        typeof variables.time === 'string' || typeof variables.time === 'number' || variables.time instanceof Date
          ? variables.time : defaultTime,
      );
      return {
        tavern: { ...state.tavern, activeChatId: id, variables },
        game: {
          ...state.game,
          // 播放状态与待结算属于原会话；必须随 ID 原子清理，避免 Watcher 结算新会话。
          ...(state.tavern.activeChatId !== id ? {
            currentScene: null,
            currentLineIndex: 0,
            dialogueProgress: null,
            currentState: defaultCurrentState,
            gameStatus: {
              ...state.game.gameStatus,
              time: Number.isNaN(restoredTime.getTime()) ? defaultTime : restoredTime,
              stamina: typeof variables.stamina === 'number' && Number.isFinite(variables.stamina)
                ? variables.stamina : INITIAL_PLAYER_RESOURCES.stamina,
              sanity: typeof variables.sanity === 'number' && Number.isFinite(variables.sanity)
                ? variables.sanity : INITIAL_PLAYER_RESOURCES.sanity,
            },
            sceneComplete: false,
            pendingCycleReset: null,
            isTyping: false,
            actionPanel: { visible: false, type: null, content: '', selectedIndex: null },
            endingPanel: { visible: false, activeEndingId: null, pendingEndingId: null, isPreview: false, isAnimating: false },
          } : {}),
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
    setCurrentScene: (scene) => set(state => ({ game: { ...state.game, currentScene: scene, currentLineIndex: 0, sceneComplete: false, dialogueProgress: null } })),
    setCurrentLineIndex: (index) => set(state => ({ game: { ...state.game, currentLineIndex: index } })),
    markDialogueSeen: (lineIndex, text) => set(state => {
      const sceneId = state.game.currentScene?.id;
      if (!sceneId || !text) return state;
      const previous = state.game.dialogueProgress;
      if (previous?.sceneId === sceneId && (previous.lineIndex > lineIndex
        || (previous.lineIndex === lineIndex && previous.text.length >= text.length))) return state;
      return { game: { ...state.game, dialogueProgress: { sceneId, lineIndex, text } } };
    }),
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
