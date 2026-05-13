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

  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const [clickedBtn, setClickedBtn] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // 微妙的背景粒子效果
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

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
      size: number;
    }

    const particles: Particle[] = [];
    const maxParticles = 60;

    const spawnParticle = () => {
      if (particles.length >= maxParticles) return;
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.5 - 0.2,
        life: 0,
        maxLife: 200 + Math.random() * 300,
        size: Math.random() * 1.5 + 0.5,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 偶尔生成新粒子
      if (Math.random() < 0.1) spawnParticle();

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;

        const alpha = p.life < 50
          ? p.life / 50 * 0.3
          : p.life > p.maxLife - 50
            ? (p.maxLife - p.life) / 50 * 0.3
            : 0.3;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 200, 210, ${alpha})`;
        ctx.fill();

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
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
    setClickedBtn('start');
    setTimeout(() => setClickedBtn(null), 200);

    // 优先从 activeChat 的最后一条 assistant 消息恢复
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

    // 否则使用开场剧情
    const scene = maintextToScene(OPENING_STORYLINE);
    setCurrentScene(scene);
    setShowTitle(false);
  }, [chats, activeChatId, setCurrentScene, setShowTitle]);

  const handleSettings = useCallback(() => {
    setClickedBtn('settings');
    setTimeout(() => setClickedBtn(null), 200);
    toggleModal('settings');
  }, [toggleModal]);

  const handleReincarnation = useCallback(async () => {
    setClickedBtn('reincarnation');
    setTimeout(() => setClickedBtn(null), 200);

    if (!settings) {
      addNotification({ type: 'error', message: '设置未加载', duration: 3000 });
      return;
    }

    // 删除现有聊天记录，重新开始
    try {
      for (const chat of chats) {
        await deleteChat(chat.id);
      }

      const openingMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穂的早晨</sum>\n<vars>{ "stamina": 100, "sanity": 80 }</vars>`,
        timestamp: Date.now(),
        variables: {},
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveChat(newChat);
      setChats([newChat]);
      setActiveChatId(newChat.id);

      const scene = maintextToScene(OPENING_STORYLINE);
      setCurrentScene(scene);
      setShowTitle(false);

      addNotification({ type: 'info', message: '轮回重启...', duration: 2000 });
    } catch (err) {
      addNotification({ type: 'error', message: '重启失败', duration: 3000 });
    }
  }, [chats, settings, setChats, setActiveChatId, setCurrentScene, setShowTitle, addNotification]);

  if (!showTitle) return null;

  const btnBase = 'relative w-[220px] py-3 text-sm tracking-[0.25em] uppercase transition-all duration-300 border select-none overflow-hidden';

  return (
    <div className="fixed inset-0 z-[50] bg-bg-primary flex flex-col items-center justify-center overflow-hidden">
      {/* 粒子画布 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* CRT 扫描线 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px)',
        }}
      />

      {/* 暗角 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* 噪声 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
        }}
      />

      {/* 内容区域 */}
      <div className="relative z-10 flex flex-col items-center gap-10 animate-[fadeIn_1.2s_ease-out]">
        {/* 标题区域 */}
        <div className="flex flex-col items-center gap-4">
          {/* 顶部装饰 */}
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-text-muted" />
            <div className="w-1 h-1 bg-text-muted rotate-45" />
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-text-muted" />
          </div>

          {/* 主标题 */}
          <h1
            className="text-7xl font-bold text-text-primary tracking-[0.35em]"
            style={{
              fontFamily: '"MuzaiPixel", "LXGW WenKai", monospace',
              textShadow: '0 0 60px rgba(255,255,255,0.08), 0 0 120px rgba(255,255,255,0.03)',
            }}
          >
            漫长的告别
          </h1>

          {/* 副标题 */}
          <p className="text-sm font-mono text-text-muted/50 tracking-[0.5em] uppercase">
            A Long Farewell
          </p>

          {/* 底部装饰 */}
          <div className="flex items-center gap-3 opacity-40 mt-2">
            <div className="w-16 h-px bg-gradient-to-r from-transparent to-text-muted" />
            <div className="w-1.5 h-1.5 border border-text-muted rotate-45" />
            <div className="w-16 h-px bg-gradient-to-l from-transparent to-text-muted" />
          </div>
        </div>

        {/* 描述文字 */}
        <p className="text-xs text-text-muted/30 tracking-widest max-w-[320px] text-center leading-relaxed">
          如果时间可以倒流，你是否能改写结局？
        </p>

        {/* 按钮区域 */}
        <div className="flex flex-col items-center gap-4 mt-4">
          {/* 开始游戏 */}
          <button
            className={`${btnBase} border-accent-blue/40 text-accent-blue hover:border-accent-blue hover:bg-accent-blue/5 hover:shadow-[0_0_20px_rgba(107,140,255,0.15)] ${clickedBtn === 'start' ? 'scale-95' : ''}`}
            onMouseEnter={() => setHoveredBtn('start')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleStartGame}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span className={`inline-block w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-accent-blue transition-all duration-300 ${hoveredBtn === 'start' ? 'translate-x-1' : ''}`} />
              开始游戏
            </span>
            {hoveredBtn === 'start' && (
              <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/0 via-accent-blue/5 to-accent-blue/0 animate-[shimmer_1.5s_infinite]" />
            )}
          </button>

          {/* 设置 */}
          <button
            className={`${btnBase} border-border-subtle text-text-muted hover:border-text-muted hover:bg-text-muted/5 hover:text-text-primary ${clickedBtn === 'settings' ? 'scale-95' : ''}`}
            onMouseEnter={() => setHoveredBtn('settings')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleSettings}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span className="w-3 h-3 border border-current flex items-center justify-center">
                <span className="w-1 h-1 bg-current" />
              </span>
              设置
            </span>
          </button>

          {/* 进入轮回 */}
          <button
            className={`${btnBase} border-accent-gold/30 text-accent-gold/70 hover:border-accent-gold hover:bg-accent-gold/5 hover:text-accent-gold hover:shadow-[0_0_20px_rgba(212,168,83,0.1)] ${clickedBtn === 'reincarnation' ? 'scale-95' : ''}`}
            onMouseEnter={() => setHoveredBtn('reincarnation')}
            onMouseLeave={() => setHoveredBtn(null)}
            onClick={handleReincarnation}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span className={`inline-block transition-transform duration-300 ${hoveredBtn === 'reincarnation' ? 'rotate-180' : ''}`}>⟳</span>
              进入轮回
            </span>
          </button>
        </div>
      </div>

      {/* 版本号 */}
      <div className="absolute bottom-6 text-[10px] text-text-muted/20 tracking-[0.3em] font-mono">
        VER 1.0.0
      </div>

      {/* 角落装饰 */}
      <div className="absolute top-6 left-6 w-8 h-8 border-l border-t border-text-muted/10" />
      <div className="absolute top-6 right-6 w-8 h-8 border-r border-t border-text-muted/10" />
      <div className="absolute bottom-6 left-6 w-8 h-8 border-l border-b border-text-muted/10" />
      <div className="absolute bottom-6 right-6 w-8 h-8 border-r border-b border-text-muted/10" />
    </div>
  );
}
