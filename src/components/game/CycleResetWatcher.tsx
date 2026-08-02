import { useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { settleCycleVariables, startNextCycle, type CycleResetReason } from '../../utils/cycleLoop';

/** 场景播放完毕且无结局待播时执行轮回结算与重置。 */
export function CycleResetWatcher() {
  const pendingReset = useGameStore(state => state.game.pendingCycleReset);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const endingVisible = useGameStore(state => state.game.endingPanel.visible);
  const pendingEndingId = useGameStore(state => state.game.endingPanel.pendingEndingId);
  const isStreaming = useGameStore(state => state.api.isStreaming);

  useEffect(() => {
    if (!pendingReset || !sceneComplete || isStreaming || endingVisible || pendingEndingId) return;
    const state = useGameStore.getState();
    state.actions.setPendingCycleReset(null);
    const settled = settleCycleVariables(state.tavern.variables, { stayed: false });
    void startNextCycle({ variables: settled, reason: pendingReset as CycleResetReason });
  }, [pendingReset, sceneComplete, isStreaming, endingVisible, pendingEndingId]);

  return null;
}
