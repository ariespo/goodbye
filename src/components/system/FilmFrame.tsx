import { useEffect, useRef } from 'react';

interface FilmFrameProps {
  filmColor: string;
  className?: string;
}

const BORDER = 6;       // 边框厚度
const SPROCKET_H = 32;  // 齿孔区高度
const HOLE_W = 5;
const HOLE_H = 7;
const HOLE_PITCH = 14;
const SPEED = 0.5;

/** 完整胶片框 — 覆盖全屏，中间透明画面区，参考 35mm 电影胶片 */
export function FilmFrame({ filmColor, className = '' }: FilmFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
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
      nImg.data[i] = v;
      nImg.data[i + 1] = v;
      nImg.data[i + 2] = v;
      nImg.data[i + 3] = 22;
    }
    nctx.putImageData(nImg, 0, 0);

    const defects: { x: number; y: number; w: number; h: number; life: number; maxLife: number; type: string }[] = [];
    let frameCount = 0;
    let jitterX = 0;
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
      const h = canvas.getBoundingClientRect().height;
      frameCount++;

      ctx.clearRect(0, 0, w, h);

      // 放映机抖动
      if (frameCount >= nextJitterFrame) {
        jitterX = Math.random() < 0.2 ? (Math.random() > 0.5 ? 0.4 : -0.3) : 0;
        jitterY = Math.random() < 0.25 ? (Math.random() > 0.5 ? 0.5 : -0.3) : 0;
        nextJitterFrame = frameCount + Math.floor(Math.random() * 10 + 5);
      }
      ctx.save();
      ctx.translate(jitterX, jitterY);

      // 1. 胶片底色覆盖全屏
      ctx.fillStyle = filmColor;
      ctx.fillRect(0, 0, w, h);

      // 2. 底色不均匀（径向渐变，中间稍亮边缘稍暗）
      const centerGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      centerGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
      centerGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
      centerGrad.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = centerGrad;
      ctx.fillRect(0, 0, w, h);

      // 3. 右侧厚度阴影（参考图片右侧投影）
      const shadowGrad = ctx.createLinearGradient(w - 20, 0, w, 0);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(w - 20, 0, 20, h);

      // 4. 擦除中间画面区域（圆角矩形透明区）
      ctx.globalCompositeOperation = 'destination-out';
      const frameX = BORDER;
      const frameY = SPROCKET_H + BORDER + 2;
      const frameW = w - BORDER * 2;
      const frameH = h - frameY * 2;
      drawRoundRect(frameX, frameY, frameW, frameH, 4);
      ctx.fill();

      // 5. 擦除齿孔
      offsetRef.current = (offsetRef.current + SPEED) % HOLE_PITCH;
      const startX = -HOLE_PITCH + offsetRef.current;

      // 上排齿孔
      for (let x = startX; x < w + HOLE_PITCH; x += HOLE_PITCH) {
        ctx.clearRect(x + 4, 6, HOLE_W, HOLE_H);
      }
      // 下排齿孔
      for (let x = startX; x < w + HOLE_PITCH; x += HOLE_PITCH) {
        ctx.clearRect(x + 4, h - 13, HOLE_W, HOLE_H);
      }

      ctx.globalCompositeOperation = 'source-over';

      // 6. 颗粒噪点（覆盖全屏胶片区域）
      ctx.globalAlpha = 0.18;
      ctx.imageSmoothingEnabled = false;
      for (let nx = 0; nx < w; nx += 128) {
        for (let ny = 0; ny < h; ny += 128) {
          ctx.drawImage(noiseCanvas, nx, ny, 128, 128);
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;

      // 7. 灰尘 / 划痕 / 毛发（随机瑕疵，淡入淡出）
      if (Math.random() < 0.012) {
        const type = Math.random() < 0.35 ? 'scratch' : Math.random() < 0.55 ? 'hair' : 'dust';
        defects.push({
          x: Math.random() * w,
          y: Math.random() * h,
          w: type === 'scratch' ? Math.random() * 28 + 10 : type === 'hair' ? 0.7 : Math.random() * 2 + 0.8,
          h: type === 'scratch' ? 0.6 : type === 'hair' ? Math.random() * 22 + 7 : Math.random() * 2 + 0.8,
          life: 0,
          maxLife: Math.floor(Math.random() * 40 + 20),
          type,
        });
      }
      for (let i = defects.length - 1; i >= 0; i--) {
        const d = defects[i];
        d.life++;
        const fade = d.life < 5 ? d.life / 5 : d.life > d.maxLife - 8 ? (d.maxLife - d.life) / 8 : 1;
        if (d.life >= d.maxLife) {
          defects.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = fade * 0.5;
        if (d.type === 'scratch') {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = d.h;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.w, d.y + (Math.random() - 0.5) * 2);
          ctx.stroke();
        } else if (d.type === 'hair') {
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = d.w;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + (Math.random() - 0.5) * 3, d.y + d.h);
          ctx.stroke();
        } else {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.28)';
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.w, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 8. 边缘磨损（四边暗化）
      const edgeTop = ctx.createLinearGradient(0, 0, 0, SPROCKET_H + 10);
      edgeTop.addColorStop(0, 'rgba(0,0,0,0.14)');
      edgeTop.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = edgeTop;
      ctx.fillRect(0, 0, w, SPROCKET_H + 10);

      const edgeBottom = ctx.createLinearGradient(0, h - SPROCKET_H - 10, 0, h);
      edgeBottom.addColorStop(0, 'rgba(0,0,0,0)');
      edgeBottom.addColorStop(1, 'rgba(0,0,0,0.14)');
      ctx.fillStyle = edgeBottom;
      ctx.fillRect(0, h - SPROCKET_H - 10, w, SPROCKET_H + 10);

      const edgeLeft = ctx.createLinearGradient(0, 0, BORDER * 2.5, 0);
      edgeLeft.addColorStop(0, 'rgba(0,0,0,0.1)');
      edgeLeft.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = edgeLeft;
      ctx.fillRect(0, 0, BORDER * 2.5, h);

      const edgeRight = ctx.createLinearGradient(w - BORDER * 2.5, 0, w, 0);
      edgeRight.addColorStop(0, 'rgba(0,0,0,0)');
      edgeRight.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = edgeRight;
      ctx.fillRect(w - BORDER * 2.5, 0, BORDER * 2.5, h);

      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [filmColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
