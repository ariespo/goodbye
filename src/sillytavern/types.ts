export interface AppSettings {
  id?: number;
  api: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  secondaryApi: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  characterName: string;
  userName: string;
  activePresetId: string | null;
  activeLorebookIds: string[];
  uiMode: 'game' | 'chat';
  customTags: string[];
  typingSpeed: number;
  fontSize: 'small' | 'medium' | 'large';
  moodIntensity: number;
}

export interface ChatPreset {
  id: string;
  name: string;
  settings: {
    temp_openai: number;
    openai_max_tokens: number;
    top_p_openai: number;
    freq_pen_openai: number;
    pres_pen_openai: number;
    openai_model: string;
    stream_openai: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export interface LorebookEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  position: number;
  order: number;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  displayIndex: number;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delay: number;
}

export interface Lorebook {
  id: string;
  name: string;
  entries: LorebookEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  variables: Record<string, any>;
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

export interface ParsedContent {
  thinking: string;
  maintext: string;
  options: string[];
  summary: string;
  vars: Record<string, any>;
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
