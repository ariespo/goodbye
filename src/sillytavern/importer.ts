/**
 * SillyTavern Import/Export Adapter
 *
 * 完整酒馆世界书/预设的 JSON 双向转换。
 * 预设导入会把 prompts 仓库 + prompt_order 索引规范化合并,使运行时直接消费。
 */

import type { Lorebook, LorebookEntry, ChatPreset, SillyTavernLorebookExport, PromptOrderItem } from './types';

const POSITION_MAP: Record<number, LorebookEntry['position']> = {
  0: 'before_char',
  1: 'after_char',
  2: 'before_example',
  3: 'after_example',
  4: 'at_depth',
  5: 'example_msg_top',
  6: 'example_msg_bottom',
  7: 'outlet',
};

const REVERSE_POSITION_MAP: Record<LorebookEntry['position'], number> = {
  before_char: 0,
  after_char: 1,
  before_example: 2,
  after_example: 3,
  at_depth: 4,
  example_msg_top: 5,
  example_msg_bottom: 6,
  outlet: 7,
};

const LOGIC_MAP: Record<number, LorebookEntry['selectiveLogic']> = {
  0: 'and_any',
  1: 'not_all',
  2: 'not_any',
  3: 'and_all',
};

const REVERSE_LOGIC_MAP: Record<LorebookEntry['selectiveLogic'], number> = {
  and_any: 0,
  not_all: 1,
  not_any: 2,
  and_all: 3,
};

// ========== Lorebook ==========

export function importLorebook(data: SillyTavernLorebookExport, fileName?: string): Lorebook {
  const rawEntries = Object.values(data.entries || {});
  const entries: LorebookEntry[] = rawEntries.map((e) => ({
    id: crypto.randomUUID(),
    keys: Array.isArray(e.key) ? e.key : (typeof e.key === 'string' ? (e.key as string).split(',').map(k => k.trim()).filter(Boolean) : []),
    secondaryKeys: Array.isArray(e.keysecondary) ? e.keysecondary : [],
    content: e.content || '',
    comment: e.comment,
    enabled: !(e.disable || e.excluded),
    order: e.order ?? 100,
    position: POSITION_MAP[e.position ?? 1] ?? 'after_char',
    depth: e.depth,
    role: e.role,
    selective: e.selective ?? false,
    selectiveLogic: LOGIC_MAP[e.selectiveLogic ?? 1] ?? 'not_all',
    constant: e.constant ?? false,
    probability: e.useProbability ? (e.probability ?? 100) : 100,
    useProbability: e.useProbability ?? false,
    addMemo: e.addMemo ?? false,
    sticky: e.sticky,
    cooldown: e.cooldown,
    delay: e.delay,
    weight: e.weight,
    scanDepth: e.scanDepth,
    caseSensitive: e.caseSensitive,
    matchWholeWords: e.matchWholeWords,
    excludeRecursion: e.excludeRecursion,
    preventRecursion: e.preventRecursion,
    useGroupScoring: e.useGroupScoring,
    matchPersonaDescription: e.matchPersonaDescription,
    matchCharacterDescription: e.matchCharacterDescription,
    matchCharacterPersonality: e.matchCharacterPersonality,
    matchCharacterDepthPrompt: e.matchCharacterDepthPrompt,
    matchScenario: e.matchScenario,
    matchCreatorNotes: e.matchCreatorNotes,
    group: e.group,
    decorators: e.decorators,
    characterFilter: e.characterFilter,
  }));

  return {
    id: crypto.randomUUID(),
    name: data.name || (fileName ? fileName.replace(/\.json$/i, '') : '导入的世界书'),
    description: data.description,
    entries,
    recursiveScanning: data.settings?.recursive_scanning ?? false,
    caseSensitive: data.settings?.case_sensitive ?? false,
    matchWholeWords: data.settings?.match_whole_words ?? false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function exportLorebook(lorebook: Lorebook): SillyTavernLorebookExport {
  const entries: SillyTavernLorebookExport['entries'] = {};
  lorebook.entries.forEach((e, index) => {
    entries[String(index)] = {
      uid: index,
      key: e.keys,
      keysecondary: e.secondaryKeys || [],
      comment: e.comment || e.content.slice(0, 50),
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      selectiveLogic: (REVERSE_LOGIC_MAP[e.selectiveLogic] ?? 1) as 0 | 1 | 2 | 3,
      addMemo: e.addMemo,
      order: e.order,
      position: REVERSE_POSITION_MAP[e.position] as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      role: e.role ?? 0,
      disable: e.enabled === false,
      probability: e.probability,
      depth: e.depth ?? 4,
      group: e.group ?? '',
      useProbability: e.useProbability ?? (e.probability < 100),
      excluded: false,
      sticky: e.sticky ?? 0,
      cooldown: e.cooldown ?? 0,
      delay: e.delay ?? 0,
      weight: e.weight ?? 100,
      scanDepth: e.scanDepth ?? 0,
      caseSensitive: e.caseSensitive ?? false,
      matchWholeWords: e.matchWholeWords ?? false,
      excludeRecursion: e.excludeRecursion ?? false,
      preventRecursion: e.preventRecursion ?? false,
      useGroupScoring: e.useGroupScoring ?? false,
      matchPersonaDescription: e.matchPersonaDescription ?? false,
      matchCharacterDescription: e.matchCharacterDescription ?? false,
      matchCharacterPersonality: e.matchCharacterPersonality ?? false,
      matchCharacterDepthPrompt: e.matchCharacterDepthPrompt ?? false,
      matchScenario: e.matchScenario ?? false,
      matchCreatorNotes: e.matchCreatorNotes ?? false,
      decorators: e.decorators ?? [],
      characterFilter: e.characterFilter ?? { isExclude: false, names: [], tags: [] },
    };
  });

  return {
    name: lorebook.name,
    description: lorebook.description,
    entries,
    settings: {
      recursive_scanning: lorebook.recursiveScanning,
      case_sensitive: lorebook.caseSensitive,
      match_whole_words: lorebook.matchWholeWords,
    },
  };
}

// ========== Preset ==========

/**
 * 规范化酒馆 prompt_order:把 prompts 仓库 + prompt_order 索引按 identifier join,
 * 得到每项都带 content/role/marker 的扁平数组。
 *
 * 支持的输入格式:
 *   A. SillyTavern 原生:`data.prompts = [{identifier, name, content, role, marker}]`
 *      + `data.prompt_order = [{identifier, enabled}]`
 *   B. Tavernlike:`data.prompt_order = [{identifier, name, content, enabled}]`(自带 content)
 *   C. 角色卡包装:`data.prompt_order = [{character_id, order:[{identifier, enabled}]}]`
 *   D. 按 API 分组:`data.prompt_order = { openai: [{identifier, enabled}], claude: [...] }`
 */
function normalizePromptOrder(rawOrder: any, promptsRepo: any[]): PromptOrderItem[] {
  let flat: any[] = [];

  if (Array.isArray(rawOrder)) {
    if (rawOrder.length === 0) {
      flat = [];
    } else if (rawOrder[0] && typeof rawOrder[0] === 'object' && Array.isArray(rawOrder[0].order)) {
      flat = rawOrder[0].order;
    } else if (rawOrder[0] && (rawOrder[0].identifier !== undefined || rawOrder[0].id !== undefined)) {
      flat = rawOrder;
    }
  } else if (rawOrder && typeof rawOrder === 'object') {
    for (const k of Object.keys(rawOrder)) {
      const arr = rawOrder[k];
      if (Array.isArray(arr) && arr.length > 0) {
        flat = arr;
        break;
      }
    }
  }

  const repoMap = new Map<string, any>();
  for (const p of promptsRepo) {
    const id = p?.identifier || p?.id;
    if (id) repoMap.set(id, p);
  }

  const processed = new Set<string>();
  const result: PromptOrderItem[] = [];

  for (const entry of flat) {
    const identifier = entry?.identifier || entry?.id;
    if (!identifier) continue;
    processed.add(identifier);
    const def = repoMap.get(identifier);
    result.push({
      identifier,
      name: def?.name ?? entry?.name ?? identifier,
      role: resolveRole(def, entry),
      enabled: entry?.enabled ?? def?.enabled ?? true,
      // marker / content / injection 字段统一以扩展字段形式塞进去,Type 上是 PromptOrderItem
      ...({
        content: def?.content ?? entry?.content ?? entry?.system_prompt ?? '',
        marker: !!(def?.marker ?? entry?.marker),
        injection_position: def?.injection_position ?? entry?.injection_position,
        injection_depth: def?.injection_depth ?? entry?.injection_depth,
      } as any),
    });
  }

  // 把未出现在 prompt_order 但出现在 prompts 仓库中的非空条目也加进来(默认 disabled)
  for (const p of promptsRepo) {
    const id = p?.identifier || p?.id;
    if (!id || processed.has(id)) continue;
    const hasContent = !!(p?.content || p?.name);
    if (!hasContent && !p?.marker) continue;
    result.push({
      identifier: id,
      name: p?.name ?? id,
      role: resolveRole(p, null),
      enabled: false,
      ...({
        content: p?.content ?? '',
        marker: !!p?.marker,
        injection_position: p?.injection_position,
        injection_depth: p?.injection_depth,
      } as any),
    });
  }

  return result;
}

function resolveRole(def: any, entry: any): 'system' | 'user' | 'assistant' {
  const r = def?.role ?? entry?.role;
  if (typeof r === 'string') {
    const lower = r.toLowerCase();
    if (lower === 'user' || lower === 'assistant' || lower === 'system') return lower;
  }
  if (r === 1) return 'user';
  if (r === 2) return 'assistant';
  return 'system';
}

export function importPreset(data: Record<string, any>, fileName?: string): ChatPreset {
  const derivedName: string =
    data.preset || data.name ||
    (fileName ? fileName.replace(/\.json$/i, '') : '导入的预设');

  // 1) 合并 prompts 仓库 + prompt_order 索引
  const promptsRepo = Array.isArray(data.prompts) ? data.prompts : [];
  const normalizedOrder = normalizePromptOrder(data.prompt_order ?? data.promptOrder, promptsRepo);

  // 2) 参数 fallback(支持嵌套 gen_params/parameters)
  const params = data.gen_params || data.parameters || data;
  const fallbackParam = (...keys: string[]) => {
    for (const k of keys) {
      if (params[k] !== undefined) return params[k];
    }
    return undefined;
  };

  // 3) 写回 settings:保留原始字段,规范化 prompt_order 覆盖,补全参数缺省值
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = data;
  const settings: Record<string, any> = {
    ...rest,
    prompt_order: normalizedOrder,
  };

  if (settings.temp_openai === undefined) {
    const v = fallbackParam('temperature', 'temp');
    if (v !== undefined) settings.temp_openai = v;
  }
  if (settings.openai_max_tokens === undefined) {
    const v = fallbackParam('openai_max_tokens', 'max_tokens', 'maxTokens', 'max_length', 'genamt');
    if (v !== undefined) settings.openai_max_tokens = v;
  }
  if (settings.top_p_openai === undefined) {
    const v = fallbackParam('top_p_openai', 'top_p', 'topP');
    if (v !== undefined) settings.top_p_openai = v;
  }
  if (settings.freq_pen_openai === undefined) {
    const v = fallbackParam('freq_pen_openai', 'frequency_penalty', 'frequencyPenalty', 'rep_pen');
    if (v !== undefined) settings.freq_pen_openai = v;
  }
  if (settings.pres_pen_openai === undefined) {
    const v = fallbackParam('pres_pen_openai', 'presence_penalty', 'presencePenalty');
    if (v !== undefined) settings.pres_pen_openai = v;
  }
  if (settings.openai_max_context === undefined) {
    const v = data.openai_max_context ?? data.contextLength ?? data.context_length ?? data.truncation_length;
    if (v !== undefined) settings.openai_max_context = v;
  }
  if (settings.openai_model === undefined) {
    const v = data.openai_model || data.model || data.modelName;
    if (v !== undefined) settings.openai_model = v;
  }

  return {
    id: crypto.randomUUID(),
    name: derivedName,
    description: data.description,
    settings,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function exportPreset(preset: ChatPreset): Record<string, any> {
  return {
    ...preset.settings,
    name: preset.name,
    description: preset.description,
  };
}

// ========== JSON Helpers ==========

export async function importJsonFile<T = unknown>(): Promise<{ data: T; fileName: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        resolve({ data: JSON.parse(text) as T, fileName: file.name });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export function exportToJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface MultiImportInput {
  fileName: string;
  json: SillyTavernLorebookExport;
}

export interface MultiImportResults {
  successes: Array<{ fileName: string; lorebook: Lorebook }>;
  failures: Array<{ fileName: string; error: string }>;
}

export function importMultipleLorebooks(inputs: MultiImportInput[]): MultiImportResults {
  const successes: MultiImportResults['successes'] = [];
  const failures: MultiImportResults['failures'] = [];
  for (const input of inputs) {
    try {
      if (!input.json || typeof input.json !== 'object' || Array.isArray(input.json)) {
        throw new Error('Invalid lorebook JSON: expected an object');
      }
      const lb = importLorebook(input.json, input.fileName);
      successes.push({ fileName: input.fileName, lorebook: lb });
    } catch (e) {
      failures.push({ fileName: input.fileName, error: String((e as Error).message ?? e) });
    }
  }
  return { successes, failures };
}

export function renameLorebook(lb: Lorebook, newName: string): Lorebook {
  return { ...lb, name: newName, updatedAt: Date.now() };
}
