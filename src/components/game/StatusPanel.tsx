import { useGameStore } from '../../stores/gameStore';

const PANEL_BG = 'rgba(12, 12, 16, 0.88)';
const BORDER = '#3a3a42';
const BORDER_BRIGHT = '#52525c';
const CORNER = '#5a5a64';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#6a6560';
const ACCENT_BLUE = '#6b8fc4';
const ACCENT_GOLD = '#b89858';
const DANGER = '#a85050';

export function StatusPanel() {
  const gameStatus = useGameStore(state => state.game.gameStatus);
  const timeResetCount = useGameStore(state => state.game.history.length);

  const formatTime = (date: Date) =>
    date.toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

  const staminaPercent = Math.max(0, Math.min(100, gameStatus.stamina));
  const sanityPercent = Math.max(0, Math.min(100, gameStatus.sanity));

  const staminaColor = staminaPercent < 30 ? DANGER : ACCENT_BLUE;
  const sanityColor = sanityPercent < 30 ? DANGER : ACCENT_GOLD;

  return (
    <div className="absolute top-4 right-4" style={{ width: 220, zIndex: 25 }}>
      <div
        className="relative"
        style={{
          background: PANEL_BG,
          border: `3px solid ${BORDER}`,
          padding: '18px 20px 16px 20px',
          boxShadow:
            `inset 2px 2px 0 ${BORDER_BRIGHT},` +
            `inset -2px -2px 0 rgba(0,0,0,0.5),` +
            `3px 3px 0 rgba(0,0,0,0.5),` +
            `4px 4px 0 rgba(0,0,0,0.3),` +
            `5px 5px 0 rgba(0,0,0,0.15)`,
        }}
      >
        {/* 标题 */}
        <div
          className="mb-4 pb-2"
          style={{
            borderBottom: `2px solid ${BORDER}`,
            fontFamily: '"MuzaiPixel", monospace',
            fontSize: '15px',
            letterSpacing: '0.3em',
            color: TEXT_DIM,
            textTransform: 'uppercase',
          }}
        >
          状态
        </div>

        {/* 时间 */}
        <div className="mb-4">
          <div style={{ fontSize: '14px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.2em', marginBottom: 4 }}>
            当前时间
          </div>
          <div style={{ fontSize: '20px', color: TEXT_MAIN, fontFamily: '"MuzaiPixel", "LXGW WenKai", monospace' }}>
            {formatTime(gameStatus.time)}
          </div>
        </div>

        {/* 体力 */}
        <PixelBar
          label="体力"
          value={gameStatus.stamina}
          percent={staminaPercent}
          color={staminaColor}
          danger={staminaPercent < 30}
        />

        {/* 理智 */}
        <PixelBar
          label="理智"
          value={gameStatus.sanity}
          percent={sanityPercent}
          color={sanityColor}
          danger={sanityPercent < 30}
        />

        {/* 轮回次数 */}
        <div className="mt-4 pt-3" style={{ borderTop: `2px solid ${BORDER}` }}>
          <div style={{ fontSize: '14px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.2em', marginBottom: 4 }}>
            时间重置次数
          </div>
          <div style={{ fontSize: '30px', color: ACCENT_GOLD, fontFamily: '"MuzaiPixel", monospace', textShadow: '0 0 8px rgba(184,152,88,0.25)' }}>
            {timeResetCount + 1}
          </div>
        </div>
      </div>

      {/* 四角装饰 */}
      <PixelCorners />
    </div>
  );
}

/* ── 分段式像素条 ── */

function PixelBar({ label, value, percent, color, danger }: {
  label: string; value: number; percent: number; color: string; danger: boolean;
}) {
  const segments = 20;
  const filled = Math.round((percent / 100) * segments);

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1.5">
        <span style={{ fontSize: '14px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.2em' }}>
          {label}
        </span>
        <span style={{
          fontSize: '20px', color: danger ? DANGER : TEXT_MAIN, fontFamily: '"MuzaiPixel", monospace',
          animation: danger ? 'pulse 1.2s infinite' : 'none',
        }}>
          {value}<span style={{ color: TEXT_DIM }}>/100</span>
        </span>
      </div>

      {/* 分段条 */}
      <div className="flex gap-[2px]" style={{ height: 8 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              background: i < filled ? color : 'rgba(255,255,255,0.04)',
              opacity: i < filled ? 1 : 0.5,
              boxShadow: i < filled ? `inset 1px 1px 0 rgba(255,255,255,0.15)` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 四角装饰 ── */

function PixelCorners() {
  const c = CORNER;
  const s = 8;
  const w = 3;
  return (
    <>
      <div style={{ position: 'absolute', top: -3, left: -3, width: s, height: w, background: c }} />
      <div style={{ position: 'absolute', top: -3, left: -3, width: w, height: s, background: c }} />
      <div style={{ position: 'absolute', top: -3, right: -3, width: s, height: w, background: c }} />
      <div style={{ position: 'absolute', top: -3, right: -1, width: w, height: s, background: c }} />
      <div style={{ position: 'absolute', bottom: -3, left: -3, width: s, height: w, background: c }} />
      <div style={{ position: 'absolute', bottom: -1, left: -3, width: w, height: s, background: c }} />
      <div style={{ position: 'absolute', bottom: -3, right: -3, width: s, height: w, background: c }} />
      <div style={{ position: 'absolute', bottom: -1, right: -1, width: w, height: s, background: c }} />
    </>
  );
}
