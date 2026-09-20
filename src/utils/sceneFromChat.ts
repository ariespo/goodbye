import { OPENING_MAINTEXT, OPENING_STORYLINE, parseOpeningStoryline } from '../engine/opening-storyline';
import { maintextToScene } from '../engine/scene-parser';
import type { ChatMessage, ChatSession, Scene } from '../sillytavern/types';
import { normalizeKnowledgeEvents } from '../data/playerKnowledge';
import { isRecord } from '../sillytavern/vars-merger';
import { acceptedActionUiFromMessage } from './actionPresentation';

/** Restore presentation gates from the accepted turn ledger, never raw recognition commands alone. */
export function restorePersistedScene(message: ChatMessage, messages: readonly ChatMessage[]): Scene | null {
  const maintext = message.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim();
  if (!maintext) return null;
  if (maintext === OPENING_STORYLINE || maintext === OPENING_MAINTEXT) return parseOpeningStoryline();
  const index = messages.findIndex(candidate => candidate.id === message.id);
  const previous = index > 0 ? messages[index - 1] : undefined;
  const beforeVariables = previous?.role === 'user'
    ? previous.turnState?.variables ?? previous.variables : previous?.variables;
  const events = message.variables?.worldMemory?.events;
  const commit = Array.isArray(events) ? events.find(event => isRecord(event)
    && event.eventId === `turn:${message.id}` && event.turnId === message.id
    && event.kind === 'narrative-turn' && event.cycleCount === Number(message.variables?.cycleCount ?? 1)) : undefined;
  const knownEvents = new Set<string>(normalizeKnowledgeEvents(message.variables?.knowledgeEvents));
  const previousEvents = beforeVariables ? new Set<string>(normalizeKnowledgeEvents(beforeVariables.knowledgeEvents)) : new Set<string>();
  const committedEvents = isRecord(commit) && Array.isArray(commit.tags)
    ? commit.tags.filter((event): event is string => typeof event === 'string'
      && knownEvents.has(event) && !previousEvents.has(event)) : [];
  const scene = maintextToScene(maintext, { authorizedKnowledgeEvents: committedEvents,
    // Post-turn variables must not grant an earlier line a new emotion permission.
    variables: beforeVariables ?? {} });
  if (!isRecord(commit)) return scene;
  const evidenceIndexes = new Set((Array.isArray(commit.evidenceLineIds) ? commit.evidenceLineIds : [])
    .flatMap(id => {
      const match = typeof id === 'string' ? /:line:(\d+)$/u.exec(id) : null;
      const lineIndex = match ? Number(match[1]) : -1;
      return Number.isSafeInteger(lineIndex) && lineIndex >= 0 && lineIndex < scene.lines.length ? [lineIndex] : [];
    }));
  const recovered = new Set<string>();
  for (const [lineIndex, line] of scene.lines.entries()) {
    if (!evidenceIndexes.has(lineIndex)) delete line.knowledgeEvents;
    for (const event of line.knowledgeEvents ?? []) recovered.add(event);
  }
  // Program fallbacks can attach accepted knowledge without leaving a raw command.
  // Its exact per-event mapping was not saved in older ledgers; delay it until the
  // last attested evidence line instead of exposing a name before its introduction.
  const fallbackIndex = Math.max(-1, ...evidenceIndexes);
  if (fallbackIndex >= 0) {
    const fallbackLine = scene.lines[fallbackIndex];
    fallbackLine.knowledgeEvents = [...new Set([...(fallbackLine.knowledgeEvents ?? []),
      ...committedEvents.filter(event => !recovered.has(event))])];
  }
  return { ...scene, knowledgeAlreadyCommitted: true };
}

/**
 * 从会话最后一条 assistant 消息重建可交互场景。
 * 仅当提取的场景含交互数据(observe/investigate/action)时返回，否则返回 null。
 */
export function rebuildSceneFromChat(chat: ChatSession | null | undefined): Scene | null {
  if (!chat || chat.messages.length === 0) return null;
  const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return null;
  const scene = restorePersistedScene(lastAssistant, chat.messages);
  if (!scene) return null;
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
      sourceMessageId: lastAssistant.id,
      ...(localObserve ? { observe: localObserve } : {}),
      ...(actionOutcome ? { actionOutcome } : {}),
    };
  }
  return null;
}
