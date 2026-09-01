import { useEffect, useState } from 'react';
import { useGameLoop } from '../../hooks/useGameLoop';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { FreeActionDialog } from './FreeActionDialog';

type WheelAction = {
  id: 'observe' | 'investigate' | 'actions' | 'clues' | 'map' | 'free';
  label: string;
  icon: 'observe' | 'investigate' | 'action' | 'clue' | 'map' | 'free';
};

const WHEEL_ACTIONS: WheelAction[] = [
  { id: 'observe', label: '观察', icon: 'observe' },
  { id: 'investigate', label: '调查', icon: 'investigate' },
  { id: 'actions', label: '行动', icon: 'action' },
  { id: 'clues', label: '线索', icon: 'clue' },
  { id: 'map', label: '地图', icon: 'map' },
  { id: 'free', label: '自由', icon: 'free' },
];

const iconPath = (name: string) => assetUrl(`assets/ui/penpot/pc/icon-${name}.svg`);

const WHEEL_GEOMETRY = {
  centerX: 220,
  centerY: 253,
  innerRadius: 78,
  outerRadius: 245,
  startAngle: -164,
  endAngle: 76,
} as const;

function polarPoint(angle: number, radius: number) {
  const radians = angle * Math.PI / 180;
  return {
    x: WHEEL_GEOMETRY.centerX + Math.cos(radians) * radius,
    y: WHEEL_GEOMETRY.centerY + Math.sin(radians) * radius,
  };
}

function annularSectorPath(startAngle: number, endAngle: number) {
  const outerStart = polarPoint(startAngle, WHEEL_GEOMETRY.outerRadius);
  const outerEnd = polarPoint(endAngle, WHEEL_GEOMETRY.outerRadius);
  const innerEnd = polarPoint(endAngle, WHEEL_GEOMETRY.innerRadius);
  const innerStart = polarPoint(startAngle, WHEEL_GEOMETRY.innerRadius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${WHEEL_GEOMETRY.outerRadius} ${WHEEL_GEOMETRY.outerRadius} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${WHEEL_GEOMETRY.innerRadius} ${WHEEL_GEOMETRY.innerRadius} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function ActionBar() {
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const currentScene = useGameStore(state => state.game.currentScene);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const endingVisible = useGameStore(state => state.game.endingPanel.visible);
  const { performAction } = useGameLoop();
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelMounted, setWheelMounted] = useState(false);
  const [freeInputOpen, setFreeInputOpen] = useState(false);
  const [observeGlowDone, setObserveGlowDone] = useState(
    () => window.localStorage.getItem('farewell.observe-glow.done') === 'true',
  );

  useEffect(() => {
    if (!wheelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWheelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [wheelOpen]);

  useEffect(() => {
    if (wheelOpen || !wheelMounted) return;
    const unmountTimer = window.setTimeout(() => setWheelMounted(false), 320);
    return () => window.clearTimeout(unmountTimer);
  }, [wheelMounted, wheelOpen]);

  if (endingVisible || !currentScene || !sceneComplete || isWaitingForAI) return null;

  const ready = Boolean(currentScene && sceneComplete && !isWaitingForAI);
  const availability: Record<WheelAction['id'], boolean> = {
    observe: ready && Boolean(currentScene?.observe),
    investigate: ready && Boolean(currentScene?.investigateItems?.length),
    actions: ready && Boolean(currentScene?.actionItems?.length),
    clues: !isWaitingForAI,
    map: !isWaitingForAI,
    free: ready,
  };

  const activate = (action: WheelAction) => {
    if (!availability[action.id]) return;
    setWheelOpen(false);
    if (action.id === 'free') {
      setFreeInputOpen(true);
      return;
    }
    if (action.id === 'clues' || action.id === 'map') {
      toggleModal(action.id);
      return;
    }
    if (action.id === 'observe' && !observeGlowDone) {
      window.localStorage.setItem('farewell.observe-glow.done', 'true');
      setObserveGlowDone(true);
    }
    performAction(action.id);
  };

  const toggleWheel = () => {
    if (wheelOpen) {
      setWheelOpen(false);
      return;
    }
    setWheelMounted(true);
    setWheelOpen(true);
  };

  return (
    <>
      <div className={`operation-dock ${wheelOpen ? 'is-open' : wheelMounted ? 'is-closing' : ''}`}>
        {wheelMounted && (
          <svg className="operation-wheel" viewBox="0 0 500 500" role="menu" aria-label="操作轮盘">
            {WHEEL_ACTIONS.map((action, index) => {
              const span = (WHEEL_GEOMETRY.endAngle - WHEEL_GEOMETRY.startAngle) / WHEEL_ACTIONS.length;
              const startAngle = WHEEL_GEOMETRY.startAngle + index * span + 1;
              const endAngle = WHEEL_GEOMETRY.startAngle + (index + 1) * span - 1;
              const disabled = !availability[action.id];
              return (
                <g
                  key={action.id}
                  role="menuitem"
                  aria-label={action.label}
                  aria-disabled={disabled}
                  tabIndex={disabled ? -1 : 0}
                  className={`operation-wheel__sector operation-wheel__sector--${action.id} ${index === 0 ? 'is-primary' : ''} ${disabled ? 'is-disabled' : ''} ${action.id === 'observe' && !observeGlowDone && availability.observe ? 'guide-breathe' : ''}`}
                  data-action-id={action.id}
                  onClick={() => activate(action)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      activate(action);
                    }
                  }}
                >
                  <path
                    data-wheel-sector="true"
                    data-inner-radius={WHEEL_GEOMETRY.innerRadius}
                    data-outer-radius={WHEEL_GEOMETRY.outerRadius}
                    d={annularSectorPath(startAngle, endAngle)}
                  />
                </g>
              );
            })}
            <g className="operation-wheel__outlines" aria-hidden="true">
              {WHEEL_ACTIONS.map((action, index) => {
                const span = (WHEEL_GEOMETRY.endAngle - WHEEL_GEOMETRY.startAngle) / WHEEL_ACTIONS.length;
                const startAngle = WHEEL_GEOMETRY.startAngle + index * span + 1;
                const endAngle = WHEEL_GEOMETRY.startAngle + (index + 1) * span - 1;
                return <path key={action.id} data-wheel-outline="true" d={annularSectorPath(startAngle, endAngle)} />;
              })}
            </g>
          </svg>
        )}
        {wheelMounted && (
          <div className="operation-wheel__labels" aria-hidden="true">
            {WHEEL_ACTIONS.map((action, index) => {
              const span = (WHEEL_GEOMETRY.endAngle - WHEEL_GEOMETRY.startAngle) / WHEEL_ACTIONS.length;
              const startAngle = WHEEL_GEOMETRY.startAngle + index * span + 1;
              const endAngle = WHEEL_GEOMETRY.startAngle + (index + 1) * span - 1;
              const contentPoint = polarPoint((startAngle + endAngle) / 2, 164);
              return (
                <div
                  key={action.id}
                  className={`operation-wheel__overlay-content ${index === 0 ? 'is-primary' : ''} ${availability[action.id] ? '' : 'is-disabled'}`}
                  style={{ left: contentPoint.x, top: contentPoint.y }}
                >
                  <img className="operation-wheel__icon" src={iconPath(action.icon)} alt="" />
                  <span className="operation-wheel__label">{action.label}</span>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="operation-hub" aria-label="操作" aria-expanded={wheelOpen} onClick={toggleWheel}>
          <svg
            className="operation-hub__frame"
            data-operation-hub-frame="true"
            viewBox="0 0 128 128"
            aria-hidden="true"
            shapeRendering="crispEdges"
          >
            <path
              className="operation-hub__underlay"
              data-operation-hub-underlay="true"
              d="M 16 2 H 112 V 6 H 120 V 14 H 126 V 112 H 122 V 120 H 114 V 126 H 14 V 122 H 6 V 114 H 2 V 16 H 6 V 8 H 16 Z"
            />
            <path
              data-operation-hub-rail="outer"
              d="M 16 2 H 112 V 6 H 120 V 14 H 126 V 112 H 122 V 120 H 114 V 126 H 14 V 122 H 6 V 114 H 2 V 16 H 6 V 8 H 16 Z"
            />
            <path
              data-operation-hub-rail="inner"
              d="M 20 10 H 108 V 14 H 116 V 22 H 118 V 106 H 114 V 114 H 106 V 118 H 22 V 114 H 14 V 106 H 10 V 22 H 14 V 14 H 20 Z"
            />
          </svg>
          <span className="operation-hub__content">
            <img src={iconPath('operation-iris')} alt="" />
            <span>操作</span>
          </span>
        </button>
      </div>

      <div className="mobile-action-strip" aria-label="快捷操作">
        {WHEEL_ACTIONS.map(action => (
          <button key={action.id} type="button" aria-label={action.label} disabled={!availability[action.id]} onClick={() => activate(action)}>
            <img src={iconPath(action.icon)} alt="" /><span>{action.label}</span>
          </button>
        ))}
      </div>
      <FreeActionDialog open={freeInputOpen} onClose={() => setFreeInputOpen(false)} />
    </>
  );
}
