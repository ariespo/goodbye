import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { Eye, MagnifyingGlass, ArrowRight, MapTrifold, Gear } from '@phosphor-icons/react';

const actions = [
  { id: 'observe', icon: Eye, label: '观察' },
  { id: 'investigate', icon: MagnifyingGlass, label: '调查' },
  { id: 'actions', icon: ArrowRight, label: '行动' },
  { id: 'map', icon: MapTrifold, label: '地图' },
];

export function ActionBar() {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const { performAction } = useGameLoop();

  return (
    <div className="absolute bottom-[6%] left-[5%] flex gap-2 z-20">
      {actions.map((action) => {
        const Icon = action.icon;
        const isHovered = hoveredAction === action.id;

        return (
          <div key={action.id} className="relative">
            <button
              className={`w-10 h-10 flex items-center justify-center border transition-all duration-200 ${
                isHovered
                  ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                  : 'border-border-subtle text-text-muted hover:border-accent-blue hover:bg-accent-blue/10 hover:text-accent-blue'
              }`}
              onMouseEnter={() => setHoveredAction(action.id)}
              onMouseLeave={() => setHoveredAction(null)}
              onClick={() => {
                if (action.id === 'map') {
                  toggleModal('map');
                } else {
                  performAction(action.id);
                }
              }}
            >
              <Icon size={20} />
            </button>

            {isHovered && (
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-bg-secondary border border-border-subtle text-xs text-text-muted whitespace-nowrap animate-[fadeIn_0.08s_ease-out]">
                {action.label}
              </div>
            )}
          </div>
        );
      })}

      <div className="w-px h-10 bg-border-subtle mx-1" />

      <div className="relative">
        <button
          className={`w-10 h-10 flex items-center justify-center border transition-all duration-200 ${
            hoveredAction === 'settings'
              ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
              : 'border-border-subtle text-text-muted hover:border-accent-blue hover:bg-accent-blue/10 hover:text-accent-blue'
          }`}
          onMouseEnter={() => setHoveredAction('settings')}
          onMouseLeave={() => setHoveredAction(null)}
          onClick={() => toggleModal('settings')}
        >
          <Gear size={20} />
        </button>

        {hoveredAction === 'settings' && (
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-bg-secondary border border-border-subtle text-xs text-text-muted whitespace-nowrap animate-[fadeIn_0.08s_ease-out]">
            设置
          </div>
        )}
      </div>
    </div>
  );
}
