import { useEffect, useRef } from 'react';

/** 全屏老胶片效果 — 灰尘/划痕/抖动/边缘暗角，覆盖整个画面 */
export function FullScreenGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const defects: { x: number; y: number; w: number; h: number; life: number; maxLife: number; type: string }[] = [];
    let frameCount = 0;
    let jitterX = 0;
    let jitterY = 0;
    let nextJitterFrame = 0;
    let raf = 0;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      frameCount++;

      ctx.clearRect(0, 0, w, h);

      // 全屏放映机抖动
      if (frameCount >= nextJitterFrame) {
        jitterX = Math.random() < 0.15 ? (Math.random() > 0.5 ? 0.6 : -0.4) : 0;
        jitterY = Math.random() < 0.2 ? (Math.random() > 0.5 ? 0.6 : -0.4) : 0;
        nextJitterFrame = frameCount + Math.floor(Math.random() * 12 + 6);
      }
      ctx.save();
      ctx.translate(jitterX, jitterY);

      // 1. 全屏边缘暗角（边缘磨损）
      const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.35, w * 0.5, h * 0.5, h * 0.85);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.7, 'rgba(0,0,0,0.02)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.12)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);

      // 2. 底色不均匀（径向渐变）
      const uneven = ctx.createRadialGradient(w * 0.4, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      uneven.addColorStop(0, 'rgba(255,255,255,0.015)');
      uneven.addColorStop(0.6, 'rgba(255,255,255,0)');
      uneven.addColorStop(1, 'rgba(0,0,0,0.04)');
      ctx.fillStyle = uneven;
      ctx.fillRect(0, 0, w, h);

      // 3. 灰尘 / 划痕 / 毛发（全屏随机瑕疵）
      if (Math.random() < 0.006) {
        const type = Math.random() < 0.3 ? 'scratch' : Math.random() < 0.6 ? 'hair' : 'dust';
        defects.push({
          x: Math.random() * w,
          y: Math.random() * h,
          w: type === 'scratch' ? Math.random() * 40 + 15 : type === 'hair' ? 0.8 : Math.random() * 3 + 1,
          h: type === 'scratch' ? 0.7 : type === 'hair' ? Math.random() * 35 + 12 : Math.random() * 3 + 1,
          life: 0,
          maxLife: Math.floor(Math.random() * 60 + 30),
          type,
        });
      }
      for (let i = defects.length - 1; i >= 0; i--) {
        const d = defects[i];
        d.life++;
        const fade = d.life < 6 ? d.life / 6 : d.life > d.maxLife - 10 ? (d.maxLife - d.life) / 10 : 1;
        if (d.life >= d.maxLife) { defects.splice(i, 1); continue; }
        ctx.globalAlpha = fade * 0.35;
        if (d.type === 'scratch') {
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = d.h;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.w, d.y + (Math.random() - 0.5) * 2.5);
          ctx.stroke();
        } else if (d.type === 'hair') {
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = d.w;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + (Math.random() - 0.5) * 4, d.y + d.h);
          ctx.stroke();
        } else {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.w, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-40 pointer-events-none" />;
}
