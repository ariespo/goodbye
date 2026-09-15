import { useEffect, useRef } from 'react';
import { getItemByReference } from '../../data/itemAssets';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#aaa59e';

export function ItemCallout() {
  const itemRef = useGameStore(state => state.game.currentState.item);
  const setCurrentState = useGameStore(state => state.actions.setCurrentState);
  const item = getItemByReference(itemRef);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!item) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardRef.current?.contains(event.target)) {
        setCurrentState({ item: null });
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCurrentState({ item: null });
    };
    // Pointer-down runs before a dialogue click, so dismissal never clears an
    // item introduced by that click's next line.
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [item, setCurrentState]);

  if (!item) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center px-4">
      <section
        ref={cardRef}
        aria-label="物品详情"
        className="item-callout clean-modal-frame clean-modal-frame-blue pointer-events-auto relative flex max-w-[90vw] select-none items-center gap-5 px-6 py-5"
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(480px, 90vw)',
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.68))',
          animation: 'itemCalloutIn 180ms steps(3, end) both',
        }}
      >
        <button
          type="button"
          aria-label="关闭物品详情"
          className="item-callout__close absolute right-1 top-1 z-10 flex min-h-11 min-w-11 items-center justify-center border border-[#aaa59e] bg-black text-[#e8e4dc]"
          onClick={() => setCurrentState({ item: null })}
        >
          <GameIcon name="close" size={20} />
        </button>
        <div
          className="item-callout__art flex shrink-0 items-center justify-center border-2 border-[#3a3a42] bg-[#050505]"
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

        <div className="item-callout__copy min-w-0 flex-1">
          <div className="item-callout__title pr-8 font-serif-cn text-[21px] leading-7 tracking-[0.12em]" style={{ color: TEXT_MAIN }}>
            {item.displayName}
          </div>
          <div className="item-callout__description mt-2 text-[15px] leading-7" style={{ color: TEXT_DIM }}>
            {item.description}
          </div>
        </div>
      </section>
    </div>
  );
}
