import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  PixelModalAction,
  PixelModalContent,
  PixelModalFooter,
  PixelModalHeader,
  PixelModalShell,
} from '../ui/PixelModal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const cancelOwnLayerOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };

    window.addEventListener('keydown', cancelOwnLayerOnEscape, true);
    return () => window.removeEventListener('keydown', cancelOwnLayerOnEscape, true);
  }, [isOpen, onCancel]);

  const stopParentPointerEvent = (event: ReactMouseEvent<HTMLDivElement> | ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      className="confirm-modal-isolation"
      onClick={stopParentPointerEvent}
      onMouseDown={stopParentPointerEvent}
      onPointerDown={stopParentPointerEvent}
    >
      <PixelModalShell
        open={isOpen}
        onClose={onCancel}
        labelledBy="confirm-modal-title"
        className="confirm-modal-shell"
        compact
      >
        <PixelModalHeader
          titleId="confirm-modal-title"
          title={title}
          meta="CONFIRM DESTRUCTIVE ACTION"
          iconSrc="warning"
          onClose={onCancel}
          closeLabel="取消确认"
        />
        <PixelModalContent className="confirm-modal-content">
          <p>{message}</p>
        </PixelModalContent>
        <PixelModalFooter className="confirm-modal-footer">
          <PixelModalAction onClick={onCancel} className="confirm-modal-cancel">
            取消
          </PixelModalAction>
          <PixelModalAction active onClick={onConfirm} className="confirm-modal-confirm">
            确认
          </PixelModalAction>
        </PixelModalFooter>
      </PixelModalShell>
    </div>
  );
}
