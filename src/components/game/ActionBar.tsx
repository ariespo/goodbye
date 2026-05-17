import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import {
  Eye, MagnifyingGlass, ArrowRight, MapTrifold,
  Gear, Books, SlidersHorizontal, ClockClockwise,
} from '@phosphor-icons/react';

const BORDER = '#3a3a42';
const BORDER_HOVER = '#6b8fc4';
const BG = 'rgba(12, 12, 16, 0.88)';
const TEXT_DIM = '#6a6560';
const ACCENT = '#6b8fc4';

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
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const currentScene = useGameStore(state => state.game.currentScene);
  const { performAction } = useGameLoop();

  const showGameActions = currentScene && sceneComplete;

  return (
    <div className="absolute bottom-[5%] left-4 flex items-center gap-2 z-30"
      style={{ paddingBottom: 2 }}
    >
      {/* 游戏动作组 — 只在场景播放完毕后显示 */}
      {showGameActions && (
        <>
          <div className="flex gap-2">
            {gameActions.map(a => (
              <PixelActionBtn
                key={a.id}
                icon={<a.icon size={27} />}
                label={a.label}
                onClick={() => a.id === 'map' ? toggleModal('map') : performAction(a.id)}
              />
            ))}
          </div>
          {/* 分隔线 */}
          <div style={{ width: 2, height: 32, background: BORDER, margin: '0 4px' }} />
        </>
      )}

      {/* 工具组 — 始终显示 */}
      <div className="flex gap-2">
        {tools.map(t => (
          <PixelActionBtn
            key={t.id}
            icon={<t.icon size={27} />}
            label={t.label}
            onClick={() => toggleModal(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 像素图标按钮 ── */

function PixelActionBtn({
  icon, label, onClick,
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = hovered ? 'rgba(107,143,196,0.12)' : BG;
  const border = hovered ? BORDER_HOVER : BORDER;
  const color = hovered ? ACCENT : TEXT_DIM;

  return (
    <div className="relative">
      <button
        className="w-10 h-10 flex items-center justify-center select-none cursor-none transition-all duration-150"
        style={{
          background: bg,
          border: `2px solid ${border}`,
          color,
          boxShadow: hovered
            ? `inset 1px 1px 0 rgba(255,255,255,0.06), 2px 2px 0 rgba(0,0,0,0.3)`
            : `inset 1px 1px 0 rgba(255,255,255,0.03), 2px 2px 0 rgba(0,0,0,0.3)`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
      >
        {icon}
      </button>

      {hovered && (
        <div
          className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-0.5 whitespace-nowrap z-50"
          style={{
            background: BG,
            border: `2px solid ${BORDER}`,
            fontSize: '15px',
            color: TEXT_DIM,
            fontFamily: '"MuzaiPixel", monospace',
            letterSpacing: '0.1em',
            boxShadow: '2px 2px 0 rgba(0,0,0,0.4)',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
