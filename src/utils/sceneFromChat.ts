import { OPENING_STORYLINE, parseOpeningStoryline } from '../engine/opening-storyline';
import { maintextToScene } from '../engine/scene-parser';
import type { ChatSession, Scene } from '../sillytavern/types';
import { acceptedActionUiFromMessage } from './actionPresentation';

/**
 * 从会话最后一条 assistant 消息重建可交互场景。
 * 仅当提取的场景含交互数据(observe/investigate/action)时返回，否则返回 null。
 */
export function rebuildSceneFromChat(chat: ChatSession | null | undefined): Scene | null {
  if (!chat || chat.messages.length === 0) return null;
  const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return null;
  const maintext = lastAssistant.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim() || '';
  if (!maintext) return null;
  const scene = maintext === OPENING_STORYLINE ? parseOpeningStoryline() : maintextToScene(maintext);
  const { actionOutcome } = acceptedActionUiFromMessage(lastAssistant, lastAssistant.parsed?.options ?? []);
  const localObserve = lastAssistant.localAction === 'map-travel'
    && typeof lastAssistant.parsed?.observe === 'string'
    && lastAssistant.parsed.observe.trim()
    ? lastAssistant.parsed.observe
    : undefined;
  if (scene.lines.length > 0 && (
    scene.observe
    || scene.investigateItems !== undefined
    || scene.actionItems !== undefined
    || actionOutcome
    || localObserve
  )) {
    return {
      ...scene,
      ...(localObserve ? { observe: localObserve } : {}),
      ...(actionOutcome ? { actionOutcome } : {}),
    };
  }
  return null;
}
