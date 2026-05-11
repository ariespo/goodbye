import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { PaperPlaneRight } from '@phosphor-icons/react';

export function UserInput() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const parsedContent = useGameStore(state => state.api.parsedContent);
  const isStreaming = useGameStore(state => state.api.isStreaming);
  const currentScene = useGameStore(state => state.game.currentScene);
  const { sendMessage } = useGameLoop();

  // 当有选项时隐藏输入框，没有选项且不在流式传输时显示
  const hasOptions = parsedContent.options.length > 0;
  const showInput = !hasOptions && !isStreaming && currentScene;

  const handleSubmit = () => {
    if (!input.trim() || isWaitingForAI) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  if (!showInput) return null;

  return (
    <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2 w-[80%] max-w-[960px] flex gap-2 z-30">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isWaitingForAI}
        placeholder={isWaitingForAI ? 'AI 思考中...' : '输入你想做的事情...'}
        className="flex-1 px-4 py-3 bg-bg-primary/80 backdrop-blur-sm border border-border-subtle text-text-primary font-body-cn text-base focus:border-accent-blue focus:outline-none transition-colors disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={isWaitingForAI || !input.trim()}
        className="px-4 py-3 border border-border-subtle text-text-muted hover:border-accent-blue hover:text-accent-blue hover:bg-accent-blue/10 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <PaperPlaneRight size={20} />
      </button>
    </div>
  );
}
