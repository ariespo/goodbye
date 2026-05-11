import { useGameStore } from '../../stores/gameStore';

export function StatusPanel() {
  const gameStatus = useGameStore(state => state.game.gameStatus);
  const timeResetCount = useGameStore(state => state.game.history.length);

  const formatTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const staminaPercent = Math.max(0, Math.min(100, gameStatus.stamina));
  const sanityPercent = Math.max(0, Math.min(100, gameStatus.sanity));

  const getBarColor = (value: number, normalColor: string) => {
    return value < 30 ? 'bg-danger' : normalColor;
  };

  return (
    <div
      className="absolute top-5 right-0 w-[200px] bg-bg-primary/85 backdrop-blur-sm border-l border-border-subtle p-4"
      style={{
        boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
      }}
    >
      <div className="mb-5">
        <div className="text-xs text-text-muted uppercase tracking-widest mb-1">当前时间</div>
        <div className="text-sm font-mono text-text-muted">{formatTime(gameStatus.time)}</div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-text-muted uppercase tracking-widest mb-1">体力值</div>
        <div className="text-lg text-text-primary">{gameStatus.stamina}/100</div>
        <div className="w-full h-1 bg-bg-secondary mt-1">
          <div
            className={`h-full transition-all duration-600 ${getBarColor(staminaPercent, 'bg-accent-blue')} ${staminaPercent < 30 ? 'animate-pulse' : ''}`}
            style={{
              width: `${staminaPercent}%`,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-text-muted uppercase tracking-widest mb-1">理智值</div>
        <div className="text-lg text-text-primary">{gameStatus.sanity}/100</div>
        <div className="w-full h-1 bg-bg-secondary mt-1">
          <div
            className={`h-full transition-all duration-600 ${getBarColor(sanityPercent, 'bg-accent-gold')} ${sanityPercent < 30 ? 'animate-pulse' : ''}`}
            style={{
              width: `${sanityPercent}%`,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-text-muted uppercase tracking-widest mb-1">时间重置次数</div>
        <div
          className="text-lg text-accent-gold"
          style={{ textShadow: '0 0 8px rgba(212, 168, 83, 0.3)' }}
        >
          {timeResetCount + 1}
        </div>
      </div>
    </div>
  );
}
