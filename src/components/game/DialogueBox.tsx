import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useTypewriter } from '../../hooks/useTypewriter';
import { OPENING_STORYLINE } from '../../engine/opening-storyline';
import { maintextToScene } from '../../engine/scene-parser';
import { Play, Pause, FastForward, CaretDown } from '@phosphor-icons/react';

/* ── 像素风对话框 ── */

const PANEL_BG = 'rgba(12, 12, 16, 0.92)';
const BORDER = '#3a3a42';
const BORDER_BRIGHT = '#52525c';
const CORNER = '#5a5a64';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#7a756e';
const ACCENT = '#6b8fc4';

export function DialogueBox() {
  const currentScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const settings = useGameStore(state => state.tavern.settings);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);

  const setCurrentLineIndex = useGameStore(state => state.actions.setCurrentLineIndex);
  const setCurrentState = useGameStore(state => state.actions.setCurrentState);
  const setIsTyping = useGameStore(state => state.actions.setIsTyping);
  const setCurrentScene = useGameStore(state => state.actions.setCurrentScene);

  const autoMode = settings?.autoMode ?? false;
  const autoIntervalMs = settings?.autoIntervalMs ?? 1500;
  const typingSpeed = settings?.typingSpeed || 35;

  const currentLine = currentScene?.lines[currentLineIndex];
  const isLastLine = currentLineIndex >= (currentScene?.lines.length ?? 0) - 1;

  const userName = settings?.userName || '玩家';
  const characterName = settings?.characterName || '少女';
  const displaySpeaker = applyMacros(currentLine?.speaker || '', userName, characterName);
  const displayText = applyMacros(currentLine?.text || '', userName, characterName);

  const { displayedText, isComplete, skip } = useTypewriter(displayText, typingSpeed, true);

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoMode && isComplete && currentLine && !isLastLine) {
      autoTimerRef.current = setTimeout(() => handleAdvance(), autoIntervalMs);
    }
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [autoMode, isComplete, currentLineIndex, currentScene, autoIntervalMs]);

  const handleAdvance = useCallback(() => {
    if (!currentScene) return;
    if (!isComplete) { skip(); return; }
    if (currentLineIndex < currentScene.lines.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
    }
  }, [currentScene, currentLineIndex, isComplete, skip, setCurrentLineIndex]);

  const handleStartOrAdvance = useCallback(() => {
    if (!currentScene) {
      const state = useGameStore.getState();
      const chat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);
      if (chat) {
        const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistant) {
          const maintext = lastAssistant.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim() || '';
          if (maintext) {
            const scene = maintextToScene(maintext);
            if (scene.lines.length > 0) { setCurrentScene(scene); return; }
          }
        }
      }
      setCurrentScene(maintextToScene(OPENING_STORYLINE));
      return;
    }
    handleAdvance();
  }, [currentScene, handleAdvance, setCurrentScene]);

  useEffect(() => {
    if (!currentLine) return;
    setCurrentState({
      background: currentLine.background || null,
      bgm: currentLine.bgm || null,
      character: currentLine.character ?? null,
      mood: currentLine.emotion || 'calm',
    });
    setIsTyping(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIndex, currentScene]);

  useEffect(() => { if (isComplete) setIsTyping(false); }, [isComplete, setIsTyping]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleStartOrAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStartOrAdvance]);

  const showNextArrow = isComplete && !isLastLine;
  const isNarrator = currentLine?.speaker === '旁白';
  const showSpeaker = !isNarrator && displaySpeaker;

  /* 初始状态（无场景） */
  if (!currentScene || !currentLine) {
    return (
      <PixelPanel onClick={handleStartOrAdvance}>
        <div className="text-center cursor-pointer" style={{ color: TEXT_DIM, fontSize: '27px', fontFamily: '"MuzaiPixel", "LXGW WenKai", serif' }}>
          {isWaitingForAI ? '等待AI回应…' : '点击开始游戏'}
        </div>
      </PixelPanel>
    );
  }

  return (
    <PixelPanel onClick={handleStartOrAdvance}>
      {/* 左上角角色名称 */}
      {showSpeaker && (
        <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 2 }}>
          <PixelTag text={displaySpeaker} />
          {currentLine.emotion && currentLine.emotion !== 'calm' && (
            <span
              className="ml-2"
              style={{ fontSize: '17px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.15em' }}
            >
              [{emotionLabel(currentLine.emotion)}]
            </span>
          )}
        </div>
      )}

      {/* 主文本 — 顶部留出角色名空间 */}
      <div
        className={`whitespace-pre-wrap select-none ${emotionTextClass(currentLine.emotion)}`}
        style={{
          marginTop: showSpeaker ? 44 : 0,
          fontSize: '33px',
          lineHeight: 1.8,
          color: TEXT_MAIN,
          fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
          ...emotionTextStyle(currentLine.emotion),
        }}
      >
        {displayedText}
        {!isComplete && (
          <span
            className="inline-block align-middle"
            style={{
              width: '4px',
              height: '1.1em',
              background: ACCENT,
              marginLeft: '6px',
              animation: 'cursorBlink 0.75s infinite',
            }}
          />
        )}
        {showNextArrow && (
          <span className="inline-block ml-2" style={{ color: ACCENT, animation: 'pulse 0.8s infinite' }}>
            <CaretDown size={27} />
          </span>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="absolute bottom-3 right-4 flex gap-2">
        <PixelIconBtn
          active={autoMode}
          onClick={(e) => { e.stopPropagation(); }}
          icon={autoMode ? <Play size={21} weight="fill" /> : <Pause size={21} />}
          label={autoMode ? '自动' : '手动'}
        />
        <PixelIconBtn
          onClick={(e) => { e.stopPropagation(); skip(); }}
          icon={<FastForward size={21} />}
          label="快进"
        />
      </div>
    </PixelPanel>
  );
}

/* ── 像素风面板外壳 ── */

function PixelPanel({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className="absolute bottom-[5%] left-1/2 -translate-x-1/2 select-none"
      style={{ width: 'min(88vw, 980px)', minHeight: '120px', maxHeight: '420px', zIndex: 20 }}
      onClick={onClick}
    >
      {/* 主体背景 */}
      <div
        className="relative w-full h-full overflow-y-auto"
        style={{
          background: PANEL_BG,
          border: `3px solid ${BORDER}`,
          padding: '24px 28px 32px 28px',
          boxShadow:
            `inset 2px 2px 0 ${BORDER_BRIGHT},` +
            `inset -2px -2px 0 rgba(0,0,0,0.5),` +
            `4px 4px 0 rgba(0,0,0,0.6),` +
            `5px 5px 0 rgba(0,0,0,0.4),` +
            `6px 6px 0 rgba(0,0,0,0.2)`,
        }}
      >
        {children}
      </div>

      {/* 四角像素装饰 */}
      <div style={{ position: 'absolute', top: -4, left: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, left: -4, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, right: -2, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -4, left: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -2, left: -4, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 3, height: 10, background: CORNER }} />

      {/* 扫描线覆盖 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.02]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />
    </div>
  );
}

/* ── 像素风 Speaker 标签 ── */

function PixelTag({ text }: { text: string }) {
  return (
    <div
      className="inline-flex items-center px-3 py-1"
      style={{
        background: 'rgba(107, 143, 196, 0.12)',
        border: `2px solid rgba(107, 143, 196, 0.35)`,
        color: ACCENT,
        fontSize: '20px',
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        letterSpacing: '0.15em',
        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.05), 2px 2px 0 rgba(0,0,0,0.3)',
      }}
    >
      {text}
    </div>
  );
}

/* ── 像素风图标按钮 ── */

function PixelIconBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  const bg = active ? 'rgba(107,143,196,0.18)' : hovered ? 'rgba(107,143,196,0.1)' : 'transparent';
  const border = active ? 'rgba(107,143,196,0.5)' : hovered ? 'rgba(107,143,196,0.4)' : BORDER;
  const color = active ? ACCENT : hovered ? ACCENT : TEXT_DIM;

  return (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1.5 select-none cursor-none transition-all duration-150"
      style={{
        background: bg,
        border: `2px solid ${border}`,
        color,
        fontSize: '17px',
        fontFamily: '"MuzaiPixel", monospace',
        letterSpacing: '0.1em',
        boxShadow: hovered
          ? 'inset 1px 1px 0 rgba(255,255,255,0.05), 2px 2px 0 rgba(0,0,0,0.3)'
          : 'inset 1px 1px 0 rgba(255,255,255,0.03)',
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

/* ── 辅助函数 ── */

import React from 'react';

function emotionLabel(m: string): string {
  const map: Record<string, string> = {
    calm: '平静', horror: '恐惧', insane: '疯狂',
    sad: '悲伤', angry: '愤怒', happy: '开心',
  };
  return map[m] || m;
}

function emotionTextClass(emotion: string | undefined): string {
  switch (emotion) {
    case 'horror': return 'animate-[textHorror_2.5s_infinite]';
    case 'insane': return 'animate-[textInsane_1.5s_infinite]';
    case 'sad': return 'animate-[textSad_3s_infinite_ease-in-out]';
    case 'angry': return 'animate-[textAngry_1.2s_infinite]';
    case 'happy': return 'animate-[textHappy_2s_infinite_ease-in-out]';
    default: return '';
  }
}

function emotionTextStyle(emotion: string | undefined): React.CSSProperties {
  switch (emotion) {
    case 'horror': return { color: '#ddd8d0' };
    case 'insane': return { color: '#e0d8e8' };
    case 'sad': return { color: '#c8d4e0' };
    case 'angry': return { color: '#f0d8d8' };
    case 'happy': return { color: '#f0e8d0' };
    default: return {};
  }
}

function applyMacros(s: string, user: string, char: string): string {
  if (!s) return s;
  return s.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, char);
}
