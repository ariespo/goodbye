import type { Scene } from '../sillytavern/types';

/**
 * Turn data is committed before playback, but identity/profile changes must not
 * become visible before their evidence line has been read. This projection only
 * delays presentation; it never rolls back the persisted transaction.
 */
export function projectKnowledgeForPlayback(
  variables: Record<string, unknown>,
  scene: Scene | null,
  currentLineIndex: number,
  sceneComplete: boolean,
): Record<string, unknown> {
  if (!scene?.knowledgeAlreadyCommitted || !Array.isArray(variables.knowledgeEvents)) return variables;
  const firstPendingLine = currentLineIndex + (sceneComplete ? 1 : 0);
  const pendingEvents = new Set(
    scene.lines.slice(firstPendingLine).flatMap(line => line.knowledgeEvents ?? []),
  );
  if (pendingEvents.size === 0) return variables;
  return {
    ...variables,
    knowledgeEvents: variables.knowledgeEvents.filter((eventId: unknown) => (
      typeof eventId !== 'string' || !pendingEvents.has(eventId)
    )),
  };
}
