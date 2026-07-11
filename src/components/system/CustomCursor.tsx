import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

type CursorMode = 'idle' | 'point' | 'disabled';

type ClickBurst = {
  id: number;
  x: number;
  y: number;
  color: string;
};

const CURSOR_SIZE = 32;
const CURSOR_HOTSPOT = { x: 9, y: 5 };
const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'label',
  'summary',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[data-cursor="pointer"]',
].join(',');

function getMoodColor(mood?: string) {
  switch (mood) {
    case 'horror':
    case 'angry':
      return '#c94f4f';
    case 'insane':
      return '#a855c7';
    case 'sad':
      return '#5b8db8';
    case 'happy':
      return '#d4a853';
    default:
      return '#6b8cff';
  }
}

function isDisabledElement(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return false;
  return (
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.closest('[disabled], [aria-disabled="true"]') !== null
  );
}

function getCursorMode(target: EventTarget | null): CursorMode {
  if (!(target instanceof HTMLElement)) return 'idle';

  const interactive = target.closest(INTERACTIVE_SELECTOR);
  if (interactive) return isDisabledElement(interactive) ? 'disabled' : 'point';

  const style = window.getComputedStyle(target);
  if (style.pointerEvents === 'none') return 'idle';
  if (style.cursor === 'pointer') return 'point';
  if (style.cursor === 'not-allowed') return 'disabled';

  return 'idle';
}

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: -100, y: -100 });
  const pos = useRef({ x: -100, y: -100 });
  const burstId = useRef(0);
  const modeRef = useRef<CursorMode>('idle');
  const pressedRef = useRef(false);

  const [mode, setMode] = useState<CursorMode>('idle');
  const [isPressed, setIsPressed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [bursts, setBursts] = useState<ClickBurst[]>([]);
  const mood = useGameStore(state => state.game.currentState.mood);
  const moodColor = getMoodColor(mood);

  const setCursorMode = useCallback((nextMode: CursorMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    target.current = { x: event.clientX, y: event.clientY };
    setIsVisible(true);
    setCursorMode(getCursorMode(event.target));
  }, [setCursorMode]);

  const handleMouseOver = useCallback((event: MouseEvent) => {
    setCursorMode(getCursorMode(event.target));
  }, [setCursorMode]);

  const handleMouseOut = useCallback((event: MouseEvent) => {
    const related = event.relatedTarget;
    if (!related || !(related instanceof Node)) {
      setCursorMode('idle');
    }
  }, [setCursorMode]);

  const handleMouseDown = useCallback((event: MouseEvent) => {
    pressedRef.current = true;
    setIsPressed(true);
    const color = modeRef.current === 'disabled' ? '#c94f4f' : getMoodColor(mood);
    const id = burstId.current + 1;
    burstId.current = id;
    setBursts(current => [...current.slice(-5), { id, x: event.clientX, y: event.clientY, color }]);
    window.setTimeout(() => {
      setBursts(current => current.filter(item => item.id !== id));
    }, 360);
  }, [mood]);

  const handleMouseUp = useCallback(() => {
    pressedRef.current = false;
    setIsPressed(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
    pressedRef.current = false;
    setIsPressed(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    let raf = 0;
    const animate = () => {
      const lag = modeRef.current === 'idle' ? 0.5 : 0.72;
      pos.current.x += (target.current.x - pos.current.x) * lag;
      pos.current.y += (target.current.y - pos.current.y) * lag;

      if (cursorRef.current) {
        const downOffset = pressedRef.current ? 1 : 0;
        cursorRef.current.style.transform = `translate3d(${pos.current.x - CURSOR_HOTSPOT.x + downOffset}px, ${pos.current.y - CURSOR_HOTSPOT.y + downOffset}px, 0)`;
      }

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      cancelAnimationFrame(raf);
    };
  }, [
    handleMouseMove,
    handleMouseOver,
    handleMouseOut,
    handleMouseDown,
    handleMouseUp,
    handleMouseLeave,
    handleMouseEnter,
  ]);

  const cursorAsset = isPressed && mode !== 'disabled'
    ? 'hand-press'
    : mode === 'point'
      ? 'hand-point'
      : mode === 'disabled'
        ? 'hand-disabled'
        : 'hand-idle';

  return (
    <>
      <div
        ref={cursorRef}
        className="fixed left-0 top-0 pointer-events-none z-[9998] transition-opacity duration-150"
        style={{
          opacity: isVisible ? 1 : 0,
          willChange: 'transform',
        }}
        aria-hidden="true"
      >
        <div
          className="relative"
          style={{
            width: CURSOR_SIZE,
            height: CURSOR_SIZE,
            filter: mode === 'idle'
              ? 'drop-shadow(2px 2px 0 rgba(0,0,0,0.72))'
              : `drop-shadow(2px 2px 0 rgba(0,0,0,0.8)) drop-shadow(0 0 5px ${mode === 'disabled' ? '#c94f4f' : moodColor}66)`,
          }}
        >
          <img
            src={assetUrl(`assets/cursor/${cursorAsset}.png`)}
            alt=""
            draggable={false}
            className="absolute left-0 top-0 h-8 w-8 select-none"
            style={{
              imageRendering: 'pixelated',
              transform: isPressed ? 'scale(0.94)' : mode === 'point' ? 'scale(1.04)' : 'scale(1)',
              transformOrigin: `${CURSOR_HOTSPOT.x}px ${CURSOR_HOTSPOT.y}px`,
              transition: 'transform 80ms steps(2, end), filter 120ms steps(2, end)',
            }}
          />
          {mode === 'point' && !isPressed && (
            <span
              className="absolute block"
              style={{
                left: 2,
                top: 1,
                width: 4,
                height: 4,
                background: moodColor,
                clipPath: 'polygon(0 40%, 40% 40%, 40% 0, 60% 0, 60% 40%, 100% 40%, 100% 60%, 60% 60%, 60% 100%, 40% 100%, 40% 60%, 0 60%)',
                imageRendering: 'pixelated',
                animation: 'pixelCursorSpark 620ms steps(2, end) infinite',
              }}
            />
          )}
        </div>
      </div>

      {bursts.map(burst => (
        <span
          key={burst.id}
          className="fixed left-0 top-0 pointer-events-none z-[9997]"
          style={{
            '--cursor-burst-x': `${burst.x - 9}px`,
            '--cursor-burst-y': `${burst.y - 9}px`,
            transform: `translate3d(${burst.x - 9}px, ${burst.y - 9}px, 0)`,
            width: 18,
            height: 18,
            border: `2px solid ${burst.color}`,
            boxShadow: `0 0 0 2px #0d0d0f, 0 0 10px ${burst.color}66`,
            imageRendering: 'pixelated',
            animation: 'pixelCursorBurst 360ms steps(5, end) forwards',
          } as CSSProperties & Record<'--cursor-burst-x' | '--cursor-burst-y', string>}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
