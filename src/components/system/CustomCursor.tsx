import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isClickable, setIsClickable] = useState(false);
  const mood = useGameStore(state => state.game.currentState.mood);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isClickableElement = !!(
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.onclick !== null ||
        window.getComputedStyle(target).cursor === 'pointer'
      );
      setIsClickable(isClickableElement);
      setIsHovering(true);
    };

    const handleMouseOut = () => {
      setIsHovering(false);
      setIsClickable(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    let raf: number;
    const animate = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.15;
      pos.current.y += (target.current.y - pos.current.y) * 0.15;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      cancelAnimationFrame(raf);
    };
  }, []);

  const getCursorContent = () => {
    if (mood === 'horror') {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" className={isHovering ? "animate-[shake_0.3s_infinite]" : ""}>
          <polygon points="10,0 12,8 20,10 12,12 10,20 8,12 0,10 8,8" fill="#c94f4f" />
        </svg>
      );
    }
    if (mood === 'insane') {
      return (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.5 }}>
            <polygon points="8,0 10,6 16,8 10,10 8,16 6,10 0,8 6,6" fill="#a855c7" />
          </svg>
          <svg width="16" height="16" viewBox="0 0 16 16" className="absolute top-0 left-1">
            <polygon points="8,0 10,6 16,8 10,10 8,16 6,10 0,8 6,6" fill="#e8e4dc" />
          </svg>
        </>
      );
    }
    if (isClickable) {
      return (
        <svg width="20" height="20" viewBox="0 0 20 20">
          <path d="M5,2 L5,14 L8,14 L8,18 L12,12 L9,12 L12,2 Z" fill="#e8e4dc" stroke="#0d0d0f" strokeWidth="1" />
        </svg>
      );
    }
    return (
      <svg width="16" height="16" viewBox="0 0 16 16">
        <polygon points="0,0 0,12 4,8 8,14 10,13 6,7 12,7" fill="#e8e4dc" stroke="#0d0d0f" strokeWidth="0.5" />
      </svg>
    );
  };

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-[9999] transition-transform duration-75"
      style={{ willChange: 'transform' }}
    >
      <div className={`transition-transform duration-150 ${isHovering && isClickable ? 'scale-125' : 'scale-100'}`}>
        {getCursorContent()}
      </div>
    </div>
  );
}
