import { useId } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../utils/assetUrl';
import type { ItemAsset } from '../../data/itemAssets';
import { PixelModalContent, PixelModalHeader, PixelModalShell } from '../ui/PixelModal';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#8a8580';
const BLUE = '#86a8f2';

export function ItemViewer({ item, onClose }: { item: ItemAsset; onClose: () => void }) {
  const titleId = useId();
  // The scaled HUD ignores pointer input and sits below mobile modal portals.
  // Keep the detail in viewport coordinates, above its investigation parent.
  return createPortal(
    <PixelModalShell
      open
      onClose={onClose}
      labelledBy={titleId}
      className="item-viewer-shell"
    >
      <PixelModalHeader
        titleId={titleId}
        title={item.displayName}
        meta={`${item.file} / ${item.priority}`}
        onClose={onClose}
        closeLabel="关闭物件详情"
      />
      <PixelModalContent className="item-viewer">
        <div className="item-viewer-body flex flex-col gap-5 sm:flex-row">
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
      </PixelModalContent>
    </PixelModalShell>,
    document.body,
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
