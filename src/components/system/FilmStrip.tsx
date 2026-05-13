import { useMemo } from 'react';

interface FilmStripProps {
  position: 'top' | 'bottom';
  filmColor: string;
}

const PATTERN_W = 26;
const PATTERN_H = 56;

/** 逼真的 35mm 电影胶片条 — 圆角齿孔 + 厚度阴影 + 边缘高光 */
export function FilmStrip({ position, filmColor }: FilmStripProps) {
  const isTop = position === 'top';

  // SVG mask: 白色=保留胶片底色, 黑色=齿孔挖空(透明)
  const maskSvg = useMemo(() => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${PATTERN_W}" height="${PATTERN_H}" viewBox="0 0 ${PATTERN_W} ${PATTERN_H}">
        <rect width="${PATTERN_W}" height="${PATTERN_H}" fill="white"/>
        <rect x="5" y="7" width="10" height="14" rx="4" fill="black"/>
        <rect x="5" y="35" width="10" height="14" rx="4" fill="black"/>
      </svg>
    `;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }, []);

  return (
    <div
      className={`absolute left-0 right-0 z-30 pointer-events-none ${isTop ? 'top-0' : 'bottom-0'}`}
      style={{ height: `${PATTERN_H}px` }}
    >
      {/* 胶片底色 + 齿孔挖空 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: filmColor,
          maskImage: `url("${maskSvg}")`,
          WebkitMaskImage: `url("${maskSvg}")`,
          maskRepeat: 'repeat-x',
          WebkitMaskRepeat: 'repeat-x',
          maskSize: `${PATTERN_W}px ${PATTERN_H}px`,
          WebkitMaskSize: `${PATTERN_W}px ${PATTERN_H}px`,
          animation: 'filmMaskScroll 0.5s linear infinite',
        }}
      />

      {/* 胶片厚度阴影 */}
      <div
        className="absolute left-0 right-0"
        style={{
          [isTop ? 'bottom' : 'top']: '-4px',
          height: '4px',
          background: isTop
            ? 'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)'
            : 'linear-gradient(to top, rgba(0,0,0,0.35), transparent)',
        }}
      />

      {/* 胶片顶部边缘高光（增加立体感） */}
      <div
        className="absolute left-0 right-0"
        style={{
          [isTop ? 'top' : 'bottom']: '0',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
        }}
      />

      {/* 中间画面区域边框线（像真实胶片那样有画面框） */}
      <div
        className="absolute"
        style={{
          [isTop ? 'bottom' : 'top']: '3px',
          left: '52px',
          right: '52px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent 100%)',
        }}
      />
    </div>
  );
}
