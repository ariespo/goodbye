import { describe, expect, it } from 'vitest';
import type { GameStatus } from '../sillytavern/types';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { settleGameTransaction } from './game-transaction';

function status(overrides: Partial<GameStatus> = {}): GameStatus {
  return {
    time: new Date('2024-09-09T15:50:00'),
    stamina: 100,
    sanity: 80,
    items: [],
    ...overrides,
  };
}

describe('settleGameTransaction', () => {
  it('在一次事务中应用状态补丁、行动成本和时间推进', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), time: '2024-09-09T10:00:00' },
      gameStatus: status({ time: new Date('2024-09-09T10:00:00') }),
      variablePatch: { suspicion: { 'old-man': 12 }, sanity: 75 },
      costs: { timeMinutes: 30, stamina: 8, sanity: 3 },
    });

    expect(result.variables.suspicion['old-man']).toBe(12);
    expect(result.gameStatus.stamina).toBe(92);
    expect(result.gameStatus.sanity).toBe(72);
    expect(result.variables.time).toBe('2024-09-09T10:30:00');
  });

  it('本地移动跨过16点也会触发死讯事件', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), time: '2024-09-09T15:50:00' },
      gameStatus: status(),
      variablePatch: { location: 'school' },
      costs: { timeMinutes: 20, stamina: 5 },
    });

    expect(result.variables.location).toBe('school');
    expect(result.variables.deathNews).toBe('pending');
    expect(result.scheduledEventPatch).toEqual({ deathNews: 'pending' });
  });

  it('本地行动耗尽体力时安排轮回失败', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), stamina: 4, time: '2024-09-09T12:00:00' },
      gameStatus: status({ time: new Date('2024-09-09T12:00:00'), stamina: 4 }),
      costs: { timeMinutes: 5, stamina: 5 },
    });

    expect(result.gameStatus.stamina).toBe(0);
    expect(result.failure).toBe('stamina');
  });

  it('跨过午夜时安排日终轮回', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), time: '2024-09-09T23:50:00' },
      gameStatus: status({ time: new Date('2024-09-09T23:50:00') }),
      costs: { timeMinutes: 20 },
    });

    expect(result.variables.time).toBe('2024-09-10T00:10:00');
    expect(result.failure).toBe('day-end');
  });

  it('成功处理待送达死讯后标记 delivered', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), deathNews: 'pending', time: '2024-09-09T16:10:00' },
      gameStatus: status({ time: new Date('2024-09-09T16:10:00') }),
      costs: { timeMinutes: 10 },
      deliverPendingDeathNews: true,
    });

    expect(result.variables.deathNews).toBe('delivered');
  });
});
