import { useEffect, useRef, useState } from 'react';
import { useGameLoop } from '../../hooks/useGameLoop';
import { useGameStore } from '../../stores/gameStore';
import { PixelFrame, PixelFrameRails } from '../ui/PixelFrame';

export function FreeActionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { sendMessage } = useGameLoop();

  useEffect(() => {
    if (!open) return;
    setInput('');
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const message = input.trim();
    if (!message || isWaitingForAI) return;
    sendMessage(message);
    onClose();
  };

  return (
    <div className="free-action-dialog" role="dialog" aria-label="自由行动" aria-modal="true">
      <button type="button" className="free-action-dialog__backdrop" aria-label="关闭自由行动" onClick={onClose} />
      <PixelFrame variant="panel" className="free-action-dialog__panel">
        <div className="free-action-dialog__title"><span>自由</span><small>输入你想做的事</small></div>
        <textarea
          ref={inputRef}
          aria-label="自由行动"
          value={input}
          rows={3}
          maxLength={500}
          disabled={isWaitingForAI}
          placeholder={isWaitingForAI ? 'AI 思考中……' : '输入你想做的事……'}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="free-action-dialog__controls">
          <button type="button" onClick={onClose}>
            <PixelFrameRails />
            <span>取消</span>
          </button>
          <button type="button" aria-label="确认自由行动" disabled={!input.trim() || isWaitingForAI} onClick={submit}>
            <PixelFrameRails />
            <span>确认</span>
          </button>
        </div>
      </PixelFrame>
    </div>
  );
}
