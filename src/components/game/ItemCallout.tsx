import { getItemByReference } from '../../data/itemAssets';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#aaa59e';

export function ItemCallout() {
  const itemRef = useGameStore(state => state.game.currentState.item);
  const item = getItemByReference(itemRef);

  if (!item) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center px-4">
      <div
        className="item-callout clean-modal-frame clean-modal-frame-blue flex max-w-[90vw] select-none items-center gap-5 px-6 py-5"
        style={{
          width: 'min(480px, 90vw)',
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.68))',
          animation: 'itemCalloutIn 180ms steps(3, end) both',
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center border-2 border-[#3a3a42] bg-[#050505]"
          style={{
            width: 132,
            height: 132,
            boxShadow: 'inset 0 0 0 2px #111, 3px 3px 0 #000',
          }}
        >
          <img
            src={assetUrl(`assets/images/items/${item.file}`)}
            alt=""
            style={{
              width: Math.min(item.size.width * 1.25, 112),
              maxHeight: 112,
              objectFit: 'contain',
              imageRendering: 'pixelated',
              filter: 'grayscale(1) contrast(1.16)',
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-serif-cn text-[21px] leading-7 tracking-[0.12em]" style={{ color: TEXT_MAIN }}>
            {item.displayName}
          </div>
          <div className="mt-2 text-[15px] leading-7" style={{ color: TEXT_DIM }}>
            {item.description}
          </div>
          </div>
        </div>
      </div>
  );
}
