import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { PaperPlaneRight } from '@phosphor-icons/react';

const PANEL_BG = 'rgba(12, 12, 16, 0.88)';
const BORDER = '#3a3a42';
const BORDER_BRIGHT = '#52525c';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#6a6560';
const ACCENT = '#6b8fc4';

export function UserInput() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const parsedContent = useGameStore(state => state.api.parsedContent);
  const isStreaming = useGameStore(state => state.api.isStreaming);
  const currentScene = useGameStore(state => state.game.currentScene);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const { sendMessage } = useGameLoop();

  const hasOptions = parsedContent.options.length > 0;
  const showInput = !hasOptions && !isStreaming && currentScene && sceneComplete;

  const handleSubmit = () => {
    if (!input.trim() || isWaitingForAI) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  if (!showInput) return null;

  return (
    <div
      className="absolute bottom-[1.5%] left-1/2 -translate-x-1/2 flex gap-2 z-30"
      style={{ width: 'min(85vw, 940px)' }}
    >
      {/* 输入框 */}
      <div className="flex-1 relative"
        style={{
          background: PANEL_BG,
          border: `2px solid ${BORDER}`,
          boxShadow: `inset 1px 1px 0 ${BORDER_BRIGHT}, inset -1px -1px 0 rgba(0,0,0,0.4), 2px 2px 0 rgba(0,0,0,0.3)`,
        }}
      >
        {/* 左侧像素装饰竖线 */}
        <div
          className="absolute left-0 top-0 bottom-0"
          style={{ width: 3, background: isWaitingForAI ? BORDER : ACCENT, opacity: 0.5 }}
        />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isWaitingForAI}
          placeholder={isWaitingForAI ? 'AI 思考中…' : '输入你想做的事情…'}
          className="w-full bg-transparent outline-none"
          style={{
            padding: '12px 16px 12px 20px',
            color: TEXT_MAIN,
            fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
            fontSize: '23px',
            letterSpacing: '0.05em',
          }}
        />
      </div>

      {/* 发送按钮 */}
      <PixelSendBtn onClick={handleSubmit} disabled={isWaitingForAI || !input.trim()} />
    </div>
  );
}

/* ── 像素发送按钮 ── */

function PixelSendBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false);

  const bg = disabled
    ? 'rgba(30,30,36,0.6)'
    : hovered
      ? 'rgba(107,143,196,0.18)'
      : 'rgba(12,12,16,0.88)';
  const border = disabled ? BORDER : hovered ? ACCENT : BORDER;
  const color = disabled ? TEXT_DIM : hovered ? ACCENT : TEXT_DIM;

  return (
    <button
      className="flex items-center justify-center select-none cursor-none transition-all duration-150"
      style={{
        width: 48,
        height: 48,
        background: bg,
        border: `2px solid ${border}`,
        color,
        boxShadow: hovered && !disabled
          ? `inset 1px 1px 0 rgba(255,255,255,0.06), 2px 2px 0 rgba(0,0,0,0.3)`
          : `inset 1px 1px 0 rgba(255,255,255,0.03), 2px 2px 0 rgba(0,0,0,0.3)`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      disabled={disabled}
    >
      <PaperPlaneRight size={30} />
    </button>
  );
}
