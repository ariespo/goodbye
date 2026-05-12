import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { Eye, MagnifyingGlass, ArrowRight, MapTrifold, Gear, Books, SlidersHorizontal, ClockClockwise } from '@phosphor-icons/react';

const gameActions = [
  { id: 'observe', icon: Eye, label: '观察' },
  { id: 'investigate', icon: MagnifyingGlass, label: '调查' },
  { id: 'actions', icon: ArrowRight, label: '行动' },
  { id: 'map', icon: MapTrifold, label: '地图' },
] as const;

type ToolId = 'history' | 'lorebook' | 'preset' | 'settings';

const tools: Array<{ id: ToolId; icon: typeof Eye; label: string }> = [
  { id: 'history', icon: ClockClockwise, label: '历史' },
  { id: 'lorebook', icon: Books, label: '世界书' },
  { id: 'preset', icon: SlidersHorizontal, label: '预设' },
  { id: 'settings', icon: Gear, label: '设置' },
];

export function ActionBar() {
  const [hovered, setHovered] = useState<string | null>(null);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const { performAction } = useGameLoop();

  const renderButton = (id: string, Icon: typeof Eye, label: string, onClick: () => void) => {
    const isHovered = hovered === id;
    return (
      <div key={id} className="relative">
        <button
          className={`w-10 h-10 flex items-center justify-center border transition-all duration-200 ${
            isHovered
              ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
              : 'border-border-subtle text-text-muted hover:border-accent-blue hover:bg-accent-blue/10 hover:text-accent-blue'
          }`}
          onMouseEnter={() => setHovered(id)}
          onMouseLeave={() => setHovered(null)}
          onClick={onClick}
        >
          <Icon size={20} />
        </button>

        {isHovered && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-bg-secondary border border-border-subtle text-xs text-text-muted whitespace-nowrap animate-[fadeIn_0.08s_ease-out]">
            {label}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="absolute bottom-[6%] left-[5%] flex gap-2 z-20">
      {gameActions.map(action =>
        renderButton(action.id, action.icon, action.label, () => {
          if (action.id === 'map') toggleModal('map');
          else performAction(action.id);
        })
      )}

      <div className="w-px h-10 bg-border-subtle mx-1" />

      {tools.map(tool =>
        renderButton(tool.id, tool.icon, tool.label, () => toggleModal(tool.id))
      )}
    </div>
  );
}
