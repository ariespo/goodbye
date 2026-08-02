import { assetUrl } from '../../utils/assetUrl';
import type { ItemAsset } from '../../data/itemAssets';
import { GameIcon } from '../ui/GameIcon';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#8a8580';
const BLUE = '#86a8f2';

export function ItemViewer({ item, onClose }: { item: ItemAsset; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 45%, rgba(20,24,32,0.46), rgba(0,0,0,0.9) 64%)' }}
      onClick={onClose}
    >
      <div
        className="item-viewer clean-modal-frame clean-modal-frame-blue relative w-[520px] max-w-[94vw] select-none px-7 py-6"
        onClick={event => event.stopPropagation()}
        style={{
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 24px 54px rgba(0,0,0,0.66))',
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-[#25252d] pb-3">
          <div>
            <h2 className="font-serif-cn text-[22px] tracking-[0.14em]" style={{ color: TEXT_MAIN }}>
              {item.displayName}
            </h2>
            <div className="mt-1 font-mono text-[11px] tracking-[0.14em]" style={{ color: TEXT_DIM }}>
              {item.file} / {item.priority}
            </div>
          </div>
          <button onClick={onClose} data-cursor="pointer" className="pixel-close-button flex h-9 w-9 items-center justify-center" style={{ cursor: 'pointer' }}>
            <GameIcon name="close" size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row">
          <div
            className="flex shrink-0 items-center justify-center border-2 border-[#3a3a42] bg-[#050505]"
            style={{
              width: 180,
              minHeight: 180,
              boxShadow: 'inset 0 0 0 2px #111, 4px 4px 0 #000',
            }}
          >
            <img
              src={assetUrl(`assets/images/items/${item.file}`)}
              alt={item.displayName}
              style={{
                width: Math.min(item.size.width * 1.5, 150),
                height: 'auto',
                imageRendering: 'pixelated',
                filter: 'grayscale(1) contrast(1.18)',
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-4 text-[17px] leading-8" style={{ color: TEXT_MAIN }}>
              {item.description}
            </div>
            <div className="grid gap-2 text-[13px]" style={{ color: TEXT_DIM }}>
              <Meta label="场景" value={item.scene} />
              <Meta label="对象" value={item.object} />
              <Meta label="尺寸" value={`${item.size.width} x ${item.size.height}`} />
              {item.round && <Meta label="轮次" value={item.round} />}
              <Meta label="标签" value={item.tags.join(', ')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: BLUE }}>{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}
