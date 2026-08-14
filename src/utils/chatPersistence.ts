import { saveChat } from '../sillytavern/database';
import type { ChatMessage, ChatSession } from '../sillytavern/types';
import { useGameStore } from '../stores/gameStore';

/**
 * 统一的会话持久化入口: 更新当前会话并同步 IndexedDB 与 store。
 * 返回更新后的会话；无活动会话时返回 null。
 */
export async function persistActiveChat(patch: {
  messages?: ChatMessage[];
  variables?: Record<string, any>;
  userName?: string;
}): Promise<ChatSession | null> {
  const state = useGameStore.getState();
  const activeChat = state.tavern.chats.find(chat => chat.id === state.tavern.activeChatId);
  if (!activeChat) return null;

  const updated: ChatSession = {
    ...activeChat,
    ...(patch.messages ? { messages: patch.messages } : {}),
    ...(patch.variables ? { variables: patch.variables } : {}),
    ...(patch.userName ? { userName: patch.userName } : {}),
    updatedAt: Date.now(),
  };
  await saveChat(updated);
  useGameStore.getState().actions.setChats(
    useGameStore.getState().tavern.chats.map(chat => (chat.id === updated.id ? updated : chat)),
  );
  return updated;
}
