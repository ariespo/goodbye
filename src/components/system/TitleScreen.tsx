import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReactNode } from 'react';

import { GameIcon } from '../ui/GameIcon';

import { assetUrl } from '../../utils/assetUrl';

import { useGameStore } from '../../stores/gameStore';

import { FilmStrip } from './FilmStrip';

import { FullScreenGrain } from './FullScreenGrain';

import { openSaveModal } from './saveModalEvents';
import { startNewGame } from '../../utils/gameSession';



export function TitleScreen() {

  const showTitle = useGameStore(state => state.ui.showTitle);

  const toggleModal = useGameStore(state => state.actions.toggleModal);

  const addNotification = useGameStore(state => state.actions.addNotification);



  const [visible, setVisible] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rafRef = useRef<number>(0);



  useEffect(() => {

    if (showTitle) {

      const t = setTimeout(() => setVisible(true), 100);

      return () => clearTimeout(t);

    }

    setVisible(false);

  }, [showTitle]);



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

    <div className="title-screen fixed inset-0 z-[50] flex flex-col items-center justify-center overflow-hidden" style={{ background: '#050506' }}>

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

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-80" />



      <div

        className={`title-screen-content relative z-30 flex min-h-[86vh] w-full max-w-[1040px] flex-col items-center justify-center px-6 pb-10 transition-all duration-[1.2s] ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}

      >

        {/* 标题区暗色底衬：抬高 logo 与副标题在亮背景区域的对比度 */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 'min(92vw, 900px)',
            height: '70vh',
            background: 'radial-gradient(ellipse at 50% 42%, rgba(3,4,6,0.55) 0%, rgba(3,4,6,0.3) 45%, transparent 72%)',
          }}
        />

        <div className="title-hero relative flex flex-col items-center gap-5 mb-9">

          <h1 className="sr-only">漫长的告别</h1>

          <img

            src={assetUrl('assets/title/title-logo-v2.png')}

            alt="漫长的告别"

            className="title-logo select-none"

            style={{

              width: 'min(78vw, 760px)',

              imageRendering: 'pixelated',

              filter: 'brightness(1.18) contrast(1.06) drop-shadow(0 16px 34px rgba(0,0,0,0.85)) drop-shadow(0 0 26px rgba(122,158,210,0.32)) drop-shadow(0 0 2px rgba(230,235,245,0.25))',

              animation: 'titleLogoBreathe 5s ease-in-out infinite',

            }}

          />

          <p

            className="text-xs text-center"

            style={{

              color: 'rgba(226,222,214,0.82)',

              fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',

              letterSpacing: '0.18em',

              textShadow: '0 2px 10px rgba(0,0,0,0.92), 0 0 16px rgba(0,0,0,0.65)',

            }}

          >

            如果时间可以倒流，你是否能改写结局？

          </p>

        </div>



        <div className="title-button-stack relative flex flex-col items-center gap-3">

          <PixelButton label="开 始 游 戏" theme="blue" icon={<GameIcon name="play" size={21} />} onClick={handleStartGame} />

          <PixelButton label="设 置" theme="gray" icon={<GameIcon name="settings" size={21} />} onClick={handleSettings} />

          <PixelButton label="进 入 轮 回" theme="gold" icon={<GameIcon name="restart" size={21} />} onClick={handleReincarnation} />

        </div>

      </div>



      <div className="absolute bottom-5 z-30 text-[9px] tracking-[0.4em]" style={{ color: 'rgba(138,133,128,0.18)', fontFamily: '"JetBrains Mono", monospace' }}>

        VER 0.8.0

      </div>

      <div className="absolute top-6 left-6 w-12 h-12 border-l border-t border-white/[0.05]" />

      <div className="absolute top-6 right-6 w-12 h-12 border-r border-t border-white/[0.05]" />

      <div className="absolute bottom-6 left-6 w-12 h-12 border-l border-b border-white/[0.05]" />

      <div className="absolute bottom-6 right-6 w-12 h-12 border-r border-b border-white/[0.05]" />



      <style>{`

        @keyframes titleLogoBreathe {

          0%, 100% { transform: translateY(0); opacity: 0.92; }

          50% { transform: translateY(-2px); opacity: 1; }

        }

        @keyframes titleButtonSweep {

          0% { transform: translateX(-120%); opacity: 0; }

          40% { opacity: 0.8; }

          100% { transform: translateX(140%); opacity: 0; }

        }

      `}</style>

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
