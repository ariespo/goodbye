import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { maintextToScene } from '../../engine/scene-parser';
import { OPENING_STORYLINE } from '../../engine/opening-storyline';
import { deleteChat, saveChat } from '../../sillytavern/database';
import type { ChatSession, ChatMessage } from '../../sillytavern/types';

export function TitleScreen() {
  const showTitle = useGameStore(state => state.ui.showTitle);
  const setShowTitle = useGameStore(state => state.actions.setShowTitle);
  const setCurrentScene = useGameStore(state => state.actions.setCurrentScene);
  const setActiveChatId = useGameStore(state => state.actions.setActiveChatId);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const setChats = useGameStore(state => state.actions.setChats);
  const addNotification = useGameStore(state => state.actions.addNotification);

  const chats = useGameStore(state => state.tavern.chats);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const settings = useGameStore(state => state.tavern.settings);

  const [visible, setVisible] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // 入场动画
  useEffect(() => {
    if (showTitle) {
      const t = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [showTitle]);

  // 背景飘尘粒子（上升的光点，像尘埃在光束中飘浮）
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

    interface Dust {
      x: number; y: number; vx: number; vy: number; r: number; alpha: number;
    }
    const dusts: Dust[] = [];
    for (let i = 0; i < 40; i++) {
      dusts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -Math.random() * 0.3 - 0.05,
        r: Math.random() * 1.2 + 0.3,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const d of dusts) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.y < -10) { d.y = canvas.height + 10; d.x = Math.random() * canvas.width; }
        if (d.x < -10) d.x = canvas.width + 10;
        if (d.x > canvas.width + 10) d.x = -10;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 215, 205, ${d.alpha})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleStartGame = useCallback(async () => {
    const chat = chats.find(c => c.id === activeChatId);
    if (chat) {
      const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        const maintext = lastAssistant.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim() || '';
        if (maintext) {
          const scene = maintextToScene(maintext);
          if (scene.lines.length > 0) {
            setCurrentScene(scene);
            setShowTitle(false);
            return;
          }
        }
      }
    }
    setCurrentScene(maintextToScene(OPENING_STORYLINE));
    setShowTitle(false);
  }, [chats, activeChatId, setCurrentScene, setShowTitle]);

  const handleSettings = useCallback(() => toggleModal('settings'), [toggleModal]);

  const handleReincarnation = useCallback(async () => {
    if (!settings) { addNotification({ type: 'error', message: '设置未加载', duration: 3000 }); return; }
    try {
      for (const chat of chats) await deleteChat(chat.id);
      const openingMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        content: `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穂的早晨</sum>\n<vars>{ "stamina": 100, "sanity": 80 }</vars>`,
        timestamp: Date.now(), variables: {},
      };
      const newChat: ChatSession = {
        id: crypto.randomUUID(),
        name: `${settings.characterName} - 新对话 1`,
        messages: [openingMsg],
        characterName: settings.characterName,
        userName: settings.userName,
        presetId: settings.activePresetId || null,
        lorebookIds: [...settings.activeLorebookIds],
        variables: {},
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await saveChat(newChat);
      setChats([newChat]);
      setActiveChatId(newChat.id);
      setCurrentScene(maintextToScene(OPENING_STORYLINE));
      setShowTitle(false);
      addNotification({ type: 'info', message: '轮回重启...', duration: 2000 });
    } catch { addNotification({ type: 'error', message: '重启失败', duration: 3000 }); }
  }, [chats, settings, setChats, setActiveChatId, setCurrentScene, setShowTitle, addNotification]);

  if (!showTitle) return null;

  const btnCls = 'group relative w-[280px] py-3.5 text-[13px] tracking-[0.35em] transition-all duration-500 border select-none overflow-hidden cursor-none';

  return (
    <div className="fixed inset-0 z-[50] flex flex-col items-center justify-end overflow-hidden"
      style={{ background: '#0a0a0c' }}>

      {/* 背景图：bedroom1 暗化 */}
      <div className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{
          backgroundImage: `url(/assets/backgrounds/bedroom1.png)`,
          filter: 'grayscale(60%) brightness(0.4) contrast(1.2)',
        }}
      />

      {/* 暗角 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.95) 100%)' }}
      />

      {/* 底部渐变遮罩（让按钮区域更清晰） */}
      <div className="absolute bottom-0 left-0 right-0 h-[55%] pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(10,10,12,0.95) 0%, rgba(10,10,12,0.6) 40%, transparent 100%)' }}
      />

      {/* 粒子层 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* 扫描线 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 6px)' }}
      />

      {/* 内容区 */}
      <div className={`relative z-10 flex flex-col items-center pb-24 transition-all duration-[1.2s] ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

        {/* 标题 */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <h1
            className="text-5xl md:text-6xl font-bold tracking-[0.35em]"
            style={{
              fontFamily: '"MuzaiPixel", "LXGW WenKai", "Noto Serif SC", serif',
              color: '#e8e4dc',
              textShadow: '0 0 80px rgba(232,228,220,0.1), 0 2px 10px rgba(0,0,0,0.8)',
            }}
          >
            漫长的告别
          </h1>
          <div className="flex items-center gap-4">
            <div className="w-10 h-px bg-text-muted/20" />
            <p className="text-[11px] tracking-[0.5em] uppercase" style={{ fontFamily: '"JetBrains Mono", monospace', color: 'rgba(138,133,128,0.5)' }}>
              A Long Farewell
            </p>
            <div className="w-10 h-px bg-text-muted/20" />
          </div>
        </div>

        {/* 引言 */}
        <p className="text-xs tracking-[0.15em] mb-10" style={{ color: 'rgba(138,133,128,0.35)' }}>
          如果时间可以倒流，你是否能改写结局？
        </p>

        {/* 按钮组 */}
        <div className="flex flex-col items-center gap-3">
          {/* 开始游戏 */}
          <button
            className={`${btnCls} border-accent-blue/30 text-accent-blue hover:border-accent-blue hover:bg-accent-blue/[0.07]`}
            onMouseEnter={() => setHoveredBtn('start')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleStartGame}
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-300 ${hoveredBtn === 'start' ? 'translate-x-1' : ''}`}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              开 始 游 戏
            </span>
            {hoveredBtn === 'start' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent-blue/5 to-transparent animate-[shimmer_2s_infinite]" />
            )}
          </button>

          {/* 设置 */}
          <button
            className={`${btnCls} border-white/10 text-text-muted/60 hover:border-white/25 hover:text-text-muted hover:bg-white/[0.03]`}
            onMouseEnter={() => setHoveredBtn('settings')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleSettings}
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.67 15 1.65 1.65 0 0 0 3 13.57V13a2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2v.57a1.65 1.65 0 0 0-.67 1.43z" />
              </svg>
              设 置
            </span>
          </button>

          {/* 进入轮回 */}
          <button
            className={`${btnCls} border-accent-gold/20 text-accent-gold/50 hover:border-accent-gold/50 hover:text-accent-gold hover:bg-accent-gold/[0.05]`}
            onMouseEnter={() => setHoveredBtn('reincarnation')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleReincarnation}
          >
            <span className="relative z-10 flex items-center justify-center gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-500 ${hoveredBtn === 'reincarnation' ? 'rotate-180' : ''}`}>
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              进 入 轮 回
            </span>
          </button>
        </div>
      </div>

      {/* 版本号 */}
      <div className="absolute bottom-5 text-[9px] tracking-[0.4em]" style={{ color: 'rgba(138,133,128,0.15)', fontFamily: '"JetBrains Mono", monospace' }}>
        VER 1.0.0
      </div>

      {/* 四角细线装饰 */}
      <div className="absolute top-6 left-6 w-12 h-12 border-l border-t border-white/[0.04]" />
      <div className="absolute top-6 right-6 w-12 h-12 border-r border-t border-white/[0.04]" />
      <div className="absolute bottom-6 left-6 w-12 h-12 border-l border-b border-white/[0.04]" />
      <div className="absolute bottom-6 right-6 w-12 h-12 border-r border-b border-white/[0.04]" />
    </div>
  );
}
