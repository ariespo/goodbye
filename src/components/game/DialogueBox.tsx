import { useGameStore } from '../../stores/gameStore';
import { useTypewriter } from '../../hooks/useTypewriter';
import { Play, FastForward } from '@phosphor-icons/react';
import { useCallback } from 'react';

export function DialogueBox() {
  const currentScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const settings = useGameStore(state => state.tavern.settings);
  const setCurrentLineIndex = useGameStore(state => state.actions.setCurrentLineIndex);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);

  const currentLine = currentScene?.lines[currentLineIndex];
  const typingSpeed = settings?.typingSpeed || 35;

  const { displayedText, isComplete, skip } = useTypewriter(
    currentLine?.text || '',
    typingSpeed,
    true
  );

  const handleClick = useCallback(() => {
    if (!currentScene) return;

    if (!isComplete) {
      skip();
      return;
    }

    if (currentLineIndex < currentScene.lines.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
    }
  }, [currentScene, currentLineIndex, isComplete, skip, setCurrentLineIndex]);

  if (!currentScene || !currentLine) {
    return (
      <div
        className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[85vw] max-w-[960px] min-h-[120px] max-h-[400px] bg-bg-primary/92 backdrop-blur-sm border-2 border-border-subtle p-6 overflow-y-auto"
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

  return (
    <div
      className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[85vw] max-w-[960px] min-h-[120px] max-h-[400px] bg-bg-primary/92 backdrop-blur-sm border-2 border-border-subtle p-6 overflow-y-auto transition-colors duration-300 hover:border-[#3a3a4a] active:translate-y-[2px]"
      style={{
        boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)',
      }}
      onClick={handleClick}
    >
      {currentLine.speaker && (
        <div
          className="inline-block px-3 py-1 mb-3 bg-bg-secondary border border-border-subtle text-accent-blue text-sm font-serif-cn tracking-widest animate-[slideInLeft_0.3s_ease-out]"
        >
          {currentLine.speaker}
        </div>
      )}

      <div className="text-text-primary text-[22px] leading-[1.8] font-body-cn whitespace-pre-wrap">
        {displayedText.split('').map((char, i) => (
          <span
            key={i}
            className="inline-block animate-[charFadeIn_0.2s_forwards]"
            style={{ animationDelay: `${i * 0.01}s` }}
          >
            {char === '\n' ? <br /> : char}
          </span>
        ))}
        {!isComplete && (
          <span className="inline-block w-[2px] h-[1em] bg-accent-blue ml-1 animate-[cursorBlink_0.8s_infinite]" />
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex gap-2">
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-muted border border-border-subtle hover:border-accent-blue hover:text-accent-blue hover:bg-accent-blue/10 transition-all duration-200"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <Play size={12} />
          自动
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
