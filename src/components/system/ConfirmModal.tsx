import { Warning } from '@phosphor-icons/react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}
    >
      <div
        className="w-[400px] bg-bg-primary border border-border-subtle p-6 animate-[scaleIn_0.3s_ease-out]"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <Warning size={24} className="text-accent-gold" />
          <h2 className="text-lg font-serif-cn text-text-primary">{title}</h2>
        </div>

        <p className="text-sm text-text-muted mb-6 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-muted transition-all"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-danger text-bg-primary hover:bg-danger/80 transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
