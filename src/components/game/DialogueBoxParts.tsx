import { useState } from 'react';
import { assetUrl } from '../../utils/assetUrl';
import { PixelFrame } from '../ui/PixelFrame';

export const DIALOGUE_TEXT_MAIN = '#d8d4cc';
export const DIALOGUE_TEXT_DIM = '#7a756e';
export const DIALOGUE_ACCENT = '#6b8fc4';

/* ── 像素风面板外壳 ── */

export function PixelPanel({
  children,
  topLeft,
  controls,
  complete,
  onClick,
}: {
  children: React.ReactNode;
  topLeft?: React.ReactNode;
  controls?: React.ReactNode;
  complete?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`dialogue-panel ${complete ? 'is-scene-complete' : ''} absolute bottom-[5%] left-1/2 z-20 flex w-[var(--dialogue-panel-width,min(88vw,980px))] select-none flex-col`}
      onClick={onClick}
    >
      {/* 左上角外部标签 */}
      {topLeft && (
        <div className="dialogue-speaker-wrap" style={{ position: 'absolute', top: -44, left: 0, zIndex: 3 }}>
          {topLeft}
        </div>
      )}

      {/* 文本框主体：立绘底部与此层底边贴合；高度限制只作用在文本区 */}
      <div
        className="dialogue-panel-main relative min-h-0 w-full"
        style={{
          minHeight: 'var(--dialogue-panel-min-height, 120px)',
          maxHeight: 'var(--dialogue-panel-max-height, 420px)',
        }}
      >
        <PixelFrame
          variant="dialogue"
          className="h-full w-full"
          contentClassName="dialogue-frame-content pixel-scroll-blue h-full w-full overflow-y-auto"
          contentStyle={{ padding: 'var(--dialogue-panel-padding, 20px 28px 18px 28px)' }}
        >
          {children}
        </PixelFrame>
      </div>

      {/* 控制按钮单独一行，不与正文重叠 */}
      {controls && (
        <div
          className="dialogue-controls dialogue-controls-row relative z-[5] mt-2 flex shrink-0 gap-2"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          {controls}
        </div>
      )}
    </div>
  );
}

/* ── 像素风 Speaker 标签（实色背景） ── */

export function PixelTag({ text }: { text: string }) {
  return (
    <div
      className="dialogue-speaker-tag inline-flex items-center px-3 py-1"
      style={{
        background: '#1a2d42',
        border: `2px solid rgba(107, 143, 196, 0.5)`,
        color: DIALOGUE_ACCENT,
        fontSize: '20px',
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        letterSpacing: '0.15em',
        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.08), 2px 2px 0 rgba(0,0,0,0.3)',
      }}
    >
      {text}
    </div>
  );
}

/* ── 像素风图标按钮 ── */

export function PixelIconBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const state = active ? 'active' : hovered ? 'hover' : 'normal';
  const color = active || hovered ? DIALOGUE_ACCENT : DIALOGUE_TEXT_DIM;

  return (
    <button
      data-cursor="pointer"
      data-active={active ? 'true' : 'false'}
      className="dialogue-control-button flex min-h-[42px] items-center gap-1.5 select-none px-3 transition-[filter,transform] duration-100"
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/dialogue-control-${state}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        color,
        fontSize: '16px',
        fontFamily: '"MuzaiPixel", monospace',
        letterSpacing: '0.08em',
        imageRendering: 'pixelated',
        filter: hovered || active ? 'drop-shadow(0 0 9px rgba(107,143,196,0.28))' : 'drop-shadow(2px 2px 0 rgba(0,0,0,0.35))',
        transform: hovered ? 'translate(1px, 0)' : 'translate(0, 0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
