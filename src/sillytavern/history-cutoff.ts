import type { ChatMessage } from './types';

/**
 * 当前玩家输入通过 userInput 独立附加；若它已经持久化为最后一条消息，
 * 必须从历史区剔除，避免同一输入在模型上下文出现两次。
 */
export function excludeCurrentInputFromHistory(
  messages: ChatMessage[],
  currentInput: string,
): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'user' && last.content === currentInput) {
    return messages.slice(0, -1);
  }
  return messages;
}
