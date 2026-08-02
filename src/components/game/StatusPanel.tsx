import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { PixelFrame } from '../ui/PixelFrame';
import { GameIcon } from '../ui/GameIcon';
import { normalizeLocationId } from '../../data/locations';
import { getCurrentLocationPresentation } from '../../data/playerKnowledge';

const TEXT_MAIN = '#e2ded6';
const TEXT_DIM = '#aaa59e';
const BLUE = '#86a8f2';
const GOLD = '#d4a853';
const DANGER = '#c94f4f';

export function StatusPanel() {
  const gameStatus = useGameStore(state => state.game.gameStatus);
  const variables = useGameStore(state => state.tavern.variables);
  const locationId = normalizeLocationId(variables.location);
  const cycleCount = useGameStore(state => Number(state.tavern.variables.cycleCount ?? 1));
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const previousRef = useRef({
    time: gameStatus.time.getTime(),
    stamina: gameStatus.stamina,
    sanity: gameStatus.sanity,
    locationId,
    cycleCount,
  });
  const [changes, setChanges] = useState<Record<string, 'up' | 'down' | 'changed'>>({});

  useEffect(() => {
    const previous = previousRef.current;
    const next: Record<string, 'up' | 'down' | 'changed'> = {};
    const direction = (value: number, oldValue: number) => value > oldValue ? 'up' : 'down';
    if (gameStatus.stamina !== previous.stamina) next.stamina = direction(gameStatus.stamina, previous.stamina);
    if (gameStatus.sanity !== previous.sanity) next.sanity = direction(gameStatus.sanity, previous.sanity);
    if (gameStatus.time.getTime() !== previous.time) next.time = 'changed';
    if (locationId !== previous.locationId) next.location = 'changed';
    if (cycleCount !== previous.cycleCount) next.cycle = direction(cycleCount, previous.cycleCount);
    previousRef.current = { time: gameStatus.time.getTime(), stamina: gameStatus.stamina, sanity: gameStatus.sanity, locationId, cycleCount };
    if (Object.keys(next).length === 0) return;
    setChanges(next);
    const timer = window.setTimeout(() => setChanges({}), 1050);
    return () => window.clearTimeout(timer);
  }, [cycleCount, gameStatus.sanity, gameStatus.stamina, gameStatus.time, locationId]);

  const formatTime = (date: Date) =>
    date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const staminaPercent = Math.max(0, Math.min(100, gameStatus.stamina));
  const sanityPercent = Math.max(0, Math.min(100, gameStatus.sanity));
  const currentLocation = getCurrentLocationPresentation(variables);

  return (
    <aside className={`status-panel ${mobileExpanded ? 'is-expanded' : 'is-collapsed'} absolute right-4 top-4 z-25 w-[252px] select-none`}>
      <button
        type="button"
        aria-label={mobileExpanded ? '收起状态' : '展开状态'}
        data-cursor="pointer"
        className="status-panel-toggle"
        onClick={() => setMobileExpanded(value => !value)}
      >
        <GameIcon name={mobileExpanded ? "close" : "info"} size={20} />
      </button>
      <PixelFrame
        variant="panel"
        className="status-panel-frame"
        contentStyle={{ padding: '18px 18px 16px 18px' }}
        style={{
          boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 6px 6px 0 rgba(0,0,0,0.45), 0 0 28px rgba(0,0,0,0.45)',
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <StatusChip tone="blue">STATUS</StatusChip>
          <span
            className={`font-mono status-reactive ${changes.cycle ? `is-${changes.cycle}` : ''}`}
            style={{
              color: TEXT_DIM,
              fontSize: 12,
              letterSpacing: '0.12em',
            }}
          >
            LOOP {String(cycleCount).padStart(2, '0')}
          </span>
        </div>

        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span style={microLabelStyle}>当前时间</span>
            <span style={{ ...microLabelStyle, color: GOLD }}>FILM</span>
          </div>
          <div
            className={`status-reactive ${changes.time ? 'is-changed' : ''}`}
            style={{
              color: TEXT_MAIN,
              fontFamily: '"MuzaiPixel", "LXGW WenKai", monospace',
              fontSize: 18,
              lineHeight: 1.45,
              textShadow: '0 2px 0 rgba(0,0,0,0.75)',
            }}
          >
            {formatTime(gameStatus.time)}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-[#25252d] pt-1.5">
            <span style={{ ...microLabelStyle, fontSize: 11 }}>当前位置</span>
            <span className={`truncate text-[13px] text-[#86a8f2] status-reactive ${changes.location ? 'is-changed' : ''}`}>{currentLocation.shortName}</span>
          </div>
        </div>

        <PixelMeter label="体力" value={gameStatus.stamina} percent={staminaPercent} tone="blue" change={changes.stamina} />
        <PixelMeter label="理智" value={gameStatus.sanity} percent={sanityPercent} tone="gold" change={changes.sanity} />

        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3 border-t-2 border-[#25252d] pt-3">
          <div>
            <div style={microLabelStyle}>时间重置次数</div>
            <div style={{ color: TEXT_DIM, fontSize: 13, fontFamily: '"LXGW WenKai", serif' }}>
              记忆残片同步中
            </div>
          </div>
          <div
            className={`status-reactive ${changes.cycle ? `is-${changes.cycle}` : ''}`}
            style={{
              minWidth: 58,
              color: GOLD,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 30,
              lineHeight: 1,
              textAlign: 'right',
              textShadow: '0 0 12px rgba(212,168,83,0.32)',
            }}
          >
            {cycleCount}
          </div>
        </div>
      </PixelFrame>
    </aside>
  );
}

const microLabelStyle = {
  color: TEXT_DIM,
  fontFamily: '"MuzaiPixel", "JetBrains Mono", monospace',
  fontSize: 13,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
};

function StatusChip({ children, tone }: { children: string; tone: 'blue' | 'gold' | 'red' }) {
  return (
    <span
      className="inline-flex h-7 items-center px-3"
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/status-chip-${tone}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        color: tone === 'gold' ? GOLD : tone === 'red' ? DANGER : BLUE,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        letterSpacing: '0.16em',
        imageRendering: 'pixelated',
      }}
    >
      {children}
    </span>
  );
}

function PixelMeter({ label, value, percent, tone, change }: {
  label: string;
  value: number;
  percent: number;
  tone: 'blue' | 'gold';
  change?: 'up' | 'down' | 'changed';
}) {
  const danger = percent < 30;
  const accent = danger ? DANGER : tone === 'blue' ? BLUE : GOLD;
  const shell = tone === 'blue' ? 'meter-shell-blue.png' : 'meter-shell-gold.png';
  const segments = 18;
  const filled = Math.round((percent / 100) * segments);

  return (
    <div className={`mb-4 status-meter ${change ? `is-${change}` : ''}`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span style={microLabelStyle}>{label}</span>
        <span
          style={{
            color: danger ? DANGER : TEXT_MAIN,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 18,
            animation: danger ? 'pulse 1.1s infinite' : 'none',
          }}
        >
          {Math.round(value)}<span style={{ color: TEXT_DIM, fontSize: 12 }}>/100</span>
        </span>
      </div>
      <div
        className="relative flex items-center gap-[3px] px-[10px]"
        style={{
          height: 22,
          backgroundImage: `url(${assetUrl(`assets/ui/${shell}`)})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
        }}
      >
        {Array.from({ length: segments }).map((_, index) => (
          <span
            key={index}
            className="h-[8px] flex-1"
            style={{
              background: index < filled ? accent : 'rgba(255,255,255,0.06)',
              opacity: index < filled ? 1 : 0.42,
              boxShadow: index < filled ? `0 0 8px ${accent}44, inset 1px 1px 0 rgba(255,255,255,0.22)` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
