import { useEffect, useState, useCallback, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';

const PHASES = [
  { name: 'black', duration: 800 },
  { name: 'bloom', duration: 1500 },
  { name: 'whiteout', duration: 600 },
  { name: 'resolve', duration: 2000 },
  { name: 'hold', duration: 1200 },
  { name: 'fade', duration: 1000 },
  { name: 'exit', duration: 400 },
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
      timerRef.current = setTimeout(() => setIntroPlayed(true), PHASES[PHASES.length - 1].duration);
      return;
    }
    if (phase >= PHASES.length - 1) {
      timerRef.current = setTimeout(() => setIntroPlayed(true), PHASES[phase].duration);
      return;
    }
    timerRef.current = setTimeout(() => setPhase(prev => prev + 1), PHASES[phase].duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
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
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden"
      style={{ background: '#0a0a0c' }}
      onClick={handleSkip}
    >
      {/* 阶段：纯黑 */}
      {p === 'black' && <div className="absolute inset-0 bg-black" />}

      {/* 阶段：微光绽放 — 像放映机灯泡逐渐亮起 */}
      {(p === 'bloom' || p === 'whiteout') && (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(232,228,220,0.15) 0%, transparent 70%)',
            animation: p === 'bloom' ? 'projectorBloom 1.5s ease-out forwards' : 'none',
            opacity: p === 'whiteout' ? 1 : undefined,
          }}
        />
      )}

      {/* 阶段：过曝白屏 */}
      {(p === 'whiteout' || p === 'resolve') && (
        <div
          className="absolute inset-0 bg-[#e8e4dc]"
          style={{
            animation: p === 'whiteout'
              ? 'whiteoutFlash 0.6s ease-out forwards'
              : p === 'resolve'
                ? 'whiteoutSettle 2s ease-out forwards'
                : 'none',
          }}
        />
      )}

      {/* 阶段：resolve / hold / fade — 标题在白屏中浮现 */}
      {(p === 'resolve' || p === 'hold' || p === 'fade') && (
        <div className="relative flex flex-col items-center gap-5 z-10"
          style={{
            animation: p === 'fade' ? 'titleFadeOut 1s ease-in forwards' : 'none',
          }}
        >
          {/* 主标题 — 从白底上"浮现"出来（用深色文字+轻微阴影制造雕刻感） */}
          <h1
            className="text-6xl md:text-7xl font-bold tracking-[0.4em]"
            style={{
              fontFamily: '"MuzaiPixel", "Noto Serif SC", serif',
              color: '#1a1a1f',
              textShadow: '0 0 40px rgba(26,26,31,0.15), 0 1px 2px rgba(255,255,255,0.5)',
              animation: p === 'resolve' ? 'titleCarve 2s ease-out forwards' : 'none',
              opacity: p === 'resolve' ? 0 : 1,
            }}
          >
            {'漫长的告别'.split('').map((char, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  animation: p === 'resolve' ? `charCarve 0.6s ${0.4 + i * 0.14}s ease-out forwards` : 'none',
                  opacity: p === 'resolve' ? 0 : 1,
                  transform: p === 'resolve' ? 'translateY(6px)' : 'none',
                }}
              >
                {char}
              </span>
            ))}
          </h1>

          {/* 副标题 */}
          <p
            className="text-xs tracking-[0.6em] uppercase"
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              color: '#6b6b75',
              animation: (p === 'resolve' || p === 'hold') ? 'fadeIn 1s 1.8s ease-out forwards' : 'none',
              opacity: p === 'resolve' ? 0 : 1,
            }}
          >
            A Long Farewell
          </p>

          {/* 底部细线 */}
          <div
            className="w-[80px] h-px mt-2"
            style={{
              background: 'linear-gradient(90deg, transparent, #b0aba5, transparent)',
              animation: (p === 'resolve' || p === 'hold') ? 'fadeIn 1s 2.2s ease-out forwards' : 'none',
              opacity: p === 'resolve' ? 0 : 1,
            }}
          />
        </div>
      )}

      {/* 阶段：exit */}
      {p === 'exit' && (
        <div className="absolute inset-0 bg-[#0a0a0c]" style={{ animation: 'fadeIn 0.4s ease-out forwards' }} />
      )}

      {/* 胶片颗粒覆盖层（全阶段） */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      {/* 跳过提示 */}
      {p !== 'exit' && (
        <div className="absolute bottom-8 text-[10px] text-white/10 tracking-[0.3em] animate-pulse">
          点击跳过
        </div>
      )}

      <style>{`
        @keyframes projectorBloom {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 0.6; }
          100% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes whiteoutFlash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0.95; }
        }
        @keyframes whiteoutSettle {
          0% { opacity: 0.95; }
          100% { opacity: 0.85; }
        }
        @keyframes titleCarve {
          0% { opacity: 0; filter: blur(6px); }
          100% { opacity: 1; filter: blur(0); }
        }
        @keyframes charCarve {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes titleFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
