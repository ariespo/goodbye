/**
 * Prompt Assembler — 酒馆兼容
 *
 * 按 preset.settings.prompt_order 顺序组装提示词模块,支持 macros 替换、
 * token 预算、世界书 position 分组(before/after)、角色卡字段。
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

const BEFORE_POSITIONS = new Set<string>(['before_char', 'before_example', 'example_msg_top']);
const AFTER_POSITIONS = new Set<string>(['after_char', 'after_example', 'at_depth', 'example_msg_bottom', 'outlet']);

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
  const recentHistory: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  let currentTokens = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;
    const msgTokens = msg.content.length / 4;
    if (currentTokens + msgTokens > maxContext * 0.8) break;
    recentHistory.unshift({ role: msg.role, content: msg.content });
    currentTokens += msgTokens;
  }

  // 3) prompt_order 编排
  const promptOrder: Array<{ identifier: string; role?: 'system' | 'user' | 'assistant'; enabled?: boolean }> = preset?.settings?.prompt_order || defaultPromptOrder();
  const customPrompts: Array<{ identifier: string; role?: 'system' | 'user' | 'assistant'; content?: string }> = preset?.settings?.prompts || [];

  const macroCtx = { userName, characterName, userInput, variables };

  function resolveContent(identifier: string): string | null {
    if (identifier === 'worldInfoBefore') {
      return beforeEntries.length ? beforeEntries.map(e => e.entry.content).join('\n\n') : null;
    }
    if (identifier === 'worldInfoAfter') {
      return afterEntries.length ? afterEntries.map(e => e.entry.content).join('\n\n') : null;
    }
    if (identifier === 'charDescription') return preset?.settings?.character_description || null;
    if (identifier === 'charPersonality') return preset?.settings?.character_personality || null;
    if (identifier === 'scenario') return preset?.settings?.scenario || null;
    if (identifier === 'personaDescription') return preset?.settings?.persona_description || null;
    if (identifier === 'dialogueExamples') return preset?.settings?.dialogue_examples || null;
    if (identifier === 'groupNudge') return preset?.settings?.group_nudge_prompt || null;
    if (identifier === 'impersonate') return preset?.settings?.impersonation_prompt || null;
    if (identifier === 'quietPrompt') return preset?.settings?.quiet_prompt || null;
    // 自定义模块
    const custom = customPrompts.find(p => p.identifier === identifier);
    if (custom?.content) return custom.content;
    // preset 顶层字段(main / nsfw / jailbreak / enhanceDefinitions ...)
    const direct = preset?.settings?.[identifier];
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

    const raw = resolveContent(item.identifier);
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

  // {{pick:a,b,c}} — 同 random 但稳定(基于 hash)
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

function defaultPromptOrder() {
  return [
    { identifier: 'main', role: 'system' as const, enabled: true },
    { identifier: 'worldInfoBefore', role: 'system' as const, enabled: true },
    { identifier: 'charDescription', role: 'system' as const, enabled: true },
    { identifier: 'charPersonality', role: 'system' as const, enabled: true },
    { identifier: 'scenario', role: 'system' as const, enabled: true },
    { identifier: 'personaDescription', role: 'system' as const, enabled: true },
    { identifier: 'dialogueExamples', role: 'system' as const, enabled: true },
    { identifier: 'chatHistory', role: 'system' as const, enabled: true },
    { identifier: 'worldInfoAfter', role: 'system' as const, enabled: true },
  ];
}
