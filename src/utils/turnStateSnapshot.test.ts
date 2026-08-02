import { describe, expect, it } from 'vitest';
import type { ChatMessage, CurrentState, GameStatus, Scene } from '../sillytavern/types';
import { captureTurnState, resolveTurnRollback } from './turnStateSnapshot';

const status: GameStatus = {
  time: new Date('2024-09-09T12:00:00'),
  stamina: 80,
  sanity: 70,
  items: ['umbrella'],
};
const currentState: CurrentState = {
  bgm: null,
  background: 'school',
  character: null,
  speaker: '旁白',
  mood: 'calm',
  effect: null,
  environment: 'indoor-audible-rain',
  item: null,
};
const scene: Scene = {
  id: 'before-turn',
  lines: [{ speaker: '旁白', text: '回合开始前' }],
};

describe('turn state snapshot', () => {
  it('捕获独立的回合前状态副本', () => {
    const snapshot = captureTurnState({
      gameStatus: status,
      currentState,
      currentScene: scene,
      currentLineIndex: 0,
      sceneComplete: true,
      variables: { time: '2024-09-09T12:00:00', stamina: 80 },
    });

    status.items.push('mutated');
    scene.lines[0].text = 'mutated';
    expect(snapshot.gameStatus.items).toEqual(['umbrella']);
    expect(snapshot.currentScene?.lines[0].text).toBe('回合开始前');
    status.items.pop();
    scene.lines[0].text = '回合开始前';
  });

  it('优先使用消息携带的精确快照恢复重roll状态', () => {
    const exact = captureTurnState({
      gameStatus: { ...status, stamina: 55 },
      currentState,
      currentScene: scene,
      currentLineIndex: 0,
      sceneComplete: true,
      variables: { stamina: 55, time: '2024-09-09T12:00:00' },
    });
    const message: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: '调查',
      timestamp: 1,
      variables: { stamina: 99 },
      turnState: exact,
    };

    const restored = resolveTurnRollback(message, {
      gameStatus: { ...status, stamina: 10 },
      currentState,
      currentScene: null,
      currentLineIndex: 0,
      sceneComplete: false,
      variables: { stamina: 10 },
    });
    expect(restored.gameStatus.stamina).toBe(55);
    expect(restored.variables.stamina).toBe(55);
    expect(restored.currentScene?.id).toBe('before-turn');
  });

  it('兼容旧消息并从其变量恢复时间、体力和理智', () => {
    const legacy: ChatMessage = {
      id: 'legacy-user',
      role: 'user',
      content: '旧回合',
      timestamp: 1,
      variables: {
        time: '2024-09-09T15:20:00',
        stamina: 42,
        sanity: 31,
      },
    };

    const restored = resolveTurnRollback(legacy, {
      gameStatus: status,
      currentState,
      currentScene: scene,
      currentLineIndex: 0,
      sceneComplete: true,
      variables: {},
    });
    expect(restored.gameStatus.time.getHours()).toBe(15);
    expect(restored.gameStatus.time.getMinutes()).toBe(20);
    expect(restored.gameStatus.stamina).toBe(42);
    expect(restored.gameStatus.sanity).toBe(31);
  });
});
