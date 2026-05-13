import { useEffect, useRef } from 'react';

interface FilmStripProps {
  position: 'top' | 'bottom';
  filmColor: string;
}

const STRIP_H = 56;
const PITCH = 26;      // 齿孔间距
const HOLE_W = 10;
const HOLE_H = 14;
const HOLE_RX = 4;     // 圆角
const SPEED = 0.6;     // 滚动速度 (px/frame)

/** 用 Canvas 绘制逼真胶片条 — 齿孔为真实透明区域 */
export function FilmStrip({ position, filmColor }: FilmStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const offsetRef = useRef(0);
  const isTop = position === 'top';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = STRIP_H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // 绘制圆角矩形（兼容旧浏览器）
    function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = STRIP_H;

      // 1. 清空画布
      ctx.clearRect(0, 0, w, h);

      // 2. 绘制胶片底色
      ctx.fillStyle = filmColor;
      ctx.fillRect(0, 0, w, h);

      // 3. 切换到"擦除"模式，齿孔区域变透明
      ctx.globalCompositeOperation = 'destination-out';

      offsetRef.current = (offsetRef.current + SPEED) % PITCH;
      const startX = -PITCH + offsetRef.current;

      for (let x = startX; x < w + PITCH; x += PITCH) {
        // 上排齿孔
        drawRoundRect(x + 5, 7, HOLE_W, HOLE_H, HOLE_RX);
        ctx.fill();
        // 下排齿孔
        drawRoundRect(x + 5, 35, HOLE_W, HOLE_H, HOLE_RX);
        ctx.fill();
      }

      // 4. 恢复混合模式
      ctx.globalCompositeOperation = 'source-over';

      // 5. 绘制中间画面区域的细边框线（仅边缘）
      ctx.strokeStyle = filmColor;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      const frameL = 52;
      const frameR = w - 52;
      const frameY = isTop ? h - 3 : 3;
      ctx.beginPath();
      ctx.moveTo(frameL, frameY);
      ctx.lineTo(frameR, frameY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [filmColor, isTop]);

  return (
    <div
      className={`absolute left-0 right-0 z-30 pointer-events-none ${isTop ? 'top-0' : 'bottom-0'}`}
      style={{ height: `${STRIP_H}px` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 厚度阴影 */}
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

      {/* 边缘高光 */}
      <div
        className="absolute left-0 right-0"
        style={{
          [isTop ? 'top' : 'bottom']: '0',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
        }}
      />
    </div>
  );
}
