/**
 * SillyTavern Web - Core Types (v3 内核 + farewell-web 游戏专属)
 */

// ========== World Book (Lorebook) Types ==========

/**
 * JSON-like data received from models, imports, and persisted variable stores.
 * Frequently used legacy fields stay typed while unknown extension keys remain
 * available for imported presets and forward-compatible saves.
 */
export interface DynamicRecord extends Record<string, unknown> {
  affinity?: Record<string, number>;
  suspicion?: Record<string, number>;
  investigation?: Record<string, number>;
  cycleCount?: number;
  stayStreak?: number;
  stayedEver?: boolean;
  tripProgress?: number;
  routesLockedEver?: string[];
  organizedClues?: OrganizedClue[];
  knowledgeEvents?: string[];
  loopSuspicionStart?: Record<string, number>;
  worldMemory?: import('../memory/world-memory').WorldMemoryState | {
    cognition?: unknown[];
    softCanonFacts?: unknown[];
    [key: string]: unknown;
  };
  prompt_order?: PromptOrderItem[];
  prompts?: PromptDefinition[];
  temp_openai?: number;
  freq_pen_openai?: number;
  pres_pen_openai?: number;
  top_p_openai?: number;
  top_k_openai?: number;
  openai_max_context?: number;
  openai_max_tokens?: number;
  main?: string;
  nsfw?: string;
  jailbreak?: string;
  character_description?: string;
  character_personality?: string;
  scenario?: string;
  persona_description?: string;
  dialogue_examples?: string;
  openai_model?: string;
}

export interface LorebookEntry {
  id: string;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  comment?: string;
  enabled: boolean;
  order: number;
  /** 8 个 SillyTavern 位置 */
  position: 'before_char' | 'after_char' | 'before_example' | 'after_example' | 'at_depth' | 'example_msg_top' | 'example_msg_bottom' | 'outlet';
  depth?: number;
  role?: number;
  selective: boolean;
  selectiveLogic: 'and_any' | 'not_all' | 'not_any' | 'and_all';
  constant: boolean;
  probability: number;
  useProbability?: boolean;
  addMemo: boolean;
  sticky?: number;
  cooldown?: number;
  delay?: number;
  weight?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
  useGroupScoring?: boolean;
  matchPersonaDescription?: boolean;
  matchCharacterDescription?: boolean;
  matchCharacterPersonality?: boolean;
  matchCharacterDepthPrompt?: boolean;
  matchScenario?: boolean;
  matchCreatorNotes?: boolean;
  group?: string;
  decorators?: string[];
  characterFilter?: {
    isExclude?: boolean;
    names?: string[];
    tags?: number[];
  };
}

export interface Lorebook {
  id: string;
  name: string;
  description?: string;
  entries: LorebookEntry[];
  recursiveScanning: boolean;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SillyTavernLorebookExport {
  name: string;
  description?: string;
  entries: Record<string, {
    uid: number;
    key: string[];
    keysecondary: string[];
    comment: string;
    content: string;
    constant: boolean;
    selective: boolean;
    selectiveLogic: 0 | 1 | 2 | 3;
    addMemo: boolean;
    order: number;
    position: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    role: number;
    disable: boolean;
    probability: number;
    depth: number;
    group: string;
    useProbability: boolean;
    excluded: boolean;
    sticky: number;
    cooldown: number;
    delay: number;
    weight: number;
    scanDepth: number;
    caseSensitive: boolean;
    matchWholeWords: boolean;
    excludeRecursion: boolean;
    preventRecursion: boolean;
    useGroupScoring: boolean;
    matchPersonaDescription: boolean;
    matchCharacterDescription: boolean;
    matchCharacterPersonality: boolean;
    matchCharacterDepthPrompt: boolean;
    matchScenario: boolean;
    matchCreatorNotes: boolean;
    decorators: string[];
    characterFilter: {
      isExclude?: boolean;
      names?: string[];
      tags?: number[];
    };
  }>;
  settings?: {
    recursive_scanning?: boolean;
    case_sensitive?: boolean;
    match_whole_words?: boolean;
  };
}

export interface MatchedEntry {
  entry: LorebookEntry;
  score: number;
  matchedKeywords: string[];
}

// ========== Preset Types ==========

/** SillyTavern 兼容的预设。settings 直接存放酒馆预设 JSON 字段(temp_openai, prompt_order, prompts...) */
export interface ChatPreset {
  id: string;
  name: string;
  description?: string;
  settings: DynamicRecord;
  createdAt: number;
  updatedAt: number;
}

export interface PromptOrderItem {
  identifier: string;
  name?: string;
  role?: 'system' | 'user' | 'assistant';
  enabled?: boolean;
  /** 实际文本内容(由 importer 在导入时从 prompts 仓库 join 进来) */
  content?: string;
  /** 是否是占位符槽位(由运行时动态注入,如 worldInfoBefore/chatHistory) */
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
}

export interface PromptDefinition {
  identifier: string;
  name?: string;
  role?: 'system' | 'user' | 'assistant';
  content?: string;
  marker?: boolean;
}

// ========== Settings Types ==========

export interface ApiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;
  secondary?: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface AppSettings {
  id?: number;
  api: ApiSettings;
  characterName: string;
  userName: string;
  playerGender?: 'male' | 'female';
  playerIdentityConfirmed?: boolean;
  activePresetId: string | null;
  activeLorebookIds: string[];
  uiMode: 'game' | 'chat';
  customTags: string[];
  typingSpeed: number;
  fontSize: 'small' | 'medium' | 'large';
  moodIntensity: number;
  /** v3: 流标签里的"opaque"标签(内部不解析为标签),默认 thinking/think */
  opaqueTags?: string[];
  /** v3: 格式提示词,系统提示末尾会附加 */
  formatPromptTemplate?: string;
  /** GalGame 自动模式:一行打字完成后自动推进下一行 */
  autoMode?: boolean;
  /** 自动模式间隔(ms,从打字完到推进的等待时间) */
  autoIntervalMs?: number;
  /** 游戏字体 */
  fontFamily?: string;
  /** 音乐音量 0-1 */
  musicVolume?: number;
  /** 音效音量 0-1 */
  soundVolume?: number;
  /** 叙事 Agent 编排：旧流程 / 受控流水线 / 带语义复核的严格流水线 */
  agentNarrativeMode?: 'legacy' | 'standard' | 'strict';
}

export const DEFAULT_FORMAT_PROMPT = `你必须严格按照以下 XML 标签格式输出回复。除标签内容外,不要输出任何 Markdown、解释或额外文字。

## 1. 剧情正文(必填)
<maintext>
  内部使用 GalGame 行指令格式,每行一个指令,用 | 分隔字段:
    场景|<场景文件名>              切换背景(资源路径: /assets/backgrounds/)
    音乐|<音乐文件名>              切换 BGM(资源路径: /assets/audio/bgm/)
    对话|<人物名>|<情绪>|<对话内容>   显示对话(人物 = "旁白" 时不显示角色名和立绘)
    对话|<人物名>|<情绪>|<对话内容>|<物品id或文件名>   显示对话时居中展示一次关键物品,下一行自动隐藏

  情绪只允许: calm / horror / insane / sad / angry / happy
  场景存在昼夜版本时使用 -day / -night 后缀,并严格匹配剧情当前时间;无后缀场景仅作日间兼容。
  同一场景/音乐下可有多段对话,只在变化时声明场景或音乐。

  示例:
  场景|school_corridor.jpg
  音乐|silence.mp3
  对话|少女|horror|你来了。
  对话|旁白|calm|她背对着你,声音平淡得像背书。
  对话|旁白|calm|你看见桌上那只马克杯。|opening-mug
</maintext>

## 2. 玩家选项(必填)
<option>
选项 A
选项 B
选项 C
</option>
要求:至少 2 项,每行一个,不要带序号或额外标记。

## 3. 回合总结(必填)
<sum>本回合一句话总结</sum>

## 4. 状态变量(选填,但如有变化必须合法)
<vars>{ "location": "school", "stamina": 80, "sanity": 75 }</vars>
要求:必须是合法 JSON 对象,只包含发生变化的字段,不要注释。location 表示玩家所在地图地点,必须使用系统资源清单中的地点 id。
- vars 中额外输出 "timeCost": 本回合经过的分钟数(整数,1-180)。例如闲聊约10,搜查房间约30。系统据此推进游戏时钟,不会存档该字段。

## 5. 观察/调查/行动(选填,仅在需要时提供)
<observe>
[发现] 五感或环境信息。
[异常] 令你不安的细节。
[线索] 值得记录的线索。
</observe>

<investigate>
描述|嫌疑人|风格|耗时|消耗体力|消耗理智
旧日记|文穂|现实|15分钟|2|1
</investigate>

<action>
描述|风格|耗时|消耗体力|消耗理智
悄悄离开|现实|5分钟|1|0
</action>

## 6. 暗示(选填)
<hint>如果当前剧情接近某个结局,可以给出一句不剧透的暗示。</hint>

## 禁止事项
- 不要输出 <maintext> 外的 Markdown 代码块。
- 不要省略必填标签 <maintext>、<option>、<sum>。
- 不要在 <vars> 中写入非 JSON 内容。
- 不要在一个回复中嵌套同名标签。`;

export const DEFAULT_TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'] as const;
export const DEFAULT_OPAQUE_TAGS = ['thinking', 'think'] as const;

/** 完整酒馆 prompt_order 模板 */
export const DEFAULT_PROMPT_ORDER: PromptOrderItem[] = [
  { identifier: 'main', name: 'Main Prompt', role: 'system', enabled: true },
  { identifier: 'worldInfoBefore', name: 'World Info (Before)', role: 'system', enabled: true },
  { identifier: 'charDescription', name: 'Character Description', role: 'system', enabled: true },
  { identifier: 'charPersonality', name: 'Character Personality', role: 'system', enabled: true },
  { identifier: 'scenario', name: 'Scenario', role: 'system', enabled: true },
  { identifier: 'personaDescription', name: 'Persona Description', role: 'system', enabled: true },
  { identifier: 'dialogueExamples', name: 'Dialogue Examples', role: 'system', enabled: true },
  { identifier: 'chatHistory', name: 'Chat History', role: 'system', enabled: true },
  { identifier: 'worldInfoAfter', name: 'World Info (After)', role: 'system', enabled: true },
  { identifier: 'groupNudge', name: 'Group Nudge', role: 'system', enabled: false },
];

export function createDefaultPreset(): Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '默认预设',
    description: '酒馆兼容默认 OpenAI 预设',
    settings: {
      temp_openai: 0.8,
      freq_pen_openai: 0,
      pres_pen_openai: 0,
      top_p_openai: 0.9,
      top_k_openai: 0,
      openai_max_context: 8192,
      openai_max_tokens: 2048,
      stream_openai: true,
      openai_model: 'gpt-4o-mini',
      main: 'Write {{char}}\'s next reply in a fictional chat between {{char}} and {{user}}.',
      nsfw: '',
      jailbreak: '',
      character_description: '',
      character_personality: '',
      scenario: '',
      persona_description: '',
      dialogue_examples: '',
      group_nudge_prompt: '',
      impersonation_prompt: '',
      quiet_prompt: '',
      prompts: [],
      prompt_order: DEFAULT_PROMPT_ORDER.map(p => ({ ...p })),
    },
  };
}

// ========== Chat Types ==========

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  variables: DynamicRecord;
  /** 该玩家回合开始前的可回滚运行时快照。旧消息可不存在。 */
  turnState?: {
    gameStatus: GameStatus;
    currentState: CurrentState;
    currentScene: Scene | null;
    currentLineIndex: number;
    sceneComplete: boolean;
    variables: DynamicRecord;
  };
  parsed?: ParsedContent;
  apiUsed?: ApiTarget;
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  characterName: string;
  userName: string;
  presetId: string | null;
  lorebookIds: string[];
  variables: DynamicRecord;
  createdAt: number;
  updatedAt: number;
}

// ========== Stream Parsing (farewell-web 风格,保留旧字段名) ==========

export interface ParsedContent {
  thinking: string;
  maintext: string;
  options: string[];
  summary: string;
  vars: DynamicRecord;

  // 观察/调查/行动（主剧情回复中附带）
  observe?: string;
  investigateItems?: Array<{
    desc: string;
    suspect: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;
  actionItems?: Array<{
    desc: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;

  // 二次请求返回的具体结果（<action type="investigate"> / <action type="act">）
  actionType?: 'investigate' | 'act';
  actionResult?: string;
}

export interface OrganizedClue {
  id: string;
  title: string;
  description: string;
  source: string;
  createdAt: number;
}

export type Task = 'story' | 'summary' | 'vars';
export type ApiTarget = 'primary' | 'secondary';

// ========== Game State (farewell-web 专属) ==========

export interface TurnSnapshot {
  turnIndex: number;
  timestamp: number;
  summary: string;
  gameStatus: GameStatus;
  variables: DynamicRecord;
}

export interface GameStatus {
  time: Date;
  stamina: number;
  sanity: number;
  items: string[];
}

export interface CurrentState {
  bgm: string | null;
  background: string | null;
  character: string | null;
  speaker: string | null;
  mood: Mood;
  effect: string | null;
  environment: import('../data/backgroundAssets').SceneEnvironment;
  item: string | null;
}

export type Mood = 'calm' | 'horror' | 'insane' | 'sad' | 'angry' | 'happy';

export interface Scene {
  id: string;
  lines: SceneLine[];
  /** Generated turns commit all knowledge before playback; opening/legacy scenes may still commit on line completion. */
  knowledgeAlreadyCommitted?: boolean;
  /** 首帧背景(由 lines[0] 决定),为兼容旧字段保留 */
  background?: string;
  character?: string;
  bgm?: string;
  mood?: Mood;
  /** 生成该场景时已经成立的情绪权限；防止回合结算倒灌到较早台词。 */
  emotionPolicyContext?: {
    huihuiChocolateKnownAtSceneStart: boolean;
    zhouKillerConfirmedAtSceneStart: boolean;
  };
  /** 观察内容（五感描述+想法+疑点） */
  observe?: string;
  /** 可调查对象列表 */
  investigateItems?: Array<{
    desc: string;
    suspect: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;
  /** 可执行行动列表 */
  actionItems?: Array<{
    desc: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;
}

/** GalGame 风格的单行场景指令:同一时刻的完整状态快照 */
export interface SceneLine {
  /** Stable within one accepted turn, used as evidence by the world event ledger. */
  id?: string;
  /** 当前背景文件名(继承上一行,直到显式切换) */
  background?: string;
  /** 当前 BGM 文件名 */
  bgm?: string;
  /** 当前说话者(角色名;`旁白` 特殊处理:不显示角色名和立绘) */
  speaker: string;
  /** 角色立绘文件名;默认按 `${speaker}.png` 推导 */
  character?: string;
  /** 情绪(影响 mood 特效) */
  emotion?: Mood;
  /** 单次全屏动效文件名或 id */
  effect?: string;
  /** 当前行的角色演出动作，由动作指令显式指定 */
  animation?: string;
  /** 对话行附带的物品展示 id / file / object, 仅当前行显示 */
  item?: string;
  /** 对话/旁白文本 */
  text: string;
  /** 该行播放完成后提交的玩家认知事件（必须由导演授权） */
  knowledgeEvents?: string[];
  /** 剧情要求该行的角色动作完整播放时，推进前至少停留的毫秒数。 */
  minimumDisplayMs?: number;
  /** 该行播放完成并由玩家推进时，必须先完成开场身份确认。 */
  playerIdentityPrompt?: boolean;
}

export interface StorylineData {
  scenes: Scene[];
}

export interface SceneActionData {
  observe: { description: string };
  investigate: { items: ActionItem[] };
  actions: { items: ActionItem[] };
}

export interface ActionItem {
  name: string;
  description: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration: number;
}

export interface SaveSlot {
  id: string;
  name: string;
  createdAt: number;
  thumbnail: string;
  gameState: {
    currentSceneIndex: number;
    currentLineIndex: number;
    gameStatus: GameStatus;
    currentState: CurrentState;
    /** 回合历史快照（完整恢复用） */
    history?: TurnSnapshot[];
    /** 已解锁结局 */
    endingsSeen?: string[];
    /** 自动播放 */
    autoMode?: boolean;
    /** 当前场景是否播完 */
    sceneComplete?: boolean;
  };
  tavernState: {
    variables: DynamicRecord;
    messages: ChatMessage[];
  };
  /** @deprecated 仅旧档兼容，优先使用 gameState.history */
  historyIndex: number;
}

// ========== Ending System (多真相/多结局) ==========

/** 真相路线: 锁凶层 A-老头 B-侦探 C-玩家 NONE-无凶手 FAKE-假死；解释层 CULT-邪神(叠加A) PSYCH-精神疾病(叠加C)；META-元层(STAY/TRUE)；LOOP-兜底 */
export type TruthType = 'A' | 'B' | 'C' | 'NONE' | 'FAKE' | 'CULT' | 'PSYCH' | 'META' | 'LOOP';

/** 结局分类标签 */
export type EndingTag = 'normal' | 'good' | 'bad' | 'true' | 'hidden';

/** 单个触发条件项 */
export interface EndingConditionItem {
  /** 变量路径,如 "cycleCount" / "affinity.fumi" / "suspicion.self" / "investigation.psych" */
  variablePath: string;
  /** 比较运算符 */
  operator: '>=' | '<=' | '>' | '<' | '=' | '!=';
  /** 目标值 */
  targetValue: number | string | boolean;
}

/** 条件组: 组内条件满足任一即算通过,各组之间为 AND */
export interface EndingConditionGroup {
  id: string;
  name: string;
  /** 组内条件满足模式: 'all'(全部满足) | 'any'(任一满足) */
  mode: 'all' | 'any';
  conditions: EndingConditionItem[];
}

/** 结局定义 */
export interface Ending {
  id: string;
  /** 结局名称 */
  name: string;
  /** 所属真相线 */
  truthType: TruthType;
  /** 结局分类标签 */
  tag: EndingTag;
  /** 结局描述(展示在结局画面) */
  description: string;
  /** 触发提示(接近此结局时的暗示) */
  hint?: string;
  /** 结局画面背景图 */
  backgroundImage?: string;
  /** 结局画面BGM */
  bgm?: string;
  /** 触发条件(条件组,组间AND) */
  conditionGroups: EndingConditionGroup[];
  /** 是否已解锁(玩家已通关过) */
  isUnlocked: boolean;
  /** 解锁时间 */
  unlockedAt?: number;
  /** 排序权重 */
  order: number;
  /** 额外元数据 */
  metadata?: DynamicRecord;
}

/** 结局面板状态 */
export interface EndingPanelState {
  visible: boolean;
  /** 当前展示的结局ID */
  activeEndingId: string | null;
  pendingEndingId?: string | null;
  isPreview?: boolean;
  /** 是否处于结局动画中 */
  isAnimating: boolean;
}

/** 结局检测上下文(每次场景切换/回合结束时检查) */
export interface EndingCheckContext {
  cycleCount: number;
  affinity: Record<string, number>;
  suspicion: Record<string, number>;
  investigation: Record<string, number>;
  unlockedClues: string[];
  endingsSeen: string[];
  [key: string]: unknown;
}
