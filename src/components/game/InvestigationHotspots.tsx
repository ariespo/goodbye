import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { GameIcon } from '../ui/GameIcon';

const POSITION_PRESETS: Array<Array<{ x: number; y: number }>> = [
  [{ x: 27, y: 40 }, { x: 67, y: 47 }, { x: 48, y: 29 }, { x: 78, y: 30 }],
  [{ x: 19, y: 48 }, { x: 56, y: 34 }, { x: 75, y: 52 }, { x: 39, y: 58 }],
  [{ x: 32, y: 31 }, { x: 72, y: 36 }, { x: 55, y: 55 }, { x: 18, y: 57 }],
];

function positionSet(background: string | null) {
  if (!background) return POSITION_PRESETS[0];
  const score = [...background].reduce((total, char) => total + char.charCodeAt(0), 0);
  return POSITION_PRESETS[score % POSITION_PRESETS.length];
}

export function InvestigationHotspots() {
  const scene = useGameStore(state => state.game.currentScene);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const waiting = useGameStore(state => state.game.isWaitingForAI);
  const actionPanelVisible = useGameStore(state => state.game.actionPanel.visible);
  const background = useGameStore(state => state.game.currentState.background);
  const ui = useGameStore(state => state.ui);
  const { performAction } = useGameLoop();
  const items = scene?.investigateItems ?? [];
  const modalOpen = ui.showSettings || ui.showLorebook || ui.showPreset || ui.showHistory || ui.showMap || ui.showClues || ui.showCharacters || ui.showEndingEditor;

  if (!sceneComplete || waiting || actionPanelVisible || modalOpen || items.length === 0) return null;
  const positions = positionSet(background);

  return (
    <div className="investigation-hotspots" aria-label="场景调查点">
      {items.slice(0, 4).map((item, index) => {
        const position = positions[index % positions.length];
        return (
          <button
            key={`${item.desc}-${index}`}
            type="button"
            className="investigation-hotspot"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            aria-label={`调查：${item.desc}`}
            onClick={() => performAction('investigate', index)}
          >
            <span className="investigation-hotspot__reticle"><GameIcon name="investigate" size={14} /></span>
            <span className="investigation-hotspot__label">{item.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
