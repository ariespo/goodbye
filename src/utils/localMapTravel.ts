import { getLocationBackground, getLocationById } from '../data/locations';
import { getCurrentLocationPresentation, getVisibleLocationPresentations } from '../data/playerKnowledge';
import { saveChat } from '../sillytavern/database';
import type { ChatMessage, ParsedContent, Scene } from '../sillytavern/types';
import { useGameStore } from '../stores/gameStore';
import { commitGameTransaction } from './gameTransactionStore';
import { buildMapTravelTransaction, prepareMapTravel } from './mapTravel';
import { resolveSceneEnvironment } from './sceneEnvironment';
import { captureTurnState } from './turnStateSnapshot';

export interface LocalMapContinuationResult {
  arrived: boolean;
  destinationName: string;
  executedMinutes: number;
  remainingMinutes: number;
  staminaDelta: number;
}

/** Resumes a map-created continuation through the same deterministic travel authority, without a model turn. */
export async function resumeLocalMapTravelContinuation(
  continuationId: string,
): Promise<LocalMapContinuationResult> {
  const state = useGameStore.getState();
  const continuation = state.tavern.variables.actionContinuity?.continuation;
  if (!continuation || continuation.actionId !== continuationId || !continuationId.startsWith('map-travel:')) {
    throw new Error('地图行程已经失效');
  }
  const destinationLocationId = [...continuation.steps].reverse().find(step => step.kind === 'travel')?.locationId;
  const destination = destinationLocationId ? getLocationById(destinationLocationId) : undefined;
  const destinationPresentation = getVisibleLocationPresentations(state.tavern.variables)
    .find(location => location.id === destinationLocationId);
  if (!destinationLocationId || !destination || !destinationPresentation?.canTravel) {
    throw new Error('地图目的地已经失效');
  }
  const activeChat = state.tavern.chats.find(chat => chat.id === state.tavern.activeChatId);
  if (!activeChat) throw new Error('未找到当前会话，无法保存移动结果');

  const captured = {
    activeChatId: state.tavern.activeChatId,
    cycleCount: Number(state.tavern.variables.cycleCount ?? 1),
    location: state.tavern.variables.location,
    time: state.game.gameStatus.time.getTime(),
    stamina: state.game.gameStatus.stamina,
    sanity: state.game.gameStatus.sanity,
  };
  const isCurrent = () => {
    const current = useGameStore.getState();
    return current.tavern.activeChatId === captured.activeChatId
      && Number(current.tavern.variables.cycleCount ?? 1) === captured.cycleCount
      && current.tavern.variables.location === captured.location
      && current.game.gameStatus.time.getTime() === captured.time
      && current.game.gameStatus.stamina === captured.stamina
      && current.game.gameStatus.sanity === captured.sanity
      && current.tavern.variables.actionContinuity?.continuation?.actionId === continuationId;
  };
  const prepared = prepareMapTravel({
    variables: state.tavern.variables,
    gameStatus: state.game.gameStatus,
    destinationLocationId,
  });
  if (prepared.kind !== 'travel' || prepared.actionId !== continuationId) {
    throw new Error('既定事件需要先处理，暂时不能继续移动');
  }
  const transaction = buildMapTravelTransaction({
    variables: state.tavern.variables,
    gameStatus: state.game.gameStatus,
    prepared,
    knowledgeEvents: state.tavern.variables.knowledgeEvents,
    endings: state.game.endings,
    endingsSeen: state.game.endingsSeen,
    hasEndingInProgress: state.game.endingPanel.visible || !!state.game.endingPanel.pendingEndingId,
  });
  const arrived = prepared.outcome.endLocationId === destinationLocationId;
  const nextTime = transaction.gameStatus.time;
  const nextBackground = arrived ? getLocationBackground(destination, nextTime) : 'street';
  const remainingMinutes = prepared.publicOutcome.remaining?.totalMinutes ?? 0;
  const staminaDelta = prepared.publicOutcome.staminaDelta;
  const resultText = arrived
    ? `你冒雨抵达${destinationPresentation.name}。路上用了${prepared.publicOutcome.executedTravelMinutes}分钟，体力${staminaDelta < 0 ? `下降${-staminaDelta}` : `变化${staminaDelta}`}点。`
    : `你朝${destinationPresentation.name}行进了${prepared.publicOutcome.executedTravelMinutes}分钟，但既定时间点已经到来，路程尚未完成。剩余约${remainingMinutes}分钟。`;
  const mapMaintext = `场景|${nextBackground}\n对话|旁白|calm|${resultText}`;
  const originPresentation = getCurrentLocationPresentation(state.tavern.variables);
  const summary = arrived
    ? `从${originPresentation.name}移动到${destinationPresentation.name}`
    : `前往${destinationPresentation.name}，已行进${prepared.publicOutcome.executedTravelMinutes}分钟`;
  const parsed: ParsedContent = {
    thinking: '', maintext: mapMaintext, options: arrived ? [] : ['处理眼前的事情'], summary, vars: {},
    observe: arrived ? destinationPresentation.description : undefined,
    investigateItems: [], actionItems: [], actionOutcome: prepared.publicOutcome, optionBindings: undefined,
  };
  const scene: Scene = {
    id: `travel-${prepared.outcome.id}`,
    lines: [{ background: nextBackground, speaker: '旁白', emotion: 'calm', text: resultText }],
    ...(arrived ? { observe: destinationPresentation.description } : {}),
    actionOutcome: prepared.publicOutcome,
  };
  const localRequest: ChatMessage = {
    id: crypto.randomUUID(), role: 'user', content: `继续前往${destinationPresentation.name}`,
    timestamp: Date.now(), variables: { ...state.tavern.variables }, localAction: 'map-travel',
    actionRequest: {
      inputOrigin: 'menu', originalInput: `继续前往${destinationPresentation.name}`,
      selection: { actionId: prepared.actionId, kind: 'travel', scope: 'short', locationId: destinationLocationId },
    },
    turnState: captureTurnState({
      gameStatus: state.game.gameStatus, currentState: state.game.currentState,
      currentScene: state.game.currentScene, currentLineIndex: state.game.currentLineIndex,
      sceneComplete: state.game.sceneComplete, variables: state.tavern.variables,
    }),
  };
  const acceptedMessage: ChatMessage = {
    id: `map-${prepared.outcome.id}`, role: 'assistant',
    content: `<maintext>\n${mapMaintext}\n</maintext><option>${parsed.options.join('\n')}</option><sum>${summary}</sum><vars>{}</vars>`,
    timestamp: Date.now(), variables: transaction.variables, localAction: 'map-travel',
    acceptedActionOutcome: prepared.publicOutcome, parsed,
  };
  const updatedChat = {
    ...activeChat,
    messages: [...activeChat.messages, localRequest, acceptedMessage],
    variables: transaction.variables,
    updatedAt: Date.now(),
  };
  const persistenceAbort = new AbortController();
  await saveChat(updatedChat, {
    signal: persistenceAbort.signal,
    assertCurrent: () => {
      if (!isCurrent()) throw new Error('地图状态已经变化，本次移动结果未提交');
    },
  });
  if (!isCurrent()) throw new Error('地图状态已经变化，本次移动结果未提交');

  const actions = useGameStore.getState().actions;
  commitGameTransaction(transaction, scene);
  actions.setParsedContent(parsed);
  actions.clearTurnRecovery();
  actions.setCurrentState({
    background: nextBackground, character: null, speaker: '旁白', mood: 'calm', effect: null, item: null,
    environment: resolveSceneEnvironment(nextBackground),
  });
  actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
  actions.addHistorySnapshot({
    turnIndex: state.game.history.length,
    timestamp: Date.now(),
    summary,
    gameStatus: transaction.gameStatus,
    variables: transaction.variables,
  });
  actions.setChats(state.tavern.chats.map(chat => chat.id === updatedChat.id ? updatedChat : chat));

  return {
    arrived,
    destinationName: destinationPresentation.name,
    executedMinutes: prepared.outcome.executedMinutes,
    remainingMinutes,
    staminaDelta,
  };
}
