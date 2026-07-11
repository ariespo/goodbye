import { useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { GameIcon, type GameIconName } from '../ui/GameIcon';

const iconByType: Record<'info' | 'success' | 'warning' | 'error', GameIconName> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'error',
};

const colorByType = {
  info: '#86a8f2',
  success: '#5cb074',
  warning: '#d4a853',
  error: '#c94f4f',
};

const bgByType = {
  info: 'rgba(18, 28, 48, 0.96)',
  success: 'rgba(14, 32, 22, 0.96)',
  warning: 'rgba(36, 28, 12, 0.96)',
  error: 'rgba(40, 16, 16, 0.96)',
};

export function NotificationToast() {
  const notifications = useGameStore(state => state.ui.notifications);
  const removeNotification = useGameStore(state => state.actions.removeNotification);

  return (
    <div className="fixed left-1/2 top-6 z-[100] flex -translate-x-1/2 flex-col gap-2">
      {notifications.map(notification => (
        <ToastItem key={notification.id} notification={notification} onClose={() => removeNotification(notification.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  notification,
  onClose,
}: {
  notification: { id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string; duration: number };
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, notification.duration);
    return () => clearTimeout(timer);
  }, [notification.duration, onClose]);

  const accent = colorByType[notification.type];

  return (
    <div
      className="game-toast flex min-h-[56px] min-w-[320px] max-w-[480px] items-center gap-3 px-5 py-3 animate-[slideInUp_0.3s_ease-out]"
      data-type={notification.type}
      style={{
        background: bgByType[notification.type],
        border: `2px solid ${accent}`,
        outline: '2px solid #090909',
        outlineOffset: '2px',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06), 4px 4px 0 #050505, 0 0 18px ${accent}33`,
        color: '#efefe9',
      }}
    >
      <GameIcon name={iconByType[notification.type]} size={19} style={{ color: accent, flexShrink: 0 }} />
      <span className="flex-1 font-mono text-sm" style={{ color: accent === colorByType.info ? '#e8e4dc' : accent, fontWeight: 600 }}>
        {notification.message}
      </span>
      <button
        type="button"
        onClick={onClose}
        data-cursor="pointer"
        className="transition-colors"
        style={{ color: '#8a8580', cursor: 'pointer' }}
      >
        <GameIcon name="close" size={14} />
      </button>
    </div>
  );
}
