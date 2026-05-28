import Dexie, { type Table } from 'dexie';
import type { AppSettings, ChatPreset, Lorebook, ChatSession, SaveSlot } from './types';
import { DEFAULT_FORMAT_PROMPT, DEFAULT_OPAQUE_TAGS } from './types';

export class FarewellDatabase extends Dexie {
  settings!: Table<AppSettings>;
  presets!: Table<ChatPreset>;
  lorebooks!: Table<Lorebook>;
  chats!: Table<ChatSession>;
  saves!: Table<SaveSlot>;

  constructor() {
    super('FarewellDB');

    this.version(1).stores({
      settings: '++id',
      presets: 'id, name, updatedAt',
      lorebooks: 'id, name, updatedAt',
      chats: 'id, name, updatedAt',
      saves: 'id, name, createdAt',
    });

    // v2: 升级到 tavernlike v3 兼容内核 — lorebook 字段大改,清空 lorebooks 表;
    //     设置补齐新增字段 (api.secondary / opaqueTags / formatPromptTemplate)
    this.version(2)
      .stores({
        settings: '++id',
        presets: 'id, name, updatedAt',
        lorebooks: 'id, name, updatedAt',
        chats: 'id, name, updatedAt',
        saves: 'id, name, createdAt',
      })
      .upgrade(async tx => {
        await tx.table('lorebooks').clear();
        await tx.table('settings').toCollection().modify((s: any) => {
          if (s.api && !s.api.secondary) {
            s.api.secondary = s.secondaryApi
              ? { ...s.secondaryApi }
              : { enabled: false, baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' };
          }
          delete s.secondaryApi;
          if (!s.opaqueTags) s.opaqueTags = [...DEFAULT_OPAQUE_TAGS];
          if (!s.formatPromptTemplate) s.formatPromptTemplate = DEFAULT_FORMAT_PROMPT;
        });
      });

    // v3: 次 API 支持独立 temperature / maxTokens
    this.version(3)
      .stores({
        settings: '++id',
        presets: 'id, name, updatedAt',
        lorebooks: 'id, name, updatedAt',
        chats: 'id, name, updatedAt',
        saves: 'id, name, createdAt',
      })
      .upgrade(async tx => {
        await tx.table('settings').toCollection().modify((s: any) => {
          if (s.api?.secondary) {
            if (s.api.secondary.temperature === undefined) s.api.secondary.temperature = 0.3;
            if (s.api.secondary.maxTokens === undefined) s.api.secondary.maxTokens = 512;
          }
        });
      });
  }
}

export const db = new FarewellDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.open();
  const settings = await db.settings.toArray();
  if (settings.length === 0) {
    await db.settings.add(getDefaultSettings());
  }
}

function getDefaultSettings(): AppSettings {
  return {
    api: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      timeout: 60000,
      secondary: {
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
      },
    },
    characterName: '少女',
    userName: '玩家',
    activePresetId: null,
    activeLorebookIds: [],
    uiMode: 'game',
    customTags: ['maintext', 'option', 'sum', 'vars', 'thinking'],
    typingSpeed: 35,
    fontSize: 'medium',
    moodIntensity: 1,
    opaqueTags: [...DEFAULT_OPAQUE_TAGS],
    formatPromptTemplate: DEFAULT_FORMAT_PROMPT,
    autoMode: false,
    autoIntervalMs: 1500,
  };
}

export async function getSettings(): Promise<AppSettings | undefined> {
  return (await db.settings.toArray())[0];
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}

export async function getLorebooks(): Promise<Lorebook[]> {
  return db.lorebooks.toArray();
}

export async function saveLorebook(lorebook: Lorebook): Promise<void> {
  await db.lorebooks.put(lorebook);
}

export async function deleteLorebook(id: string): Promise<void> {
  await db.lorebooks.delete(id);
}

export async function getPresets(): Promise<ChatPreset[]> {
  return db.presets.toArray();
}

export async function savePreset(preset: ChatPreset): Promise<void> {
  await db.presets.put(preset);
}

export async function deletePreset(id: string): Promise<void> {
  await db.presets.delete(id);
}

export async function getChats(): Promise<ChatSession[]> {
  return db.chats.orderBy('updatedAt').reverse().toArray();
}

export async function saveChat(chat: ChatSession): Promise<void> {
  await db.chats.put(chat);
}

export async function deleteChat(id: string): Promise<void> {
  await db.chats.delete(id);
}

export async function getSaves(): Promise<SaveSlot[]> {
  return db.saves.orderBy('createdAt').reverse().toArray();
}

export async function saveSlot(slot: SaveSlot): Promise<void> {
  await db.saves.put(slot);
}

export async function deleteSave(id: string): Promise<void> {
  await db.saves.delete(id);
}
