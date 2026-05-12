/**
 * 变量系统工具函数
 *
 * - extractVariables: 从文本里解析 <var name="x" value="y"/> 标签
 * - truncateChatAt:   将会话截断到第 index 条,恢复对应快照
 * - branchChat:       从第 index 条分支出一个新会话
 */

import type { ChatSession, ChatMessage } from './types';

export function extractVariables(text: string): { cleanedText: string; updates: Record<string, string | number> } {
  const updates: Record<string, string | number> = {};
  const regex = /<var\s+name="([^"]+)"\s+value="([^"]+)"\s*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const [, name, rawValue] = match;
    const num = Number(rawValue);
    updates[name] = Number.isNaN(num) ? rawValue : num;
  }
  const cleanedText = text.replace(regex, '').replace(/\n{2,}/g, '\n').trim();
  return { cleanedText, updates };
}

export function mergeShallow<T extends Record<string, any>>(base: T = {} as T, updates: Partial<T> = {}): T {
  return { ...base, ...updates };
}

/** 把会话截断到第 index 条(不含 index),variables 恢复到上一条 message 的 variables(或传入) */
export function truncateChatAt(
  chat: ChatSession,
  index: number,
  variables?: Record<string, any>
): ChatSession {
  const truncated = chat.messages.slice(0, index);
  const restoredVars = variables ?? truncated[truncated.length - 1]?.variables ?? {};
  return {
    ...chat,
    messages: truncated,
    variables: restoredVars,
    updatedAt: Date.now(),
  };
}

/** 从第 index 条(含)分支出一个新会话 */
export function branchChat(
  source: ChatSession,
  index: number,
  options: {
    name: string;
    presetId: string | null;
    lorebookIds: string[];
    variables?: Record<string, any>;
  }
): ChatSession {
  const slice = source.messages.slice(0, index + 1).map(m => ({ ...m }));
  return {
    id: crypto.randomUUID(),
    name: options.name,
    messages: slice,
    characterName: source.characterName,
    userName: source.userName,
    presetId: options.presetId,
    lorebookIds: [...options.lorebookIds],
    variables: options.variables ?? source.messages[index]?.variables ?? {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 把 ChatMessage 数组的最新一条作为变量快照基准 */
export function getLastVariables(messages: ChatMessage[]): Record<string, any> {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].variables) return messages[i].variables;
  }
  return {};
}
