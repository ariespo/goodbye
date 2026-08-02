import {
  chooseConclusion,
  lockConclusionRoute,
  selectConclusionOverlay,
  type ConclusionChoiceId,
  type ConclusionDecision,
  type ConclusionOverlayId,
  type ConclusionRouteId,
  type ConclusionVariables,
  type FinalConclusionDecision,
} from '../engine/conclusion-system';
import { variablesToEndingContext } from '../sillytavern/vars-merger';
import { useGameStore } from '../stores/gameStore';
import { persistActiveChat } from './chatPersistence';

function commitVariables(variables: ConclusionVariables, endingId?: string): void {
  useGameStore.setState(state => ({
    tavern: {
      ...state.tavern,
      variables,
    },
    game: {
      ...state.game,
      autoMode: endingId ? false : state.game.autoMode,
      endingCheckContext: variablesToEndingContext(
        variables,
        state.game.endingsSeen,
      ) as typeof state.game.endingCheckContext,
      endingPanel: endingId
        ? {
            ...state.game.endingPanel,
            isPreview: false,
            pendingEndingId: endingId,
          }
        : state.game.endingPanel,
      pendingCycleReset: endingId ? null : state.game.pendingCycleReset,
    },
    ui: endingId
      ? { ...state.ui, showConclusion: false }
      : state.ui,
  }));
}

async function persistDecision<T extends ConclusionDecision>(decision: T, endingId?: string): Promise<T> {
  if (!decision.accepted) return decision;
  commitVariables(decision.value, endingId);
  await persistActiveChat({ variables: decision.value });
  return decision;
}

export async function lockProgramConclusion(route: ConclusionRouteId): Promise<ConclusionDecision> {
  const variables = useGameStore.getState().tavern.variables;
  return persistDecision(lockConclusionRoute(variables, route));
}

export async function selectProgramConclusionOverlay(
  overlay: ConclusionOverlayId | null,
): Promise<ConclusionDecision> {
  const variables = useGameStore.getState().tavern.variables;
  return persistDecision(selectConclusionOverlay(variables, overlay));
}

export async function commitProgramConclusion(
  choiceId: ConclusionChoiceId,
): Promise<FinalConclusionDecision> {
  const state = useGameStore.getState();
  if (!state.game.sceneComplete || state.game.isWaitingForAI || state.game.endingPanel.visible) {
    return {
      accepted: false,
      value: state.tavern.variables,
      reason: '当前演出尚未结束，暂时不能作出最终选择。',
    };
  }
  const decision = chooseConclusion(state.tavern.variables, choiceId);
  return persistDecision(decision, decision.endingId);
}
