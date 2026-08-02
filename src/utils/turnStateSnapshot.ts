import type {
  ChatMessage,
  CurrentState,
  GameStatus,
  Scene,
} from '../sillytavern/types';

export type TurnStateSnapshot = NonNullable<ChatMessage['turnState']>;

export interface TurnStateSource {
  gameStatus: GameStatus;
  currentState: CurrentState;
  currentScene: Scene | null;
  currentLineIndex: number;
  sceneComplete: boolean;
  variables: Record<string, any>;
}

function cloneStatus(status: GameStatus): GameStatus {
  return {
    ...status,
    time: new Date(status.time),
    items: [...status.items],
  };
}

function cloneScene(scene: Scene | null): Scene | null {
  if (!scene) return null;
  return {
    ...scene,
    lines: scene.lines.map(line => ({
      ...line,
      knowledgeEvents: line.knowledgeEvents ? [...line.knowledgeEvents] : undefined,
    })),
    investigateItems: scene.investigateItems?.map(item => ({ ...item })),
    actionItems: scene.actionItems?.map(item => ({ ...item })),
  };
}

export function captureTurnState(source: TurnStateSource): TurnStateSnapshot {
  return {
    gameStatus: cloneStatus(source.gameStatus),
    currentState: { ...source.currentState },
    currentScene: cloneScene(source.currentScene),
    currentLineIndex: source.currentLineIndex,
    sceneComplete: source.sceneComplete,
    variables: { ...source.variables },
  };
}

/**
 * 新消息使用精确快照；旧存档没有快照时，从消息变量恢复关键数值，
 * 场景和演出状态使用调用方提供的聊天重建结果。
 */
export function resolveTurnRollback(
  message: ChatMessage,
  fallback: TurnStateSource,
): TurnStateSnapshot {
  if (message.turnState) return captureTurnState(message.turnState);

  const variables = message.variables && Object.keys(message.variables).length > 0
    ? message.variables
    : fallback.variables;
  const parsedTime = typeof variables.time === 'string' ? new Date(variables.time) : fallback.gameStatus.time;
  return captureTurnState({
    ...fallback,
    variables,
    gameStatus: {
      ...fallback.gameStatus,
      time: Number.isNaN(parsedTime.getTime()) ? fallback.gameStatus.time : parsedTime,
      stamina: Number.isFinite(Number(variables.stamina))
        ? Number(variables.stamina)
        : fallback.gameStatus.stamina,
      sanity: Number.isFinite(Number(variables.sanity))
        ? Number(variables.sanity)
        : fallback.gameStatus.sanity,
    },
  });
}
