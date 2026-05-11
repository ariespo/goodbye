import type { Lorebook, ChatPreset } from './types';

export function importLorebook(data: Record<string, any>): Lorebook {
  const entries = (data.entries || []).map((e: any, index: number) => ({
    uid: e.uid ?? index,
    key: Array.isArray(e.key) ? e.key : (e.key || '').split(',').map((k: string) => k.trim()).filter(Boolean),
    keysecondary: Array.isArray(e.keysecondary) ? e.keysecondary : [],
    comment: e.comment || '',
    content: e.content || '',
    position: e.position ?? 0,
    order: e.order ?? 100,
    enabled: e.enabled ?? true,
    constant: e.constant ?? false,
    selective: e.selective ?? false,
    selectiveLogic: e.selectiveLogic ?? 0,
    addMemo: e.addMemo ?? false,
    displayIndex: e.displayIndex ?? index,
    excludeRecursion: e.excludeRecursion ?? false,
    preventRecursion: e.preventRecursion ?? false,
    delay: e.delay ?? 0,
  }));

  return {
    id: crypto.randomUUID(),
    name: data.name || '导入的世界书',
    entries,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function exportLorebook(lorebook: Lorebook): Record<string, any> {
  return {
    name: lorebook.name,
    entries: lorebook.entries.map(e => ({
      uid: e.uid,
      key: e.key,
      keysecondary: e.keysecondary,
      comment: e.comment,
      content: e.content,
      position: e.position,
      order: e.order,
      enabled: e.enabled,
      constant: e.constant,
      selective: e.selective,
      selectiveLogic: e.selectiveLogic,
      addMemo: e.addMemo,
      displayIndex: e.displayIndex,
      excludeRecursion: e.excludeRecursion,
      preventRecursion: e.preventRecursion,
      delay: e.delay,
    })),
  };
}

export function importPreset(data: Record<string, any>): ChatPreset {
  return {
    id: crypto.randomUUID(),
    name: data.name || '导入的预设',
    settings: {
      temp_openai: data.temp_openai ?? data.temperature ?? 0.8,
      openai_max_tokens: data.openai_max_tokens ?? data.max_tokens ?? 2048,
      top_p_openai: data.top_p_openai ?? data.top_p ?? 1,
      freq_pen_openai: data.freq_pen_openai ?? data.frequency_penalty ?? 0,
      pres_pen_openai: data.pres_pen_openai ?? data.presence_penalty ?? 0,
      openai_model: data.openai_model ?? data.model ?? 'gpt-4',
      stream_openai: data.stream_openai ?? data.stream ?? true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function exportPreset(preset: ChatPreset): Record<string, any> {
  return {
    name: preset.name,
    temp_openai: preset.settings.temp_openai,
    openai_max_tokens: preset.settings.openai_max_tokens,
    top_p_openai: preset.settings.top_p_openai,
    freq_pen_openai: preset.settings.freq_pen_openai,
    pres_pen_openai: preset.settings.pres_pen_openai,
    openai_model: preset.settings.openai_model,
    stream_openai: preset.settings.stream_openai,
  };
}

export function exportToJson(data: Record<string, any>, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJsonFile<T = Record<string, any>>(): Promise<T | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        resolve(data as T);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
