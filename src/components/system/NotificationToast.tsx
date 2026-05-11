import { useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { X, Info, CheckCircle, Warning, XCircle } from '@phosphor-icons/react';

const icons = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  error: XCircle,
};

const colors = {
  info: 'border-accent-blue',
  success: 'border-green-500',
  warning: 'border-accent-gold',
  error: 'border-danger',
};

const iconColors = {
  info: 'text-accent-blue',
  success: 'text-green-500',
  warning: 'text-accent-gold',
  error: 'text-danger',
};

export function NotificationToast() {
  const notifications = useGameStore(state => state.ui.notifications);
  const removeNotification = useGameStore(state => state.actions.removeNotification);

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {notifications.map((notification) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
        />
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
  const Icon = icons[notification.type];

  useEffect(() => {
    const timer = setTimeout(onClose, notification.duration);
    return () => clearTimeout(timer);
  }, [notification.duration, onClose]);

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 bg-bg-secondary/95 backdrop-blur-sm border-l-[3px] ${colors[notification.type]} min-w-[320px] max-w-[480px] animate-[slideInUp_0.3s_ease-out]`}
      style={{
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
      }}
    >
      <Icon size={20} className={iconColors[notification.type]} weight="fill" />
      <span className="flex-1 text-sm text-text-primary font-mono">{notification.message}</span>
      <button
        onClick={onClose}
        className="text-text-muted hover:text-text-primary hover:rotate-90 transition-all duration-200"
      >
        <X size={16} />
      </button>
    </div>
  );
}
