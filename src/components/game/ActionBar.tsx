import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import {
  Eye, MagnifyingGlass, ArrowRight, MapTrifold,
  Gear, Books, SlidersHorizontal, ClockClockwise,
  Star, Terminal,
} from '@phosphor-icons/react';

const BORDER = '#3a3a42';
const BORDER_HOVER = '#6b8fc4';
const BORDER_DISABLED = '#2a2a2e';
const BG = 'rgba(12, 12, 16, 0.88)';
const BG_DISABLED = 'rgba(12, 12, 16, 0.5)';
const TEXT_DIM = '#6a6560';
const TEXT_DISABLED = '#3a3632';
const ACCENT = '#6b8fc4';

const gameActions = [
  { id: 'observe' as const, icon: Eye, label: '观察' },
  { id: 'investigate' as const, icon: MagnifyingGlass, label: '调查' },
  { id: 'actions' as const, icon: ArrowRight, label: '行动' },
  { id: 'map' as const, icon: MapTrifold, label: '地图' },
] as const;

type ToolId = 'history' | 'lorebook' | 'preset' | 'settings' | 'prompt';

const tools: Array<{ id: ToolId; icon: typeof Eye; label: string }> = [
  { id: 'history', icon: ClockClockwise, label: '历史' },
  { id: 'lorebook', icon: Books, label: '世界书' },
  { id: 'preset', icon: SlidersHorizontal, label: '预设' },
  { id: 'settings', icon: Gear, label: '设置' },
  { id: 'prompt', icon: Terminal, label: '提示词' },
];

const endingTool = { id: 'ending', icon: Star, label: '结局' };

export function ActionBar() {
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const setShowEndingEditor = useGameStore(state => state.actions.setShowEndingEditor);
  const setShowPromptInspector = useGameStore(state => state.actions.setShowPromptInspector);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const currentScene = useGameStore(state => state.game.currentScene);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { performAction } = useGameLoop();

  const showGameActions = currentScene && sceneComplete;

  // 判断当前场景是否有对应的本地数据
  const hasObserve = !!currentScene?.observe;
  const hasInvestigate = !!currentScene?.investigateItems && currentScene.investigateItems.length > 0;
  const hasActions = !!currentScene?.actionItems && currentScene.actionItems.length > 0;

  const availability: Record<string, boolean> = {
    observe: hasObserve && !isWaitingForAI,
    investigate: hasInvestigate && !isWaitingForAI,
    actions: hasActions && !isWaitingForAI,
    map: !isWaitingForAI,
  };

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
                enabled={availability[a.id]}
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
            enabled={!isWaitingForAI}
            onClick={() => t.id === 'prompt' ? setShowPromptInspector(true) : toggleModal(t.id)}
          />
        ))}
        <PixelActionBtn
          icon={<endingTool.icon size={27} />}
          label={endingTool.label}
          enabled={!isWaitingForAI}
          onClick={() => setShowEndingEditor(true)}
        />
      </div>
    </div>
  );
}

/* ── 像素图标按钮 ── */

function PixelActionBtn({
  icon, label, enabled = true, onClick,
}: {
  icon: React.ReactNode; label: string; enabled?: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isDisabled = !enabled;
  const bg = isDisabled
    ? BG_DISABLED
    : hovered
      ? 'rgba(107,143,196,0.12)'
      : BG;
  const border = isDisabled
    ? BORDER_DISABLED
    : hovered
      ? BORDER_HOVER
      : BORDER;
  const color = isDisabled
    ? TEXT_DISABLED
    : hovered
      ? ACCENT
      : TEXT_DIM;

  return (
    <div className="relative">
      <button
        className="w-10 h-10 flex items-center justify-center select-none transition-all duration-150"
        style={{
          background: bg,
          border: `2px solid ${border}`,
          color,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          boxShadow: hovered && !isDisabled
            ? `inset 1px 1px 0 rgba(255,255,255,0.06), 2px 2px 0 rgba(0,0,0,0.3)`
            : `inset 1px 1px 0 rgba(255,255,255,0.03), 2px 2px 0 rgba(0,0,0,0.3)`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (!isDisabled) onClick(); }}
        disabled={isDisabled}
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
