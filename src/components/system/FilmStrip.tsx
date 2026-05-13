import { useEffect, useRef } from 'react';

interface FilmStripProps {
  position: 'top' | 'bottom';
  filmColor: string;
}

const STRIP_H = 64;
const PITCH = 16;
const HOLE_W = 5;
const HOLE_H = 7;
const SPEED = 0.5;

/** 老胶片条 — 参考 35mm 电影胶片框设计 */
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

    // 噪点纹理
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 128;
    noiseCanvas.height = 128;
    const nctx = noiseCanvas.getContext('2d')!;
    const nImg = nctx.createImageData(128, 128);
    for (let i = 0; i < nImg.data.length; i += 4) {
      const v = Math.random() * 30 + 8;
      nImg.data[i] = v; nImg.data[i + 1] = v; nImg.data[i + 2] = v; nImg.data[i + 3] = 25;
    }
    nctx.putImageData(nImg, 0, 0);

    const defects: { x: number; y: number; w: number; h: number; life: number; maxLife: number; type: string }[] = [];
    let frameCount = 0;
    let jitterY = 0;
    let nextJitterFrame = 0;

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = STRIP_H;
      frameCount++;

      ctx.clearRect(0, 0, w, h);

      // 放映机抖动
      if (frameCount >= nextJitterFrame) {
        jitterY = Math.random() < 0.25 ? (Math.random() > 0.5 ? 0.5 : -0.3) : 0;
        nextJitterFrame = frameCount + Math.floor(Math.random() * 10 + 5);
      }
      ctx.save();
      ctx.translate(0, jitterY);

      // 1. 胶片底色 + 右侧厚度阴影
      ctx.fillStyle = filmColor;
      ctx.fillRect(0, 0, w, h);

      // 右侧厚度阴影（参考图片右侧的投影）
      const shadowGrad = ctx.createLinearGradient(w - 12, 0, w, 0);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(w - 12, 0, 12, h);

      // 2. 噪点
      ctx.globalAlpha = 0.2;
      ctx.imageSmoothingEnabled = false;
      for (let nx = 0; nx < w; nx += 128) {
        for (let ny = 0; ny < h; ny += 128) {
          ctx.drawImage(noiseCanvas, nx, ny, 128, 128);
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;

      // 3. 瑕疵
      if (Math.random() < 0.012) {
        const type = Math.random() < 0.35 ? 'scratch' : Math.random() < 0.55 ? 'hair' : 'dust';
        defects.push({
          x: Math.random() * w, y: Math.random() * h,
          w: type === 'scratch' ? Math.random() * 25 + 8 : type === 'hair' ? 0.7 : Math.random() * 1.8 + 0.8,
          h: type === 'scratch' ? 0.5 : type === 'hair' ? Math.random() * 20 + 6 : Math.random() * 1.8 + 0.8,
          life: 0, maxLife: Math.floor(Math.random() * 35 + 18), type,
        });
      }
      for (let i = defects.length - 1; i >= 0; i--) {
        const d = defects[i];
        d.life++;
        const fade = d.life < 4 ? d.life / 4 : d.life > d.maxLife - 6 ? (d.maxLife - d.life) / 6 : 1;
        if (d.life >= d.maxLife) { defects.splice(i, 1); continue; }
        ctx.globalAlpha = fade * 0.5;
        if (d.type === 'scratch') {
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = d.h;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.w, d.y + (Math.random() - 0.5) * 1.5); ctx.stroke();
        } else if (d.type === 'hair') {
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = d.w;
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + (Math.random() - 0.5) * 2, d.y + d.h); ctx.stroke();
        } else {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)';
          ctx.beginPath(); ctx.arc(d.x, d.y, d.w, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 4. 边缘磨损
      const edgeGrad = ctx.createLinearGradient(0, 0, 0, h);
      edgeGrad.addColorStop(0, 'rgba(0,0,0,0.1)');
      edgeGrad.addColorStop(0.12, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(0.88, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = edgeGrad;
      ctx.fillRect(0, 0, w, h);

      // 5. 齿孔（直角矩形，像参考图片那样）
      ctx.globalCompositeOperation = 'destination-out';
      offsetRef.current = (offsetRef.current + SPEED) % PITCH;
      const startX = -PITCH + offsetRef.current;

      const holeY = isTop ? 6 : 51; // 上排或下排齿孔
      for (let x = startX; x < w + PITCH; x += PITCH) {
        ctx.clearRect(x + 4, holeY, HOLE_W, HOLE_H);
      }

      ctx.globalCompositeOperation = 'source-over';

      // 6. 粗边框线（像参考图片中齿孔和画面之间的黑色条带）
      const borderY = isTop ? 22 : 38;
      ctx.fillStyle = filmColor;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, borderY, w, 4);
      ctx.globalAlpha = 1;

      // 7. 画面框圆角暗示（像参考图片中画面框的顶部/底部边缘）
      const frameInset = 36;
      ctx.strokeStyle = filmColor;
      ctx.globalAlpha = 0.08;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(frameInset, 30);
        ctx.lineTo(w - frameInset, 30);
      } else {
        ctx.moveTo(frameInset, 34);
        ctx.lineTo(w - frameInset, 34);
      }
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
    </div>
  );
}
