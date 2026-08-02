import { describe, expect, it } from 'vitest';
import { IDLE_TURN_RECOVERY, useGameStore } from './gameStore';

describe('turnRecovery 状态', () => {
  it('初始为 idle', () => {
    expect(useGameStore.getState().api.turnRecovery).toEqual(IDLE_TURN_RECOVERY);
  });

  it('setTurnRecovery / clearTurnRecovery', () => {
    const { actions } = useGameStore.getState();
    actions.setTurnRecovery({ phase: 'failed_stream', userInput: '询问管家', errorMessage: '网络错误' });
    expect(useGameStore.getState().api.turnRecovery).toEqual({
      phase: 'failed_stream',
      userInput: '询问管家',
      errorMessage: '网络错误',
    });

    actions.setTurnRecovery({ phase: 'blocked_pipeline', userInput: '搜保险柜', errorMessage: '硬审查未通过' });
    expect(useGameStore.getState().api.turnRecovery.phase).toBe('blocked_pipeline');

    actions.clearTurnRecovery();
    expect(useGameStore.getState().api.turnRecovery).toEqual(IDLE_TURN_RECOVERY);
  });
});
