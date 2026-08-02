import type { CSSProperties, ReactNode } from 'react';

type PixelFrameVariant = 'panel' | 'dialogue' | 'button';
import { assetUrl } from '../../utils/assetUrl';



interface PixelFrameProps {

  children: ReactNode;

  variant?: PixelFrameVariant;

  className?: string;

  contentClassName?: string;

  style?: CSSProperties;

  contentStyle?: CSSProperties;

  onClick?: () => void;

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

        border: '2px solid #d8d8d2',
        outline: '2px solid #090909',
        outlineOffset: '2px',
        backgroundColor: variant === 'dialogue' ? 'rgba(9, 9, 9, 0.94)' : 'rgba(12, 12, 12, 0.93)',
        boxShadow: 'inset 0 0 0 2px #353535, 5px 5px 0 #050505',

        ...style,

      }}

    >

      <div

        className={`relative ${contentClassName}`}

        style={{

          backgroundImage:

            `url(${assetUrl('assets/ui/noise-film.png')}), url(${assetUrl('assets/ui/scanline.png')})`,

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
