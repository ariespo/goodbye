import { assetUrl } from '../../utils/assetUrl';

type Variant = 'gold' | 'blue' | 'red';

const VARIANT_STYLE: Record<Variant, { color: string; textShadow: string }> = {
  gold: { color: '#f4ead2', textShadow: '0 1px 0 #000, 0 0 6px rgba(212,168,83,0.5)' },
  blue: { color: '#e8efff', textShadow: '0 1px 0 #000, 0 0 6px rgba(134,168,242,0.55)' },
  red: { color: '#f2dcd8', textShadow: '0 1px 0 #000, 0 0 6px rgba(214,106,92,0.5)' },
};

/** 像素风系统按钮(system-button-{gold,blue,red}.png 九宫底图) */
export function PixelButton({
  variant = 'gold',
  className = '',
  style,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const preset = VARIANT_STYLE[variant];
  return (
    <button
      data-cursor="pointer"
      className={`flex items-center justify-center gap-2 text-sm font-semibold transition-[color,filter] hover:text-white hover:brightness-125 ${className}`}
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/system-button-${variant}.png`)})`,
        backgroundSize: '100% 100%',
        cursor: 'pointer',
        imageRendering: 'pixelated',
        color: preset.color,
        textShadow: preset.textShadow,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
