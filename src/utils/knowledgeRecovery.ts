import { applyActionNarrativeKnowledgeFallback, resolveActionNarrativeContext } from '../engine/action-narrative-context';
import { maintextToScene } from '../engine/scene-parser';
import { addKnowledgeEvent, normalizeKnowledgeEvents } from '../data/playerKnowledge';
import type { ChatSession } from '../sillytavern/types';

const HUIHUI_MEETING_EVENT = 'meet:chen-huihui';

/** 修复旧存档中“正文已经认出陈慧慧，但认知指令未落盘”的确定性状态缺口。 */
export function recoverNarrativeKnowledge(chat: ChatSession): ChatSession {
  const existingEvents = normalizeKnowledgeEvents(chat.variables?.knowledgeEvents, chat.variables?.unlockedClues);
  if (existingEvents.includes(HUIHUI_MEETING_EVENT)) return chat;

  const context = resolveActionNarrativeContext('去便利店', new Date(0), 10, {
    currentLocationId: 'home',
    enRouteEncounterRoll: 1,
    knowledgeEvents: existingEvents,
  });
  if (!context) return chat;

  const wasPresented = chat.messages.some(message => {
    if (message.role !== 'assistant') return false;
    const maintext = message.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim();
    if (!maintext) return false;
    const scene = applyActionNarrativeKnowledgeFallback(
      context,
      maintextToScene(maintext, {
        authorizedKnowledgeEvents: [HUIHUI_MEETING_EVENT],
        variables: { ...chat.variables, location: 'supermarket' },
      }),
    );
    return scene.lines.some(line => line.knowledgeEvents?.includes(HUIHUI_MEETING_EVENT));
  });
  if (!wasPresented) return chat;

  return {
    ...chat,
    variables: {
      ...chat.variables,
      knowledgeEvents: addKnowledgeEvent(existingEvents, HUIHUI_MEETING_EVENT),
    },
  };
}
