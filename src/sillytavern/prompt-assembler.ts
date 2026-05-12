/**
 * Prompt Assembler — 酒馆兼容
 *
 * 按 preset.settings.prompt_order 顺序组装提示词模块,支持 macros 替换、
 * token 预算、世界书 position 分组(before/after)、角色卡字段。
 *
 * importer.ts 在导入时会把 SillyTavern 原生 prompts 仓库 + prompt_order 索引规范化合并,
 * 每个 prompt_order 项已经带上了 content/role/marker 等字段,运行时直接消费。
 */

import type { ChatPreset, Lorebook, ChatMessage, MatchedEntry } from './types';
import { createLorebookEngine } from './lorebook-engine';

export interface AssembleOptions {
  userInput: string;
  history: ChatMessage[];
  preset: ChatPreset | null;
  lorebooks: Lorebook[];
  activeLorebookIds: string[];
  userName: string;
  characterName: string;
  variables?: Record<string, any>;
  formatPrompt?: string;
}

export interface AssembleResult {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  matchedEntries: MatchedEntry[];
  systemPrompt: string;
}

interface RuntimePromptItem {
  identifier: string;
  name?: string;
  role?: 'system' | 'user' | 'assistant';
  enabled?: boolean;
  content?: string;
  marker?: boolean;
  injection_position?: number;
  injection_depth?: number;
}

const BEFORE_POSITIONS = new Set<string>(['before_char', 'before_example', 'example_msg_top']);
const AFTER_POSITIONS = new Set<string>(['after_char', 'after_example', 'at_depth', 'example_msg_bottom', 'outlet']);

/** marker 槽位:这些 identifier 由运行时动态填充(世界书/历史/角色卡字段),不直接用 content */
const MARKER_IDENTIFIERS = new Set([
  'worldInfoBefore', 'worldInfoAfter', 'chatHistory',
  'charDescription', 'charPersonality', 'scenario',
  'personaDescription', 'dialogueExamples',
]);

export function assemblePrompt(options: AssembleOptions): AssembleResult {
  const { userInput, history, preset, lorebooks, activeLorebookIds, userName, characterName, variables, formatPrompt } = options;

  // 1) 扫描世界书
  const activeBooks = lorebooks.filter(b => activeLorebookIds.includes(b.id));
  const matchedAll: MatchedEntry[] = [];
  const scanText = userInput + ' ' + history.slice(-5).map(m => m.content).join(' ');
  for (const book of activeBooks) {
    const engine = createLorebookEngine(book);
    const matches = engine.recursiveScan(scanText, 3);
    matchedAll.push(...matches);
  }
  const uniqueEntries = Array.from(
    new Map(matchedAll.map(e => [e.entry.id, e])).values()
  ).sort((a, b) => a.score - b.score);

  const beforeEntries = uniqueEntries.filter(e => BEFORE_POSITIONS.has(e.entry.position));
  const afterEntries = uniqueEntries.filter(e => AFTER_POSITIONS.has(e.entry.position));

  // 2) token 预算裁剪历史
  const maxContext = preset?.settings?.openai_max_context ?? 8192;
  const maxOutput = preset?.settings?.openai_max_tokens ?? 2048;
  const availableContext = Math.max(1024, maxContext - maxOutput);
  const recentHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  let currentTokens = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > availableContext * 0.85) break;
    recentHistory.unshift({ role: msg.role, content: msg.content });
    currentTokens += msgTokens;
  }

  // 3) prompt_order 编排
  const rawOrder = preset?.settings?.prompt_order;
  const promptOrder: RuntimePromptItem[] = Array.isArray(rawOrder) && rawOrder.length > 0
    ? rawOrder
    : defaultPromptOrder();
  // 备用 prompts 仓库(导入时一般已经合进 prompt_order,但旧数据可能仍是分离的)
  const customPrompts: RuntimePromptItem[] = preset?.settings?.prompts || [];

  const macroCtx = { userName, characterName, userInput, variables };

  function resolveContent(item: RuntimePromptItem): string | null {
    const id = item.identifier;

    // marker 类槽位 — 走特殊路径
    if (item.marker || MARKER_IDENTIFIERS.has(id)) {
      if (id === 'worldInfoBefore') {
        return beforeEntries.length ? beforeEntries.map(e => e.entry.content).join('\n\n') : null;
      }
      if (id === 'worldInfoAfter') {
        return afterEntries.length ? afterEntries.map(e => e.entry.content).join('\n\n') : null;
      }
      // chatHistory 由外层单独处理
      if (id === 'chatHistory') return null;
      // 角色卡字段:优先用 item.content(如果导入时带了),否则查 settings 顶层字段
      const map: Record<string, string> = {
        charDescription: 'character_description',
        charPersonality: 'character_personality',
        scenario: 'scenario',
        personaDescription: 'persona_description',
        dialogueExamples: 'dialogue_examples',
      };
      const fieldKey = map[id];
      if (fieldKey && typeof preset?.settings?.[fieldKey] === 'string' && preset.settings[fieldKey].trim()) {
        return preset.settings[fieldKey];
      }
      // marker 占位符无对应内容 → 跳过
      return item.content?.trim() ? item.content : null;
    }

    // 非 marker 块:优先用 item.content(由 importer 规范化后塞进去)
    if (item.content && item.content.trim()) return item.content;

    // 备用 1:从 prompts 仓库找(兼容未规范化的旧数据)
    const custom = customPrompts.find(p => p.identifier === id);
    if (custom?.content && custom.content.trim()) return custom.content;

    // 备用 2:从 settings 顶层字段找(main / nsfw / jailbreak 等)
    const direct = preset?.settings?.[id];
    if (typeof direct === 'string' && direct.trim()) return direct;

    return null;
  }

  const assembledMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  let systemAcc = '';
  let hasChatHistory = false;

  function flushSystem() {
    if (systemAcc) {
      assembledMessages.push({ role: 'system', content: systemAcc });
      systemAcc = '';
    }
  }

  for (const item of promptOrder) {
    if (item.enabled === false) continue;

    if (item.identifier === 'chatHistory') {
      hasChatHistory = true;
      flushSystem();
      assembledMessages.push(...recentHistory);
      continue;
    }

    const raw = resolveContent(item);
    if (!raw) continue;

    const content = replaceMacros(raw, macroCtx);
    if (!content.trim()) continue;

    const role = item.role || 'system';
    if (role === 'system') {
      systemAcc += (systemAcc ? '\n\n' : '') + content;
    } else {
      flushSystem();
      assembledMessages.push({ role, content });
    }
  }

  // 4) 附加变量/状态块
  const varBlock = formatVariablesForPrompt(variables || {});
  if (varBlock) systemAcc += (systemAcc ? '\n\n' : '') + varBlock;

  // 5) 附加格式提示词(XML 标签约束)
  if (formatPrompt) systemAcc += (systemAcc ? '\n\n' : '') + formatPrompt;

  if (systemAcc) assembledMessages.unshift({ role: 'system', content: systemAcc });

  // 6) prompt_order 没声明 chatHistory 时,自动追加历史
  if (!hasChatHistory) assembledMessages.push(...recentHistory);

  // 7) 当前用户输入
  assembledMessages.push({ role: 'user', content: replaceMacros(userInput, macroCtx) });

  const systemPrompt = assembledMessages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');

  return { messages: assembledMessages, matchedEntries: uniqueEntries, systemPrompt };
}

// ========== Macros ==========

interface MacroContext {
  userName: string;
  characterName: string;
  userInput: string;
  variables?: Record<string, any>;
}

export function replaceMacros(template: string, ctx: MacroContext): string {
  let r = template
    .replace(/\{\{user\}\}/g, ctx.userName)
    .replace(/\{\{char\}\}/g, ctx.characterName)
    .replace(/\{\{original\}\}/g, ctx.userInput);

  // {{random:a,b,c}}
  r = r.replace(/\{\{random:([^}]+)\}\}/g, (_m, list: string) => {
    const opts = list.split(',').map(s => s.trim()).filter(Boolean);
    if (opts.length === 0) return '';
    return opts[Math.floor(Math.random() * opts.length)];
  });

  // {{pick:a,b,c}} — 稳定取第一项
  r = r.replace(/\{\{pick:([^}]+)\}\}/g, (_m, list: string) => {
    const opts = list.split(',').map(s => s.trim()).filter(Boolean);
    if (opts.length === 0) return '';
    return opts[0];
  });

  // {{自定义变量}}
  if (ctx.variables) {
    r = r.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => {
      const value = ctx.variables?.[key.trim()];
      return value !== undefined ? String(value) : match;
    });
  }

  return r;
}

export const SUPPORTED_MACROS = [
  { name: '{{user}}', description: '用户名' },
  { name: '{{char}}', description: '角色名' },
  { name: '{{original}}', description: '用户原始输入' },
  { name: '{{random:a,b,c}}', description: '随机选一项' },
  { name: '{{变量名}}', description: '自定义变量' },
] as const;

// ========== Helpers ==========

function formatVariablesForPrompt(variables: Record<string, any>): string {
  const entries = Object.entries(variables);
  if (entries.length === 0) return '';
  const lines = entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return `[当前状态]\n${lines.join('\n')}`;
}

function defaultPromptOrder(): RuntimePromptItem[] {
  return [
    { identifier: 'main', role: 'system', enabled: true },
    { identifier: 'worldInfoBefore', role: 'system', enabled: true, marker: true },
    { identifier: 'charDescription', role: 'system', enabled: true, marker: true },
    { identifier: 'charPersonality', role: 'system', enabled: true, marker: true },
    { identifier: 'scenario', role: 'system', enabled: true, marker: true },
    { identifier: 'personaDescription', role: 'system', enabled: true, marker: true },
    { identifier: 'dialogueExamples', role: 'system', enabled: true, marker: true },
    { identifier: 'chatHistory', role: 'system', enabled: true, marker: true },
    { identifier: 'worldInfoAfter', role: 'system', enabled: true, marker: true },
  ];
}
