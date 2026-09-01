import { useLayoutEffect, useState, type ReactNode } from 'react';
import { calculateHudLayout } from './hudLayout';

export function HudViewport({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState(() => calculateHudLayout(window.innerWidth, window.innerHeight));

  useLayoutEffect(() => {
    const update = () => setLayout(calculateHudLayout(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="hud-viewport">
      <div
        className="hud-design-canvas"
        data-design-size="1672x941"
        style={{
          width: `${layout.virtualWidth}px`,
          height: `${layout.virtualHeight}px`,
          left: `${layout.offsetX}px`,
          top: `${layout.offsetY}px`,
          transform: `scale(${layout.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
