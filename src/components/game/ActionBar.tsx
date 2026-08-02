import { useState } from 'react';

import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon, type GameIconName } from '../ui/GameIcon';

const TEXT_DIM = '#aaa59e';
const TEXT_DISABLED = '#4a4542';
const ACCENT_BLUE = '#86a8f2';
const ACCENT_GOLD = '#d4a853';

const gameActions = [
  { id: 'observe' as const, icon: 'observe' as const, label: '观察' },
  { id: 'investigate' as const, icon: 'investigate' as const, label: '调查' },
  { id: 'actions' as const, icon: 'action' as const, label: '行动' },
  { id: 'map' as const, icon: 'map' as const, label: '地图' },
] as const;

type ToolId = 'clues' | 'characters' | 'history' | 'settings';

const tools: Array<{ id: ToolId; icon: GameIconName; label: string }> = [
  { id: 'clues', icon: 'stack', label: '线索' },
  { id: 'characters', icon: 'info', label: '人物' },
  { id: 'history', icon: 'history', label: '历史' },
  { id: 'settings', icon: 'settings', label: '设置' },
];

const conclusionTool = { id: 'conclusion', icon: 'ending' as const, label: '指认' };

export function ActionBar() {
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const setShowConclusion = useGameStore(state => state.actions.setShowConclusion);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const currentScene = useGameStore(state => state.game.currentScene);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const endingVisible = useGameStore(state => state.game.endingPanel.visible);
  const { performAction } = useGameLoop();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [observeGlowDone, setObserveGlowDone] = useState(
    () => window.localStorage.getItem('farewell.observe-glow.done') === 'true',
  );

  if (endingVisible) return null;

  const showGameActions = currentScene && sceneComplete;
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
    <>
      {mobileMoreOpen && (
        <div className="mobile-more-drawer" role="dialog" aria-label="更多菜单">
          <div className="mobile-more-drawer__header">
            <span>更多</span>
            <button type="button" aria-label="关闭更多菜单" onClick={() => setMobileMoreOpen(false)}>
              <GameIcon name="close" size={16} />
            </button>
          </div>
          <div className="mobile-more-drawer__grid">
            {tools.map(tool => (
              <DrawerButton
                key={tool.id}
                iconName={tool.icon}
                label={tool.label}
                onClick={() => {
                  setMobileMoreOpen(false);
                  toggleModal(tool.id);
                }}
              />
            ))}
            <DrawerButton
              iconName={conclusionTool.icon}
              label={conclusionTool.label}
              tone="gold"
              onClick={() => {
                setMobileMoreOpen(false);
                setShowConclusion(true);
              }}
            />
          </div>
        </div>
      )}

      <div className="action-bar absolute bottom-[5%] left-4 z-30 flex items-center gap-2" style={{ paddingBottom: 2 }}>
      {showGameActions && (
        <>
          <div className="action-bar-group action-bar-primary flex gap-2">
            {gameActions.map(action => (
              <PixelActionBtn
                key={action.id}
                iconName={action.icon}
                label={action.label}
                showLabel
                enabled={availability[action.id]}
                actionId={action.id}
                breathe={action.id === 'observe' && !observeGlowDone && availability.observe}
                onClick={() => {
                  if (action.id === 'observe' && !observeGlowDone) {
                    window.localStorage.setItem('farewell.observe-glow.done', 'true');
                    setObserveGlowDone(true);
                  }
                  if (action.id === 'map') toggleModal('map');
                  else performAction(action.id);
                }}
              />
            ))}
          </div>
          <div className="mx-1 h-9 w-[2px] bg-[#202027] shadow-[1px_0_0_rgba(255,255,255,0.08)]" />
        </>
      )}

      <div className="action-bar-group action-bar-secondary flex gap-2">
        {tools.map(tool => (
          <PixelActionBtn
            key={tool.id}
            iconName={tool.icon}
            label={tool.label}
            enabled={!isWaitingForAI}
            actionId={tool.id}
            onClick={() => toggleModal(tool.id)}
          />
        ))}
        <PixelActionBtn
          iconName={conclusionTool.icon}
          label={conclusionTool.label}
          enabled={!isWaitingForAI && sceneComplete}
          tone="gold"
          onClick={() => setShowConclusion(true)}
        />
      </div>
      <button
        type="button"
        className="action-bar-more"
        aria-label="更多"
        aria-expanded={mobileMoreOpen}
        onClick={() => setMobileMoreOpen(value => !value)}
      >
        <GameIcon name="stack" size={21} />
        <span>更多</span>
      </button>
      </div>
    </>
  );
}

function PixelActionBtn({
  iconName,
  label,
  enabled = true,
  tone = 'blue',
  showLabel = false,
  actionId,
  breathe = false,
  onClick,
}: {
  iconName: GameIconName;
  label: string;
  enabled?: boolean;
  tone?: 'blue' | 'gold';
  showLabel?: boolean;
  actionId?: string;
  breathe?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isDisabled = !enabled;
  const state = isDisabled ? 'disabled' : pressed ? 'pressed' : hovered ? 'hover' : 'normal';
  const accent = tone === 'gold' ? ACCENT_GOLD : ACCENT_BLUE;

  return (
    <div className="group relative">
      <button
        aria-label={label}
        title={label}
        data-cursor={isDisabled ? undefined : 'pointer'}
        data-action-id={actionId}
        className={`action-bar-button relative flex h-12 select-none items-center justify-center overflow-hidden rounded-none transition-[filter,transform] duration-100 ${showLabel ? 'has-label' : ''} ${breathe ? 'guide-breathe' : ''}`}
        style={{
          backgroundImage: `url(${assetUrl(`assets/ui/action-slot-${tone}-${state}.png`)})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          color: isDisabled ? TEXT_DISABLED : hovered ? accent : TEXT_DIM,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.55 : 1,
          filter: hovered && !isDisabled ? `drop-shadow(0 0 8px ${accent}44)` : 'drop-shadow(2px 2px 0 rgba(0,0,0,0.45))',
          imageRendering: 'pixelated',
          transform: pressed ? 'translate(2px, 2px)' : hovered ? 'translate(1px, 1px)' : 'translate(0, 0)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onMouseDown={() => {
          if (!isDisabled) setPressed(true);
        }}
        onMouseUp={() => setPressed(false)}
        onClick={() => {
          if (!isDisabled) onClick();
        }}
        disabled={isDisabled}
      >
        <span
          className="absolute inset-x-2 top-1 h-px opacity-0 transition-opacity duration-150 group-hover:opacity-70"
          style={{ background: accent }}
        />
        <GameIcon name={iconName} size={28} />
        {showLabel && <span className="action-bar-button__label">{label}</span>}
        {hovered && !isDisabled && (
          <span
            className="pointer-events-none absolute -right-1 top-1 h-2 w-2"
            style={{
              background: accent,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
              imageRendering: 'pixelated',
            }}
          />
        )}
      </button>

      {hovered && (
        <div
          className="pointer-events-none absolute -bottom-9 left-1/2 z-50 flex h-12 -translate-x-1/2 items-center justify-center whitespace-nowrap px-5"
          style={{
            minWidth: 108,
            backgroundImage: `url(${assetUrl('assets/ui/tooltip-frame.png')})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: '100% 100%',
            color: isDisabled ? TEXT_DISABLED : accent,
            fontSize: '15px',
            fontFamily: '"MuzaiPixel", "LXGW WenKai", monospace',
            letterSpacing: '0.08em',
            textShadow: '0 2px 0 rgba(0,0,0,0.8)',
            imageRendering: 'pixelated',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function DrawerButton({ iconName, label, tone = 'blue', onClick }: {
  iconName: GameIconName;
  label: string;
  tone?: 'blue' | 'gold';
  onClick: () => void;
}) {
  return (
    <button type="button" className={`mobile-more-item is-${tone}`} onClick={onClick}>
      <GameIcon name={iconName} size={22} />
      <span>{label}</span>
    </button>
  );
}
