import type { CSSProperties, ReactNode } from 'react';
import { assetUrl } from '../../utils/assetUrl';

type PixelFrameVariant = 'panel' | 'dialogue' | 'button';

interface PixelFrameProps {
  children: ReactNode;
  variant?: PixelFrameVariant;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
  onClick?: () => void;
}

export function PixelFrameRails({ double = false }: { double?: boolean }) {
  return (
    <span className={`pixel-frame-layers ${double ? 'is-double' : 'is-single'}`} aria-hidden="true">
      <span className="pixel-frame-layer pixel-frame-layer--underlay" />
      <span className="pixel-frame-layer pixel-frame-layer--outer" data-pixel-frame-rail="outer" />
      <span className="pixel-frame-layer pixel-frame-layer--gap" />
      {double && (
        <span className="pixel-frame-layer pixel-frame-layer--inner" data-pixel-frame-rail="inner" />
      )}
      <span className="pixel-frame-layer pixel-frame-layer--fill" />
    </span>
  );
}

export function PixelFrame({
  children,
  variant = 'panel',
  className = '',
  contentClassName = '',
  style,
  contentStyle,
  onClick,
}: PixelFrameProps) {
  return (
    <div
      className={`world-pixel-frame world-pixel-frame-${variant} relative ${className}`}
      onClick={onClick}
      style={{
        backgroundColor: variant === 'dialogue' ? 'rgba(9, 9, 9, 0.94)' : 'rgba(12, 12, 12, 0.93)',
        ...style,
      }}
    >
      <PixelFrameRails double={variant === 'dialogue'} />

      <div
        data-pixel-frame-content="true"
        className={`pixel-frame-content relative ${contentClassName}`}
        style={{
          backgroundImage: `url(${assetUrl('assets/ui/noise-film.png')}), url(${assetUrl('assets/ui/scanline.png')})`,
          backgroundRepeat: 'repeat',
          backgroundBlendMode: 'screen',
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
