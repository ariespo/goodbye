import { useEffect, useState, useCallback, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';

const PHASES = [
  { name: 'black', duration: 600 },
  { name: 'whiteDot', duration: 500 },
  { name: 'scanline', duration: 1400 },
  { name: 'noise', duration: 600 },
  { name: 'title', duration: 2200 },
  { name: 'stable', duration: 800 },
  { name: 'glitch', duration: 700 },
  { name: 'powerOff', duration: 700 },
  { name: 'exit', duration: 300 },
];

export function IntroAnimation() {
  const [phase, setPhase] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const introPlayed = useGameStore(state => state.ui.introPlayed);
  const setIntroPlayed = useGameStore(state => state.actions.setIntroPlayed);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (introPlayed) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (skipRequested) {
      setPhase(PHASES.length - 1);
      timerRef.current = setTimeout(() => {
        setIntroPlayed(true);
      }, PHASES[PHASES.length - 1].duration);
      return;
    }

    if (phase >= PHASES.length - 1) {
      timerRef.current = setTimeout(() => {
        setIntroPlayed(true);
      }, PHASES[phase].duration);
      return;
    }

    timerRef.current = setTimeout(() => {
      setPhase(prev => prev + 1);
    }, PHASES[phase].duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, skipRequested, introPlayed]);

  const handleSkip = useCallback(() => {
    if (skipRequested || introPlayed) return;
    setSkipRequested(true);
  }, [skipRequested, introPlayed]);

  if (introPlayed) return null;

  const p = PHASES[phase].name;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-bg-primary flex items-center justify-center overflow-hidden"
      onClick={handleSkip}
    >
      {/* CRT 扫描线背景 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />

      {/* 暗角效果 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* 噪声纹理 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
        }}
      />

      {/* Phase: black */}
      {p === 'black' && <div className="w-full h-full bg-black" />}

      {/* Phase: whiteDot - 中心白点闪烁 */}
      {(p === 'whiteDot' || p === 'scanline') && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-2 h-2 bg-white"
            style={{
              boxShadow: '0 0 20px 10px rgba(255,255,255,0.3), 0 0 40px 20px rgba(255,255,255,0.1)',
              animation: p === 'whiteDot' ? 'crtWhiteDot 0.5s ease-out forwards' : 'none',
              opacity: p === 'scanline' ? 0.8 : undefined,
              transform: p === 'scanline' ? 'scale(1.2)' : undefined,
            }}
          />
        </div>
      )}

      {/* Phase: scanline - 扫描线展开 */}
      {p === 'scanline' && (
        <div
          className="absolute left-0 right-0 bg-white/20"
          style={{
            animation: 'crtScanlineExpand 1.4s ease-out forwards',
            boxShadow: '0 0 30px 10px rgba(255,255,255,0.15)',
          }}
        />
      )}

      {/* Phase: noise - 雪花噪声画面 */}
      {(p === 'noise' || p === 'title') && (
        <div className="absolute inset-0">
          <CanvasNoise active={p === 'noise'} />
        </div>
      )}

      {/* Phase: title / stable / glitch - 标题显示 */}
      {(p === 'title' || p === 'stable' || p === 'glitch' || p === 'powerOff') && (
        <div
          className="relative flex flex-col items-center gap-8 z-10"
          style={{
            animation: p === 'powerOff' ? 'crtPowerOff 0.7s ease-in forwards' : 'crtPowerOn 0.3s ease-out forwards',
            filter: p === 'glitch'
              ? 'brightness(1.2) contrast(1.1)'
              : 'brightness(1) contrast(1)',
          }}
        >
          {/* 色差偏移层 */}
          {p === 'glitch' && (
            <div className="absolute inset-0 flex flex-col items-center gap-8 pointer-events-none"
              style={{
                animation: 'crtChromatic 0.15s infinite',
              }}
            >
              <h1 className="text-6xl font-bold text-red-500/50 tracking-[0.3em]" style={{ mixBlendMode: 'screen' }}>
                漫长的告别
              </h1>
            </div>
          )}

          {/* 主标题 */}
          <h1
            className="text-6xl font-bold text-text-primary tracking-[0.3em]"
            style={{
              fontFamily: '"MuzaiPixel", "LXGW WenKai", monospace',
              textShadow: '0 0 40px rgba(255,255,255,0.1)',
              animation: p === 'title' ? 'crtTitleResolve 2.2s ease-out forwards' : 'none',
            }}
          >
            {'漫长的告别'.split('').map((char, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  animation: p === 'title' ? `crtCharReveal 0.4s ${0.3 + i * 0.18}s forwards` : 'none',
                  opacity: p === 'title' ? 0 : 1,
                }}
              >
                {char}
              </span>
            ))}
          </h1>

          {/* 副标题 */}
          <p
            className="text-sm font-mono text-text-muted/60 tracking-[0.4em] uppercase"
            style={{
              animation: (p === 'title' || p === 'stable' || p === 'glitch')
                ? 'fadeIn 0.8s 1.5s ease-out forwards'
                : 'none',
              opacity: p === 'title' ? 0 : 1,
            }}
          >
            A Long Farewell
          </p>

          {/* 底部装饰线 */}
          <div
            className="w-[120px] h-px bg-gradient-to-r from-transparent via-text-muted/30 to-transparent mt-4"
            style={{
              animation: (p === 'stable' || p === 'glitch') ? 'fadeIn 1s ease-out forwards' : 'none',
              opacity: p === 'stable' || p === 'glitch' ? 1 : 0,
            }}
          />
        </div>
      )}

      {/* Phase: exit - 退出 */}
      {p === 'exit' && (
        <div
          className="absolute inset-0 bg-bg-primary"
          style={{
            animation: 'fadeOut 0.3s ease-out forwards',
          }}
        />
      )}

      {/* 跳过提示 */}
      {p !== 'exit' && (
        <div className="absolute bottom-8 text-xs text-text-muted/20 animate-pulse tracking-widest">
          点击跳过
        </div>
      )}

      <style>{`
        @keyframes crtWhiteDot {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0.7; }
        }
        @keyframes crtScanlineExpand {
          0% { top: 50%; height: 2px; opacity: 0; }
          15% { opacity: 1; }
          50% { top: 0; height: 100%; opacity: 0.25; }
          85% { opacity: 0.1; }
          100% { top: 0; height: 100%; opacity: 0; }
        }
        @keyframes crtPowerOn {
          0% { opacity: 0; transform: scaleY(0.8); filter: brightness(2); }
          100% { opacity: 1; transform: scaleY(1); filter: brightness(1); }
        }
        @keyframes crtPowerOff {
          0% { transform: scaleY(1); filter: brightness(1.5); opacity: 1; }
          30% { transform: scaleY(0.08); filter: brightness(3); opacity: 0.9; }
          60% { transform: scaleY(0.02); filter: brightness(0.5); opacity: 0.5; }
          100% { transform: scaleY(0); filter: brightness(0); opacity: 0; }
        }
        @keyframes crtChromatic {
          0%, 100% { transform: translate(0); }
          20% { transform: translate(-3px, 1px); }
          40% { transform: translate(2px, -2px); }
          60% { transform: translate(-1px, -1px); }
          80% { transform: translate(2px, 2px); }
        }
        @keyframes crtCharReveal {
          0% { opacity: 0; transform: translateY(8px) scale(0.95); filter: blur(4px); }
          50% { opacity: 0.5; transform: translateY(-2px); filter: blur(1px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes crtTitleResolve {
          0% { filter: blur(8px) brightness(2); }
          100% { filter: blur(0) brightness(1); }
        }
      `}</style>
    </div>
  );
}

/** Canvas 雪花噪声效果 */
function CanvasNoise({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

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

    let frame = 0;
    const draw = () => {
      if (!active) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      frame++;
      // 每 2 帧更新一次，降低 CPU 占用
      if (frame % 2 === 0) {
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 16) {
          const v = Math.random() > 0.5 ? 200 : 0;
          data[i] = v;
          data[i + 1] = v;
          data[i + 2] = v;
          data[i + 3] = Math.random() * 30;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}
