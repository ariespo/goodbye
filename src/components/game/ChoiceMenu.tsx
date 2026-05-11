import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';

export function ChoiceMenu() {
  const parsedContent = useGameStore(state => state.api.parsedContent);
  const isStreaming = useGameStore(state => state.api.isStreaming);
  const { selectOption } = useGameLoop();

  const options = parsedContent.options;

  if (isStreaming || options.length === 0) return null;

  return (
    <div className="absolute bottom-[35%] left-1/2 -translate-x-1/2 w-[60%] max-w-[640px] min-w-[400px] flex flex-col gap-3">
      {options.map((option, index) => (
        <button
          key={index}
          className="group relative text-left px-5 py-4 bg-bg-primary/90 border border-border-subtle text-text-primary text-lg font-body-cn transition-all duration-250 hover:translate-x-2 hover:border-l-[3px] hover:border-l-accent-blue hover:bg-accent-blue/5"
          onClick={() => selectOption(option)}
        >
          <span className="text-text-muted font-mono mr-3 group-hover:text-accent-blue transition-colors">
            {index + 1}.
          </span>
          <span className="group-hover:text-shadow-[0_0_12px_rgba(107,140,255,0.2)]">
            {option}
          </span>
        </button>
      ))}
    </div>
  );
}
