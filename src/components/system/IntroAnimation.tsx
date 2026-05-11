import { useEffect, useState, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';

const PHASES = [
  { name: 'black', duration: 500 },
  { name: 'glitch', duration: 800 },
  { name: 'title', duration: 1200 },
  { name: 'subtitle', duration: 600 },
  { name: 'loading', duration: 2000 },
  { name: 'exit', duration: 800 },
];

export function IntroAnimation() {
  const [phase, setPhase] = useState(0);
  const [skipRequested, setSkipRequested] = useState(false);
  const introPlayed = useGameStore(state => state.ui.introPlayed);
  const setIntroPlayed = useGameStore(state => state.actions.setIntroPlayed);

  useEffect(() => {
    if (introPlayed) return;

    const advancePhase = () => {
      setPhase(prev => {
        if (prev >= PHASES.length - 1) {
          setIntroPlayed(true);
          return prev;
        }
        return prev + 1;
      });
    };

    if (skipRequested) {
      setPhase(PHASES.length - 1);
      setTimeout(() => setIntroPlayed(true), PHASES[PHASES.length - 1].duration);
      return;
    }

    const timer = setTimeout(advancePhase, PHASES[phase].duration);
    return () => clearTimeout(timer);
  }, [phase, skipRequested, introPlayed, setIntroPlayed]);

  const handleSkip = useCallback(() => {
    setSkipRequested(true);
  }, []);

  if (introPlayed) return null;

  const currentPhase = PHASES[phase].name;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-bg-primary flex items-center justify-center"
      style={{
        transition: currentPhase === 'exit' ? 'transform 0.8s ease-in-out' : 'none',
        transform: currentPhase === 'exit' ? 'translateY(-100%)' : 'translateY(0)',
      }}
      onClick={handleSkip}
    >
      {/* Noise overlay */}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
      }} />

      {/* Phase: black - just noise */}
      {currentPhase === 'black' && (
        <div className="w-full h-full" />
      )}

      {/* Phase: glitch - horizontal lines */}
      {currentPhase === 'glitch' && (
        <div className="relative w-full h-full overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 h-px bg-text-primary/30"
              style={{
                top: `${10 + i * 12}%`,
                animation: `glitchLine 0.1s ${i * 0.05}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Phase: title - typewriter effect */}
      {(currentPhase === 'title' || currentPhase === 'subtitle' || currentPhase === 'loading' || currentPhase === 'exit') && (
        <div className="flex flex-col items-center gap-6">
          <h1
            className="text-5xl font-serif-cn text-text-primary tracking-widest"
            style={{
              animation: currentPhase === 'title' ? 'fadeIn 0.3s ease-out forwards' : 'none',
              opacity: currentPhase === 'title' ? 0 : 1,
            }}
          >
            {'漫长的告别'.split('').map((char, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  animation: currentPhase === 'title' ? `charFadeIn 0.3s ${i * 0.15}s forwards` : 'none',
                  opacity: currentPhase === 'title' ? 0 : 1,
                }}
              >
                {char}
              </span>
            ))}
          </h1>

          {(currentPhase === 'subtitle' || currentPhase === 'loading' || currentPhase === 'exit') && (
            <p
              className="text-lg font-mono text-text-muted/50 tracking-wider"
              style={{ animation: 'fadeIn 0.6s ease-out forwards' }}
            >
              A Long Farewell
            </p>
          )}

          {(currentPhase === 'loading' || currentPhase === 'exit') && (
            <div className="w-[200px] h-px bg-border-subtle mt-4">
              <div
                className="h-full bg-accent-gold"
                style={{
                  animation: 'loadingProgress 2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Skip hint */}
      {currentPhase !== 'exit' && (
        <div className="absolute bottom-8 text-xs text-text-muted/30 animate-pulse">
          点击跳过
        </div>
      )}

      <style>{`
        @keyframes glitchLine {
          0%, 100% { transform: translateX(0); opacity: 0.3; }
          50% { transform: translateX(${Math.random() > 0.5 ? '' : '-'}${Math.random() * 20}px); opacity: 0.8; }
        }
        @keyframes loadingProgress {
          0% { width: 0%; }
          50% { width: 60%; }
          70% { width: 75%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
