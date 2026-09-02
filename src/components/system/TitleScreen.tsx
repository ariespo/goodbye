import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ReactNode } from 'react';

import { GameIcon } from '../ui/GameIcon';

import { assetUrl } from '../../utils/assetUrl';

import { useGameStore } from '../../stores/gameStore';

import { FilmStrip } from './FilmStrip';

import { FullScreenGrain } from './FullScreenGrain';

import { openSaveModal } from './saveModalEvents';
import { startNewGame } from '../../utils/gameSession';
import { calculateHudLayout } from '../game/hudLayout';



export function TitleScreen() {

  const showTitle = useGameStore(state => state.ui.showTitle);

  const toggleModal = useGameStore(state => state.actions.toggleModal);

  const addNotification = useGameStore(state => state.actions.addNotification);



  const [visible, setVisible] = useState(false);
  const [layout, setLayout] = useState(() => calculateHudLayout(window.innerWidth, window.innerHeight));

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rafRef = useRef<number>(0);



  useEffect(() => {

    if (showTitle) {

      const t = setTimeout(() => setVisible(true), 100);

      return () => clearTimeout(t);

    }

    setVisible(false);

  }, [showTitle]);

  useLayoutEffect(() => {
    const update = () => setLayout(calculateHudLayout(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);



  useEffect(() => {

    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;



    const resize = () => {

      canvas.width = window.innerWidth;

      canvas.height = window.innerHeight;

    };

    resize();

    window.addEventListener('resize', resize);



    interface Dust { x: number; y: number; vx: number; vy: number; r: number; alpha: number; }

    const dusts: Dust[] = Array.from({ length: 46 }, () => ({

      x: Math.random() * canvas.width,

      y: Math.random() * canvas.height,

      vx: (Math.random() - 0.5) * 0.18,

      vy: -Math.random() * 0.32 - 0.04,

      r: Math.random() * 1.3 + 0.25,

      alpha: Math.random() * 0.28 + 0.08,

    }));



    const draw = () => {

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const d of dusts) {

        d.x += d.vx;

        d.y += d.vy;

        if (d.y < -10) { d.y = canvas.height + 10; d.x = Math.random() * canvas.width; }

        if (d.x < -10) d.x = canvas.width + 10;

        if (d.x > canvas.width + 10) d.x = -10;

        ctx.beginPath();

        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);

        ctx.fillStyle = `rgba(220, 215, 205, ${d.alpha})`;

        ctx.fill();

      }

      rafRef.current = requestAnimationFrame(draw);

    };

    draw();

    return () => {

      window.removeEventListener('resize', resize);

      cancelAnimationFrame(rafRef.current);

    };

  }, []);



  /** 开始游戏：完整重置所有局内状态，从开局剧情重新开始 */
  const handleStartGame = useCallback(async () => {
    try {
      await startNewGame();
    } catch (e) {
      addNotification({
        type: 'error',
        message: e instanceof Error ? e.message : '开始游戏失败',
        duration: 3500,
      });
    }
  }, [addNotification]);

  const handleSettings = useCallback(() => toggleModal('settings'), [toggleModal]);

  /** 进入轮回：打开读档页，选择档案后继续 */
  const handleReincarnation = useCallback(() => {
    openSaveModal('load');
  }, []);



  if (!showTitle) return null;



  const filmColor = '#d4cfc7';



  return (
    <div className="title-screen fixed inset-0 z-[50] overflow-hidden" style={{ background: '#050506' }}>
      <video
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        src={assetUrl('assets/video/title-loop-009.mp4')}
        poster={assetUrl('assets/title/title-bg-v2.png')}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <FullScreenGrain />
      <div className="absolute inset-0 pointer-events-none opacity-[0.16] game-film-overlay" />
      <FilmStrip position="top" filmColor={filmColor} />
      <FilmStrip position="bottom" filmColor={filmColor} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none opacity-80" />

      <div className={`title-surveillance-viewport ${visible ? 'is-visible' : ''}`}>
        <main
          className="title-surveillance-canvas"
          aria-labelledby="title-screen-heading"
          style={{
            width: `${layout.virtualWidth}px`,
            height: `${layout.virtualHeight}px`,
            left: `${layout.offsetX}px`,
            top: `${layout.offsetY}px`,
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
          }}
        >
          <p className="sr-only">REC，CAM 03，2024-09-09 08:00，LOOP</p>
          <img
            aria-hidden="true"
            alt=""
            className="title-monitor-status-art"
            src={assetUrl('assets/title/title-monitor-status-story-time.png')}
          />

          <span className="title-viewfinder-corner is-top-left" aria-hidden="true" />
          <span className="title-viewfinder-corner is-top-right" aria-hidden="true" />
          <span className="title-viewfinder-corner is-bottom-left" aria-hidden="true" />
          <span className="title-viewfinder-corner is-bottom-right" aria-hidden="true" />

          <div className="title-surveillance-lockup">
            <h1 id="title-screen-heading" className="sr-only">漫长的告别</h1>
            <img
              aria-hidden="true"
              alt=""
              draggable="false"
              src={assetUrl('assets/title/title-lockup-surveillance-clean.png')}
            />
          </div>

          <nav className="title-surveillance-menu" aria-label="标题菜单">
            <PixelButton label="开始游戏" theme="blue" icon={<GameIcon name="play" size={34} />} onClick={handleStartGame} />
            <PixelButton label="设置" theme="gray" icon={<GameIcon name="settings" size={34} />} onClick={handleSettings} />
            <PixelButton label="进入轮回" theme="gold" icon={<GameIcon name="restart" size={34} />} onClick={handleReincarnation} />
          </nav>
        </main>
      </div>
    </div>
  );

}



type ButtonTheme = 'blue' | 'gray' | 'gold';

interface PixelButtonProps {
  label: string;
  theme: ButtonTheme;
  icon?: ReactNode;
  onClick: () => void;
}

/** 与局内 PixelFrame / choice / dialogue-control 一致的硬边框单色像素按钮 */
function PixelButton({ label, theme, icon, onClick }: PixelButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      data-cursor="pointer"
      data-theme={theme}
      data-hovered={hovered ? 'true' : 'false'}
      data-pressed={pressed ? 'true' : 'false'}
      className={`title-button title-button-${theme} group relative select-none cursor-none rounded-none`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => { setHovered(false); setPressed(false); }}
      onClick={onClick}
    >
      {/* 与局内 world-pixel-frame 一致的 L 角 */}

      <span className="title-button-face">
        {hovered && !pressed && (
          <span
            className="title-button-sweep"
            style={{ animation: 'titleButtonSweep 0.9s ease-out forwards' }}
          />
        )}
        <span className="title-button-label relative z-10 flex items-center justify-center gap-2.5">
          {icon}
          <span>{label}</span>
        </span>
      </span>
    </button>
  );
}
