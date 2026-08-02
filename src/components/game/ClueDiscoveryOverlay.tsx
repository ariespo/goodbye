import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { OrganizedClue } from '../../sillytavern/types';
import { GameIcon } from '../ui/GameIcon';

export function ClueDiscoveryOverlay() {
  const clues = useGameStore(state => Array.isArray(state.tavern.variables.organizedClues)
    ? state.tavern.variables.organizedClues as OrganizedClue[]
    : []);
  const knownIds = useRef(new Set(clues.map(clue => clue.id)));
  const [activeClue, setActiveClue] = useState<OrganizedClue | null>(null);

  useEffect(() => {
    const added = clues.find(clue => !knownIds.current.has(clue.id));
    knownIds.current = new Set(clues.map(clue => clue.id));
    if (!added) return;
    setActiveClue(added);
    const timer = window.setTimeout(() => setActiveClue(null), 3400);
    return () => window.clearTimeout(timer);
  }, [clues]);

  if (!activeClue) return null;

  return (
    <aside className="clue-discovery" role="status" aria-live="polite">
      <span className="clue-discovery__signal"><GameIcon name="success" size={21} /></span>
      <span className="clue-discovery__content">
        <small>NEW CLUE / 新线索</small>
        <strong>{activeClue.title}</strong>
        <span>{activeClue.description}</span>
      </span>
      <span className="clue-discovery__scan" aria-hidden="true" />
    </aside>
  );
}
