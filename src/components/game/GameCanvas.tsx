import { lazy, Suspense, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { BackgroundLayer } from './BackgroundLayer';
import { DialogueBox } from './DialogueBox';
import { ChoiceMenu } from './ChoiceMenu';
import { StatusPanel } from './StatusPanel';
import { ActionBar } from './ActionBar';
import { MoodOverlay } from './MoodOverlay';
import { MapModal } from './MapModal';
import { ActionPanel } from './ActionPanel';
import { ClueModal } from './ClueModal';
import { EndingPlayer } from './EndingPlayer';
import { CycleResetWatcher } from './CycleResetWatcher';
import { RainOverlay } from './RainOverlay';
import { EffectOverlay } from './EffectOverlay';
import { ItemCallout } from './ItemCallout';
import { GameplayGuide } from './GameplayGuide';
import { ClueDiscoveryOverlay } from './ClueDiscoveryOverlay';
import { InvestigationHotspots } from './InvestigationHotspots';
import { CharacterProfileModal } from './CharacterProfileModal';
import { ApiGuideCard } from './ApiGuideCard';
import { KnowledgeUpdateOverlay } from './KnowledgeUpdateOverlay';
import { CharacterSprite } from './CharacterSprite';
import { ConclusionModal } from './ConclusionModal';
import { LoadingOverlay } from '../system/LoadingOverlay';
import { HudViewport } from './HudViewport';
import { parseOpeningStoryline } from '../../engine/opening-storyline';
import { rebuildSceneFromChat } from '../../utils/sceneFromChat';

const EndingEditor = lazy(() => import('./EndingEditor')
  .then(module => ({ default: module.EndingEditor })));

export function GameCanvas() {
  const mood = useGameStore(state => state.game.currentState.mood);
  const currentScene = useGameStore(state => state.game.currentScene);
  const activeChat = useGameStore(state => {
    const chats = state.tavern.chats;
    return chats.find(c => c.id === state.tavern.activeChatId) || null;
  });
  const actions = useGameStore(state => state.actions);
  const showEndingEditor = useGameStore(state => state.ui.showEndingEditor);

  // Fallback: 如果 currentScene 为 null 但 activeChat 有 assistant 消息,
  // 自动从最后一条 assistant message 重建 scene(解决刷新页面后 scene 丢失)
  useEffect(() => {
    if (currentScene) return;
    // 最终后备: 开场剧情确保用户永远能开始游戏
    actions.setCurrentScene(rebuildSceneFromChat(activeChat) ?? parseOpeningStoryline());
  }, [currentScene, activeChat, actions]);

  // GalGame 惯例：点击舞台空白处（背景/立绘）也能推进对话，DialogueBox 监听该事件
  const handleStageClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest?.('[data-stage-layer]')) return;
    window.dispatchEvent(new CustomEvent('farewell:advance-dialogue'));
  };

  return (
    <div className="game-canvas relative w-full h-full overflow-hidden" data-mood={mood} onClick={handleStageClick}>
      <BackgroundLayer />
      <RainOverlay />
      <MoodOverlay />
      <EffectOverlay />
      <ItemCallout />

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
        }}
      />

      <InvestigationHotspots />
      <CharacterSprite />
      <ChoiceMenu />
      <CharacterProfileModal />
      <ConclusionModal />
      <EndingPlayer />
      <CycleResetWatcher />
      {showEndingEditor && <Suspense fallback={null}><EndingEditor /></Suspense>}
      <ClueDiscoveryOverlay />
      <KnowledgeUpdateOverlay />
      <GameplayGuide />
      <ApiGuideCard />
      <HudViewport>
        <DialogueBox />
        <StatusPanel />
        <ActionBar />
        <ActionPanel />
        <ClueModal />
        <MapModal />
      </HudViewport>
      <LoadingOverlay />
    </div>
  );
}
