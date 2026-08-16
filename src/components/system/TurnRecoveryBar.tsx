import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { GameIcon } from '../ui/GameIcon';

const ACCENT_ERROR = '#c94f4f';
const ACCENT_WARNING = '#d4a853';

export function TurnRecoveryBar() {
  const recovery = useGameStore(state => state.api.turnRecovery);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { retryTurn, regenerateTurn, dismissRecovery } = useGameLoop();
  const [busy, setBusy] = useState(false);

  if (recovery.phase === 'idle') return null;

  const isBlocked = recovery.phase === 'blocked_pipeline';
  const accent = isBlocked ? ACCENT_WARNING : ACCENT_ERROR;
  const disabled = busy || isWaitingForAI;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 w-[min(560px,92vw)]">
      <div
        className="flex flex-col gap-2 px-5 py-3"
        style={{
          background: isBlocked ? 'rgba(36, 28, 12, 0.96)' : 'rgba(40, 16, 16, 0.96)',
          border: `2px solid ${accent}`,
          outline: '2px solid #090909',
          outlineOffset: '2px',
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06), 4px 4px 0 #050505, 0 0 18px ${accent}33`,
          color: '#efefe9',
        }}
      >
        <div className="flex items-start gap-3">
          <GameIcon name={isBlocked ? 'warning' : 'error'} size={19} style={{ color: accent, flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1 min-w-0">
            <div className="font-mono text-sm font-semibold" style={{ color: accent }}>
              {isBlocked ? '剧情编排被安全闸拦截' : '本回合生成失败'}
            </div>
            {recovery.errorMessage && (
              <div className="mt-1 font-mono text-xs whitespace-pre-wrap break-words max-h-24 overflow-y-auto" style={{ color: '#c9c4bc' }}>
                {recovery.errorMessage}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {isBlocked ? (
            <RecoveryButton accent={accent} disabled={disabled} onClick={() => run(() => retryTurn())}>
              重试编排
            </RecoveryButton>
          ) : recovery.repairable ? (
            <>
              <RecoveryButton accent={accent} disabled={disabled} onClick={() => run(() => retryTurn())}>
                继续修复
              </RecoveryButton>
              <RecoveryButton accent="#b7a98f" disabled={disabled} onClick={() => run(() => regenerateTurn())}>
                重新生成
              </RecoveryButton>
            </>
          ) : (
            <RecoveryButton accent={accent} disabled={disabled} onClick={() => run(() => retryTurn())}>
              重试本回合
            </RecoveryButton>
          )}
          <RecoveryButton accent="#8a8580" disabled={disabled} onClick={() => run(dismissRecovery)}>
            放弃并撤回输入
          </RecoveryButton>
        </div>
      </div>
    </div>
  );
}

function RecoveryButton({ accent, disabled, onClick, children }: {
  accent: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-cursor="pointer"
      className="px-3 py-1.5 font-mono text-xs font-semibold transition-colors"
      style={{
        color: disabled ? '#6a655f' : accent,
        border: `2px solid ${disabled ? '#4a453f' : accent}`,
        background: 'rgba(0,0,0,0.35)',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
