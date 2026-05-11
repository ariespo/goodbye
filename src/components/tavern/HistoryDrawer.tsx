import { useGameStore } from '../../stores/gameStore';
import { X } from '@phosphor-icons/react';

export function HistoryDrawer() {
  const history = useGameStore(state => state.game.history);
  const showHistory = useGameStore(state => state.ui.showHistory);
  const toggleModal = useGameStore(state => state.actions.toggleModal);

  if (!showHistory) return null;

  return (
    <div className="fixed inset-y-0 left-0 z-[200] w-[320px] bg-bg-primary/95 backdrop-blur-sm border-r border-border-subtle animate-[slideInLeft_0.35s_ease-out]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-serif-cn text-text-primary">历史记录</h2>
        <button onClick={() => toggleModal('history')} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
      </div>

      <div className="overflow-y-auto h-[calc(100%-48px)]">
        {history.length === 0 ? (
          <div className="text-center text-text-muted py-8">暂无历史记录</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {[...history].reverse().map((snapshot, idx) => (
              <div key={idx} className="px-4 py-3 hover:bg-bg-secondary transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-accent-blue font-mono">回合 {snapshot.turnIndex + 1}</span>
                  <span className="text-xs text-text-muted">{new Date(snapshot.timestamp).toLocaleTimeString('zh-CN')}</span>
                </div>
                <div className="text-sm text-text-primary truncate">{snapshot.summary}</div>
                <div className="text-xs text-text-muted mt-1">
                  体力: {snapshot.gameStatus.stamina} | 理智: {snapshot.gameStatus.sanity}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
