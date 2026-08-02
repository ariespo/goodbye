import {
  addKnowledgeEvent,
  buildPlayerKnowledgeBrief,
  isAllowedKnowledgeDiscovery,
  type PlayerKnowledgeEvent,
} from '../data/playerKnowledge';
import { useGameStore } from '../stores/gameStore';
import { persistActiveChat } from './chatPersistence';

/**
 * 提交台词行携带的知识事件(经审查授权后写入变量并持久化)。
 * committedKeys 用于跨行去重，由调用方持有(通常是组件级 ref)。
 */
export function commitKnowledgeEvents(
  events: string[],
  lineKey: string,
  committedKeys: Set<string>,
): void {
  if (events.length === 0) return;
  const state = useGameStore.getState();
  let nextVariables = state.tavern.variables;
  let changed = false;
  for (const eventId of events) {
    const commitKey = `${lineKey}:${eventId}`;
    if (committedKeys.has(commitKey)) continue;
    committedKeys.add(commitKey);
    if (!isAllowedKnowledgeDiscovery(buildPlayerKnowledgeBrief(nextVariables), eventId)) continue;
    nextVariables = {
      ...nextVariables,
      knowledgeEvents: addKnowledgeEvent(nextVariables.knowledgeEvents, eventId as PlayerKnowledgeEvent),
    };
    changed = true;
  }
  if (!changed) return;
  state.actions.setVariables(nextVariables);
  void persistActiveChat({ variables: nextVariables });
}
