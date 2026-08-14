import { useGameStore } from '../../stores/gameStore';

export function LoadingOverlay() {
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const isStreaming = useGameStore(state => state.api.isStreaming);

  const active = isWaitingForAI || isStreaming;
  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-[100] flex flex-col items-center justify-center pointer-events-auto"
      style={{
        background: 'rgba(12, 12, 18, 0.6)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div className="relative flex flex-col items-center gap-4"
        style={{
          padding: '32px 48px',
          background: 'rgba(12, 12, 18, 0.9)',
          border: '2px solid #3a3a42',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.03), inset 1px 1px 0 rgba(255,255,255,0.05), 4px 4px 0 rgba(0,0,0,0.4)',
        }}
      >
        <PixelHourglass />
        <div
          style={{
            color: '#6b8fc4',
            fontSize: '16px',
            letterSpacing: '0.15em',
            fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
          }}
        >
          世界推演中
        </div>
        <div
          style={{
            color: '#6a6560',
            fontSize: '12px',
            letterSpacing: '0.1em',
          }}
        >
          请勿操作...
        </div>
      </div>
    </div>
  );
}

const HOURGLASS_FRAME = [
  [2, 1, 12, 2], [3, 3, 2, 2], [11, 3, 2, 2], [4, 5, 2, 2], [10, 5, 2, 2],
  [5, 7, 2, 2], [9, 7, 2, 2], [7, 9, 2, 2], [5, 11, 2, 2], [9, 11, 2, 2],
  [4, 13, 2, 2], [10, 13, 2, 2], [3, 15, 2, 2], [11, 15, 2, 2], [2, 17, 12, 2],
] as const;

const SAND_FRAMES = [
  [[5, 4, 6, 1], [6, 5, 4, 1], [6, 6, 4, 1], [7, 7, 2, 1], [7, 8, 2, 1], [7, 16, 2, 1]],
  [[6, 4, 4, 1], [6, 5, 4, 1], [7, 6, 2, 1], [7, 8, 2, 1], [7, 10, 2, 2], [7, 16, 2, 1]],
  [[7, 4, 2, 1], [7, 5, 2, 1], [7, 8, 2, 1], [7, 10, 2, 3], [6, 15, 4, 1], [5, 16, 6, 1]],
  [[7, 8, 2, 1], [7, 10, 2, 3], [7, 14, 2, 1], [6, 15, 4, 1], [5, 16, 6, 1]],
  [[7, 10, 2, 2], [7, 13, 2, 1], [6, 14, 4, 1], [6, 15, 4, 1], [5, 16, 6, 1]],
  [[7, 12, 2, 1], [7, 13, 2, 1], [6, 14, 4, 1], [6, 15, 4, 1], [5, 16, 6, 1]],
] as const;

export function PixelHourglass() {
  return (
    <div
      className="pixel-hourglass"
      role="img"
      aria-label="世界推演中，沙漏运转"
      data-frame-count={SAND_FRAMES.length}
    >
      <svg viewBox="0 0 16 20" width="56" height="70" shapeRendering="crispEdges" aria-hidden="true">
        <rect width="16" height="20" fill="#050505" />
        <g fill="#d8d8d8">
          {HOURGLASS_FRAME.map(([x, y, width, height], index) => (
            <rect key={index} x={x} y={y} width={width} height={height} />
          ))}
        </g>
        {SAND_FRAMES.map((pixels, frameIndex) => (
          <g
            key={frameIndex}
            className={`pixel-hourglass__sand-frame${frameIndex === 0 ? ' is-first' : ''}`}
            style={{ animationDelay: `${frameIndex * 300}ms` }}
            fill="#fff"
          >
            {pixels.map(([x, y, width, height], pixelIndex) => (
              <rect key={pixelIndex} x={x} y={y} width={width} height={height} />
            ))}
          </g>
        ))}
      </svg>
      <style>{`
        .pixel-hourglass {
          display: grid;
          place-items: center;
          width: 64px;
          height: 78px;
          padding: 4px;
          border: 2px solid #6f6f6f;
          background: #050505;
          box-shadow: inset 0 0 0 2px #151515, 4px 4px 0 #000;
          image-rendering: pixelated;
        }
        .pixel-hourglass svg {
          animation: pixelHourglassFlip 1.8s linear infinite;
          transform-origin: center;
        }
        .pixel-hourglass__sand-frame {
          opacity: 0;
          animation: pixelHourglassFrame 1.8s steps(1, end) infinite;
        }
        @keyframes pixelHourglassFrame {
          0%, 16.666% { opacity: 1; }
          16.667%, 100% { opacity: 0; }
        }
        @keyframes pixelHourglassFlip {
          0%, 83.332% { transform: rotate(0deg); }
          83.333%, 91.665% { transform: rotate(90deg); }
          91.666%, 100% { transform: rotate(180deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pixel-hourglass svg,
          .pixel-hourglass__sand-frame { animation: none; }
          .pixel-hourglass__sand-frame.is-first { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
