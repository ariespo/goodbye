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
        {/* 像素风 spinner */}
        <PixelSpinner />
        <div
          style={{
            color: '#6b8fc4',
            fontSize: '16px',
            letterSpacing: '0.15em',
            fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
          }}
        >
          {isStreaming ? '天道流转中' : '准备中'}
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

function PixelSpinner() {
  return (
    <div className="relative" style={{ width: 40, height: 40 }}>
      <div
        className="absolute inset-0"
        style={{
          border: '3px solid transparent',
          borderTopColor: '#6b8fc4',
          borderRightColor: '#6b8fc4',
          animation: 'spin 1.2s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
