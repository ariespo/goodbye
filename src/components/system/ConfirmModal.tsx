import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';
import { PixelButton } from '../ui/PixelButton';

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
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 45%, rgba(58,24,24,0.28), rgba(0,0,0,0.86) 62%)' }}
      onClick={onCancel}
    >
      <div
        className="clean-modal-frame clean-modal-frame-danger relative h-[250px] w-[430px] max-w-[92vw] animate-[scaleIn_0.3s_ease-out] px-8 py-7"
        style={{
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 22px 48px rgba(0,0,0,0.68))',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center text-[#d4a853]" style={{ backgroundImage: `url(${assetUrl('assets/ui/action-slot-gold-hover.png')})`, backgroundSize: '100% 100%' }}>
            <GameIcon name="warning" size={22} />
          </div>
          <h2 className="font-serif-cn text-[20px] tracking-[0.14em] text-[#e8e4dc]">{title}</h2>
        </div>

        <p className="mb-7 min-h-[52px] text-sm leading-relaxed text-[#aaa39a]">{message}</p>

        <div className="flex justify-end gap-3">
          <PixelButton variant="gold" onClick={onCancel} className="h-10 px-5 tracking-[0.12em]" style={{ fontWeight: 400 }}>
            取消
          </PixelButton>
          <PixelButton variant="red" onClick={onConfirm} className="h-10 px-5 tracking-[0.12em]" style={{ fontWeight: 400 }}>
            确认
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
