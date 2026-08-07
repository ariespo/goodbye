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

    // v4: 新增字体与音乐音量设置
    this.version(4)
      .stores({
        settings: '++id',
        presets: 'id, name, updatedAt',
        lorebooks: 'id, name, updatedAt',
        chats: 'id, name, updatedAt',
        saves: 'id, name, createdAt',
      })
      .upgrade(async tx => {
        await tx.table('settings').toCollection().modify((s: any) => {
          if (!s.fontFamily) s.fontFamily = 'renou-fangsong';
          if (s.musicVolume === undefined) s.musicVolume = 0.5;
        });
      });

    this.version(5)
      .stores({
        settings: '++id',
        presets: 'id, name, updatedAt',
        lorebooks: 'id, name, updatedAt',
        chats: 'id, name, updatedAt',
        saves: 'id, name, createdAt',
      })
      .upgrade(async tx => {
        await tx.table('settings').toCollection().modify((s: any) => {
          if (s.soundVolume === undefined) s.soundVolume = 0.65;
        });
      });

    this.version(6)
      .stores({
        settings: '++id',
        presets: 'id, name, updatedAt',
        lorebooks: 'id, name, updatedAt',
        chats: 'id, name, updatedAt',
        saves: 'id, name, createdAt',
      })
      .upgrade(async tx => {
        await tx.table('settings').toCollection().modify((s: any) => {
          if (!s.agentNarrativeMode) s.agentNarrativeMode = 'standard';
        });
      });
  }
}

interface TableLike<T> {
  toArray(): Promise<T[]>;
  put(item: T): Promise<void>;
  add(item: T): Promise<string | number | undefined>;
  delete(id: string | number): Promise<void>;
  clear(): Promise<void>;
  orderBy(field: keyof T): { reverse: () => { toArray: () => Promise<T[]> } };
}

interface StorageDatabase {
  settings: TableLike<AppSettings>;
  presets: TableLike<ChatPreset>;
  lorebooks: TableLike<Lorebook>;
  chats: TableLike<ChatSession>;
  saves: TableLike<SaveSlot>;
  open(): Promise<Dexie | void>;
}

class MemoryTable<T extends { id?: string | number }> implements TableLike<T> {
  private items: T[] = [];

  toArray(): Promise<T[]> {
    return Promise.resolve([...this.items]);
  }

  async put(item: T): Promise<void> {
    const id = (item as { id?: string | number }).id;
    const index = id === undefined ? -1 : this.items.findIndex(i => i.id === id);
    if (index >= 0) {
      this.items[index] = item;
    } else {
      this.items.push(item);
    }
  }

  async add(item: T): Promise<string | number | undefined> {
    this.items.push(item);
    return item.id;
  }

  async delete(id: string | number): Promise<void> {
    this.items = this.items.filter(i => i.id !== id);
  }

  async clear(): Promise<void> {
    this.items = [];
  }

  orderBy(field: keyof T): { reverse: () => { toArray: () => Promise<T[]> } } {
    return {
      reverse: () => ({
        toArray: async () =>
          [...this.items].sort((a, b) => {
            const av = a[field] as number | undefined;
            const bv = b[field] as number | undefined;
            if (av === undefined || bv === undefined) return 0;
            return bv - av;
          }),
      }),
    };
  }
}

class MemoryDatabase implements StorageDatabase {
  settings = new MemoryTable<AppSettings>();
  presets = new MemoryTable<ChatPreset>();
  lorebooks = new MemoryTable<Lorebook>();
  chats = new MemoryTable<ChatSession>();
  saves = new MemoryTable<SaveSlot>();

  async open(): Promise<void> {
    // 内存数据库无需初始化
  }
}

export let db: StorageDatabase = new FarewellDatabase();

export async function initializeDatabase(): Promise<boolean> {
  try {
    await db.open();
    const settings = await db.settings.toArray();
    if (settings.length === 0) {
      await db.settings.add(getDefaultSettings());
    }
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('IndexedDB 无法打开，切换到内存存储:', error);
    db = new MemoryDatabase();
    await db.open();
    await db.settings.add(getDefaultSettings());
    return false;
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
    fontFamily: 'renou-fangsong',
    musicVolume: 0.5,
    soundVolume: 0.65,
    agentNarrativeMode: 'standard',
  };
}

function normalizeSettings(partial: AppSettings | Partial<AppSettings> | undefined): AppSettings {
  const defaults = getDefaultSettings();
  if (!partial) return defaults;
  return {
    ...defaults,
    ...partial,
    api: {
      ...defaults.api,
      ...(partial.api || {}),
      secondary: {
        ...defaults.api.secondary,
        ...(partial.api?.secondary || {}),
      },
    },
    activeLorebookIds: Array.isArray(partial.activeLorebookIds)
      ? partial.activeLorebookIds
      : defaults.activeLorebookIds,
    customTags: Array.isArray(partial.customTags)
      ? partial.customTags
      : defaults.customTags,
    opaqueTags: Array.isArray(partial.opaqueTags)
      ? partial.opaqueTags
      : defaults.opaqueTags,
  };
}

export async function getSettings(): Promise<AppSettings | undefined> {
  const stored = (await db.settings.toArray())[0];
  return normalizeSettings(stored);
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
