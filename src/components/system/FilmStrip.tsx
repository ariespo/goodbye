import { useEffect, useRef } from 'react';

interface FilmStripProps {
  position: 'top' | 'bottom';
  filmColor: string;
}

const STRIP_H = 56;
const PITCH = 26;
const HOLE_W = 10;
const HOLE_H = 14;
const HOLE_RX = 4;
const SPEED = 0.6;

/** 老胶片瑕疵 */
interface Defect {
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  maxLife: number;
  type: 'scratch' | 'dust' | 'hair';
}

/** 用 Canvas 绘制老胶片 — 齿孔 + 颗粒噪点 + 灰尘划痕 + 边缘磨损 */
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

    // 预渲染噪点纹理（复用）
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 128;
    noiseCanvas.height = 128;
    const nctx = noiseCanvas.getContext('2d')!;
    const nImg = nctx.createImageData(128, 128);
    for (let i = 0; i < nImg.data.length; i += 4) {
      const v = Math.random() * 40 + 10;
      nImg.data[i] = v;
      nImg.data[i + 1] = v;
      nImg.data[i + 2] = v;
      nImg.data[i + 3] = 30; // 低透明度噪点
    }
    nctx.putImageData(nImg, 0, 0);

    // 瑕疵列表
    const defects: Defect[] = [];
    let frameCount = 0;
    let jitterY = 0;
    let nextJitterFrame = 0;

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
      frameCount++;

      // 1. 清空
      ctx.clearRect(0, 0, w, h);

      // 2. 放映机抖动（偶尔整体偏移 0-1px）
      if (frameCount >= nextJitterFrame) {
        jitterY = Math.random() < 0.3 ? (Math.random() > 0.5 ? 0.6 : -0.4) : 0;
        nextJitterFrame = frameCount + Math.floor(Math.random() * 8 + 4);
      }
      ctx.save();
      ctx.translate(0, jitterY);

      // 3. 胶片底色（带轻微不均匀——用径向渐变模拟褪色）
      const bgGrad = ctx.createRadialGradient(w * 0.3, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.8);
      bgGrad.addColorStop(0, filmColor);
      bgGrad.addColorStop(0.7, filmColor);
      bgGrad.addColorStop(1, shadeColor(filmColor, -8)); // 边缘稍暗
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 4. 叠加颗粒噪点
      ctx.globalAlpha = 0.25;
      ctx.imageSmoothingEnabled = false;
      for (let nx = 0; nx < w; nx += 128) {
        for (let ny = 0; ny < h; ny += 128) {
          ctx.drawImage(noiseCanvas, nx, ny, 128, 128);
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;

      // 5. 生成新瑕疵
      if (Math.random() < 0.015) {
        const type: Defect['type'] = Math.random() < 0.4 ? 'scratch' : Math.random() < 0.6 ? 'hair' : 'dust';
        defects.push({
          x: Math.random() * w,
          y: Math.random() * h,
          w: type === 'scratch' ? Math.random() * 30 + 10 : type === 'hair' ? 0.8 : Math.random() * 2 + 1,
          h: type === 'scratch' ? 0.6 : type === 'hair' ? Math.random() * 25 + 8 : Math.random() * 2 + 1,
          life: 0,
          maxLife: Math.floor(Math.random() * 40 + 20),
          type,
        });
      }

      // 6. 绘制瑕疵（灰尘 / 划痕 / 毛发）
      for (let i = defects.length - 1; i >= 0; i--) {
        const d = defects[i];
        d.life++;
        const fade = d.life < 5 ? d.life / 5 : d.life > d.maxLife - 8 ? (d.maxLife - d.life) / 8 : 1;
        if (d.life >= d.maxLife) {
          defects.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = fade * 0.55;
        if (d.type === 'scratch') {
          // 白色划痕
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = d.h;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.w, d.y + (Math.random() - 0.5) * 2);
          ctx.stroke();
        } else if (d.type === 'hair') {
          // 黑色细毛发
          ctx.strokeStyle = 'rgba(0,0,0,0.65)';
          ctx.lineWidth = d.w;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + (Math.random() - 0.5) * 3, d.y + d.h);
          ctx.stroke();
        } else {
          // 灰尘点
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.w, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 7. 边缘磨损（边缘透明度渐变）
      const edgeGrad = ctx.createLinearGradient(0, 0, 0, h);
      edgeGrad.addColorStop(0, 'rgba(0,0,0,0.08)');
      edgeGrad.addColorStop(0.15, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(0.85, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(0, 0, w, h);

      // 8. 擦除齿孔
      ctx.globalCompositeOperation = 'destination-out';

      offsetRef.current = (offsetRef.current + SPEED) % PITCH;
      const startX = -PITCH + offsetRef.current;

      for (let x = startX; x < w + PITCH; x += PITCH) {
        drawRoundRect(x + 5, 7, HOLE_W, HOLE_H, HOLE_RX);
        ctx.fill();
        drawRoundRect(x + 5, 35, HOLE_W, HOLE_H, HOLE_RX);
        ctx.fill();
      }

      // 9. 恢复混合模式
      ctx.globalCompositeOperation = 'source-over';

      // 10. 画面框细线
      ctx.strokeStyle = filmColor;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 0.8;
      const frameL = 52;
      const frameR = w - 52;
      const frameY = isTop ? h - 3 : 3;
      ctx.beginPath();
      ctx.moveTo(frameL, frameY);
      ctx.lineTo(frameR, frameY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();

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
      className={`absolute left-3 right-3 z-30 pointer-events-none ${isTop ? 'top-3' : 'bottom-3'}`}
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

/** 颜色变暗/变亮 helper */
function shadeColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}
