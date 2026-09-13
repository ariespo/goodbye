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
      narrativeText: '警方告知：文穗已经死亡。请保持电话畅通。',
    });

    expect(result.variables.deathNews).toBe('delivered');
    expect(result.gameStatus.sanity).toBeLessThan(70);
  });

  it('does not deliver pending death news for a suspense phone call or parents death certificate', () => {
    const result = settleGameTransaction({
      variables: { ...createDefaultVariables(), deathNews: 'pending', time: '2024-09-09T16:15:00' },
      gameStatus: status({ time: new Date('2024-09-09T16:15:00') }),
      costs: { timeMinutes: 10 }, deliverPendingDeathNews: true,
      narrativeText: '派出所说，文穗的事需要当面说，没有在电话里说。带上她父母的死亡证明。',
    });
    expect(result.variables.deathNews).toBe('pending');
  });

  it('advances a committed narrative despite zero same-location travel cost, while local UI actions remain free', () => {
    const input = { variables: { ...createDefaultVariables(), time: '2024-09-09T16:20:00' },
      gameStatus: status({ time: new Date('2024-09-09T16:20:00') }), costs: { timeMinutes: 0 } };
    expect(settleGameTransaction({ ...input, narrativeTurn: true }).gameStatus.time.getTime())
      .toBeGreaterThan(input.gameStatus.time.getTime());
    expect(settleGameTransaction(input).gameStatus.time.getTime()).toBe(input.gameStatus.time.getTime());
  });
});
