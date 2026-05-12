import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -100, y: -100 });
  const target = useRef({ x: -100, y: -100 });
  const [isClickable, setIsClickable] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const mood = useGameStore(state => state.game.currentState.mood);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    target.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const el = e.target as HTMLElement;
    const clickable = !!(
      el.tagName === 'BUTTON' ||
      el.tagName === 'A' ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.closest('button') ||
      el.closest('a') ||
      el.closest('label') ||
      window.getComputedStyle(el).cursor === 'pointer'
    );
    setIsClickable(clickable);
  }, []);

  const handleMouseOut = useCallback(() => {
    setIsClickable(false);
  }, []);

  const handleMouseDown = useCallback(() => {
    setIsPressed(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    let raf: number;
    const animate = () => {
      // lag 0.65 = 响应快但有微妙的重量感
      pos.current.x += (target.current.x - pos.current.x) * 0.65;
      pos.current.y += (target.current.y - pos.current.y) * 0.65;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      if (dotRef.current) {
        // dot 更跟手，lag 更高
        dotRef.current.style.transform = `translate(${target.current.x - 2}px, ${target.current.y - 2}px)`;
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
      cancelAnimationFrame(raf);
    };
  }, [handleMouseMove, handleMouseOver, handleMouseOut, handleMouseDown, handleMouseUp]);

  // 情绪影响颜色
  const getMoodColor = () => {
    switch (mood) {
      case 'horror': return '#c94f4f';
      case 'insane': return '#a855c7';
      case 'sad': return '#5b8db8';
      case 'angry': return '#c94f4f';
      case 'happy': return '#d4a853';
      default: return '#6b8cff';
    }
  };

  const moodColor = getMoodColor();

  return (
    <>
      {/* 中心点 — 始终紧贴鼠标 */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none z-[9999]"
      >
        <div
          className={`w-1 h-1 rounded-full transition-all duration-100 ${
            isClickable ? 'scale-150 opacity-100' : 'scale-100 opacity-50'
          }`}
          style={{ backgroundColor: isClickable ? moodColor : '#e8e4dc' }}
        />
      </div>

      {/* 主光标 — 带 lag 的重量感 */}
      <div
        ref={cursorRef}
        className="fixed top-0 left-0 pointer-events-none z-[9998]"
        style={{ willChange: 'transform' }}
      >
        {/* 默认箭头 */}
        <div
          className={`relative transition-all duration-100 ${
            isClickable ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
          } ${isPressed ? 'scale-90' : ''}`}
          style={{
            width: 0,
            height: 0,
            marginLeft: -1,
            marginTop: -1,
          }}
        >
          {/* 外发光层 */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            className="absolute -top-1 -left-1"
            style={{
              filter: `drop-shadow(0 0 3px ${moodColor}) drop-shadow(0 0 6px ${moodColor}40)`,
              opacity: mood !== 'calm' ? 0.6 : 0,
              transition: 'opacity 0.3s',
            }}
          >
            <polygon
              points="2,2 2,20 8,14 12,22 16,20 12,12 20,12"
              fill={moodColor}
            />
          </svg>

          {/* 主箭头 — 白色填充 + 黑色描边防吞没 */}
          <svg width="24" height="24" viewBox="0 0 24 24">
            <polygon
              points="2,2 2,18 7,13 10,20 13,18 10,11 17,11"
              fill="#e8e4dc"
              stroke="#0d0d0f"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {/* 高光点 */}
          <div
            className="absolute top-[3px] left-[3px] w-[2px] h-[2px] bg-white/80 rounded-full"
          />
        </div>

        {/* Hover 手形 */}
        <div
          className={`relative transition-all duration-150 ${
            isClickable ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          } ${isPressed ? 'scale-90' : ''}`}
          style={{
            width: 0,
            height: 0,
            marginLeft: -10,
            marginTop: -2,
          }}
        >
          {/* 发光 */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            className="absolute -top-1 -left-1"
            style={{
              filter: `drop-shadow(0 0 4px ${moodColor})`,
            }}
          >
            <path
              d="M8,4 L8,16 L11,16 L11,20 L15,20 L15,16 L18,16 L18,12 L20,12 L20,8 L18,8 L18,4 L14,4 L14,8 L12,8 L12,4 Z"
              fill={moodColor}
              opacity="0.5"
            />
          </svg>

          {/* 手形主体 */}
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path
              d="M7,3 L7,15 L10,15 L10,19 L14,19 L14,15 L17,15 L17,11 L19,11 L19,7 L17,7 L17,3 L13,3 L13,7 L11,7 L11,3 Z"
              fill="#e8e4dc"
              stroke="#0d0d0f"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>

          {/* 手指高光 */}
          <div className="absolute top-[5px] left-[8px] w-[2px] h-[3px] bg-white/60 rounded-full" />
        </div>
      </div>
    </>
  );
}
