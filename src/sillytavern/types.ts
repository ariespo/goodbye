/**
 * SillyTavern Web - Core Types (v3 内核 + farewell-web 游戏专属)
 */

// ========== World Book (Lorebook) Types ==========

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
  settings: Record<string, any>;
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
  };
}

export interface AppSettings {
  id?: number;
  api: ApiSettings;
  characterName: string;
  userName: string;
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
}

export const DEFAULT_FORMAT_PROMPT = `你必须严格按照以下 XML 标签格式输出回复，不要使用 Markdown 包裹：
<thinking>……</thinking>     ← 可选；内部任何字符都视为思考过程，不被解析
<maintext>……</maintext>     ← 必填；本回合的剧情正文，可多段，保留换行
<option>选项 A
选项 B
选项 C</option>              ← 必填；至少 2 项，每行一个
<sum>……</sum>               ← 必填；本回合一句话总结
<vars>{ "金钱": +10, "HP": 38 }</vars>   ← 选填；JSON 深合并`;

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
  variables: Record<string, any>;
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
  variables: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ========== Stream Parsing (farewell-web 风格,保留旧字段名) ==========

export interface ParsedContent {
  thinking: string;
  maintext: string;
  options: string[];
  summary: string;
  vars: Record<string, any>;
}

export type Task = 'story' | 'summary' | 'vars';
export type ApiTarget = 'primary' | 'secondary';

// ========== Game State (farewell-web 专属) ==========

export interface TurnSnapshot {
  turnIndex: number;
  timestamp: number;
  summary: string;
  gameStatus: GameStatus;
  variables: Record<string, any>;
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
}

export type Mood = 'calm' | 'horror' | 'insane' | 'sad' | 'angry' | 'happy';

export interface Scene {
  id: string;
  lines: SceneLine[];
  background?: string;
  character?: string;
  bgm?: string;
  mood?: Mood;
}

export interface SceneLine {
  speaker: string;
  text: string;
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
  };
  tavernState: {
    variables: Record<string, any>;
    messages: ChatMessage[];
  };
  historyIndex: number;
}
