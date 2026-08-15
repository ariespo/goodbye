import { useEffect, useMemo, useRef, useState } from 'react';

import { getKnowledgeVisualUpdates, type KnowledgeVisualUpdate } from '../../data/playerKnowledge';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { resolveCharacterSprite } from '../../utils/characterAssets';
import { projectKnowledgeForPlayback } from '../../utils/knowledgePresentation';
import { GameIcon } from '../ui/GameIcon';

export function KnowledgeUpdateOverlay() {
  const variables = useGameStore(state => state.tavern.variables);
  const currentScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const presentedVariables = useMemo(() => projectKnowledgeForPlayback(
    variables,
    currentScene,
    currentLineIndex,
    sceneComplete,
  ), [variables, currentScene, currentLineIndex, sceneComplete]);
  const previousVariablesRef = useRef(presentedVariables);
  const [queue, setQueue] = useState<KnowledgeVisualUpdate[]>([]);
  const active = queue[0] ?? null;

  useEffect(() => {
    const previous = previousVariablesRef.current;
    previousVariablesRef.current = presentedVariables;
    const updates = getKnowledgeVisualUpdates(previous, presentedVariables);
    if (updates.length > 0) setQueue(current => [...current, ...updates]);
  }, [presentedVariables]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setQueue(current => current.slice(1)), 4200);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;
  const isCharacter = active.target === 'characters';

  return (
    <button
      type="button"
      className="knowledge-update"
      data-kind={active.kind}
      aria-live="polite"
      onClick={() => {
        setQueue(current => current.slice(1));
        toggleModal(active.target);
      }}
    >
      <span className="knowledge-update__visual">
        {active.portrait ? (
          <img src={assetUrl(`assets/characters/${resolveCharacterSprite(active.portrait)}`)} alt="" />
        ) : (
          <GameIcon name="map" size={28} />
        )}
      </span>
      <span className="knowledge-update__copy">
        <small>{active.eyebrow}</small>
        <strong>{active.title}</strong>
        <span>{active.description}</span>
        <em>点击查看{isCharacter ? '人物简介' : '地图'}</em>
      </span>
      <span className="knowledge-update__scan" aria-hidden="true" />
    </button>
  );
}
