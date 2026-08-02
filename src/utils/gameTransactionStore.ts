import { variablesToEndingContext } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import type { GameTransactionResult } from '../engine/game-transaction';

/** 将纯事务结果一次性提交到 Zustand，避免变量、状态和触发器短暂失配。 */
export function commitGameTransaction(result: GameTransactionResult): void {
  useGameStore.setState(state => ({
    tavern: {
      ...state.tavern,
      variables: result.variables,
    },
    game: {
      ...state.game,
      gameStatus: result.gameStatus,
      endingCheckContext: variablesToEndingContext(
        result.variables,
        state.game.endingsSeen,
      ) as typeof state.game.endingCheckContext,
      endingPanel: result.ending
        ? {
            ...state.game.endingPanel,
            isPreview: false,
            pendingEndingId: result.ending.id,
          }
        : state.game.endingPanel,
      pendingCycleReset: result.ending
        ? null
        : result.failure ?? state.game.pendingCycleReset,
    },
  }));
}
