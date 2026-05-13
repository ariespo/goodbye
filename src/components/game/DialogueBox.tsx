import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useTypewriter } from '../../hooks/useTypewriter';
import { Play, Pause, FastForward, CaretDown } from '@phosphor-icons/react';

export function DialogueBox() {
  const currentScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const settings = useGameStore(state => state.tavern.settings);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);

  const setCurrentLineIndex = useGameStore(state => state.actions.setCurrentLineIndex);
  const setCurrentState = useGameStore(state => state.actions.setCurrentState);
  const setIsTyping = useGameStore(state => state.actions.setIsTyping);

  const autoMode = settings?.autoMode ?? false;
  const autoIntervalMs = settings?.autoIntervalMs ?? 1500;
  const typingSpeed = settings?.typingSpeed || 35;

  const currentLine = currentScene?.lines[currentLineIndex];
  const isLastLine = currentLineIndex >= (currentScene?.lines.length ?? 0) - 1;

  const userName = settings?.userName || '玩家';
  const characterName = settings?.characterName || '少女';
  const displaySpeaker = applyMacros(currentLine?.speaker || '', userName, characterName);
  const displayText = applyMacros(currentLine?.text || '', userName, characterName);

  const { displayedText, isComplete, skip } = useTypewriter(
    displayText,
    typingSpeed,
    true
  );

  // 自动推进
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoMode && isComplete && currentLine && !isLastLine) {
      autoTimerRef.current = setTimeout(() => {
        handleAdvance();
      }, autoIntervalMs);
    }
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [autoMode, isComplete, currentLineIndex, currentScene, autoIntervalMs]);

  // 推进到下一行(或等 AI)
  const handleAdvance = useCallback(() => {
    if (!currentScene) return;
    if (!isComplete) {
      skip();
      return;
    }
    if (currentLineIndex < currentScene.lines.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
    }
  }, [currentScene, currentLineIndex, isComplete, skip, setCurrentLineIndex]);

  // 同步当前行的背景/音乐/立绘/情绪到全局状态
  useEffect(() => {
    if (!currentLine) return;
    if (currentLine.background) setCurrentState({ background: currentLine.background });
    if (currentLine.bgm) setCurrentState({ bgm: currentLine.bgm });
    if (currentLine.character !== undefined) setCurrentState({ character: currentLine.character });
    if (currentLine.emotion) setCurrentState({ mood: currentLine.emotion });
    setIsTyping(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIndex, currentScene]);

  // 打字完成时标记 isTyping = false
  useEffect(() => {
    if (isComplete) setIsTyping(false);
  }, [isComplete, setIsTyping]);

  // 空格/Enter 推进
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAdvance]);

  // 自动模式的闪烁箭头
  const showNextArrow = isComplete && !isLastLine;

  if (!currentScene || !currentLine) {
    return (
      <div
        className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[85vw] max-w-[960px] min-h-[120px] max-h-[400px] bg-bg-primary/92 backdrop-blur-sm border-2 border-border-subtle p-6 overflow-y-auto flex items-center justify-center"
        style={{
          boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div className="text-text-muted text-lg font-body-cn text-center">
          {isWaitingForAI ? '等待AI回应...' : '点击开始游戏'}
        </div>
      </div>
    );
  }

  const isNarrator = currentLine.speaker === '旁白';

  return (
    <div
      className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[85vw] max-w-[960px] min-h-[120px] max-h-[400px] bg-bg-primary/92 backdrop-blur-sm border-2 border-border-subtle p-6 overflow-y-auto select-none"
      style={{
        boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)',
      }}
      onClick={handleAdvance}
    >
      {/* Speaker 标签 (旁白不显示) */}
      {!isNarrator && displaySpeaker && (
        <div
          className="inline-block px-3 py-1 mb-3 bg-bg-secondary border border-border-subtle text-accent-blue text-sm font-serif-cn tracking-widest animate-[slideInLeft_0.3s_ease-out]"
        >
          {displaySpeaker}
        </div>
      )}

      {/* 情绪微标(仅情绪非 calm) */}
      {!isNarrator && currentLine.emotion && currentLine.emotion !== 'calm' && (
        <div className="inline-block ml-2 text-[10px] text-text-muted uppercase tracking-widest mb-3 align-top"
          style={{ color: `var(--mood-text-color, #e8e4dc)` }}
        >
          [{emotionLabel(currentLine.emotion)}]
        </div>
      )}

      {/* 文本内容 */}
      <div className="text-text-primary text-[22px] leading-[1.8] font-body-cn whitespace-pre-wrap">
        {displayedText}
        {!isComplete && (
          <span className="inline-block w-[2px] h-[1em] bg-accent-blue ml-1 animate-[cursorBlink_0.8s_infinite]" />
        )}
        {showNextArrow && (
          <span className="inline-block ml-2 text-accent-blue animate-[pulse_0.8s_infinite]">
            <CaretDown size={18} />
          </span>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          className={`flex items-center gap-1 px-2 py-1 text-xs border transition-all duration-200 ${
            autoMode
              ? 'border-accent-blue text-accent-blue bg-accent-blue/10'
              : 'border-border-subtle text-text-muted hover:border-accent-blue hover:text-accent-blue hover:bg-accent-blue/10'
          }`}
          onClick={(e) => { e.stopPropagation(); }}
          title="自动模式(可在设置调整间隔)"
        >
          {autoMode ? <Play size={12} weight="fill" /> : <Pause size={12} />}
          {autoMode ? '自动' : '手动'}
        </button>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted border border-border-subtle hover:border-accent-blue hover:text-accent-blue hover:bg-accent-blue/10 transition-all duration-200"
          onClick={(e) => { e.stopPropagation(); skip(); }}
        >
          <FastForward size={12} />
          快进
        </button>
      </div>
    </div>
  );
}

function emotionLabel(m: string): string {
  const map: Record<string, string> = {
    calm: '平静', horror: '恐惧', insane: '疯狂',
    sad: '悲伤', angry: '愤怒', happy: '开心',
  };
  return map[m] || m;
}

function applyMacros(s: string, user: string, char: string): string {
  if (!s) return s;
  return s.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, char);
}
