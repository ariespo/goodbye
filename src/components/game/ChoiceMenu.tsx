import { useMemo, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';
import { getCycleMetaOptions, handleCycleMetaOption } from '../../utils/cycleLoop';
import { shouldShowChoiceMenu } from './choiceMenuVisibility';
import { UserInput } from './UserInput';

const TEXT_MAIN = '#e2ded6';
const TEXT_DIM = '#8a8580';
const TEXT_DISABLED = '#4a4542';
const ACCENT = '#86a8f2';

export function ChoiceMenu() {
  const parsedContent = useGameStore(state => state.api.parsedContent);
  const isStreaming = useGameStore(state => state.api.isStreaming);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const endingVisible = useGameStore(state => state.game.endingPanel.visible);
  const variables = useGameStore(state => state.tavern.variables);
  const endingsSeen = useGameStore(state => state.game.endingsSeen);
  const { selectOption, reroll } = useGameLoop();

  const options = parsedContent.options;
  const metaOptions = useMemo(
    () => getCycleMetaOptions(variables, endingsSeen).filter(option => !options.includes(option)),
    [variables, endingsSeen, options],
  );
  if (!shouldShowChoiceMenu({
    endingVisible,
    isStreaming,
    sceneComplete,
    hasOptions: options.length > 0 || metaOptions.length > 0,
  })) return null;

  return (
    <div
      className="choice-menu absolute bottom-[36%] left-1/2 z-20 flex -translate-x-1/2 flex-col gap-2"
      style={{ width: 'min(72vw, 760px)' }}
    >
      {options.map((option, index) => (
        <PixelChoiceBtn
          key={`${index}-${option}`}
          index={index}
          text={option}
          disabled={isWaitingForAI}
          onClick={() => selectOption(option)}
        />
      ))}
      {metaOptions.map((option, index) => (
        <PixelChoiceBtn
          key={`meta-${option}`}
          index={options.length + index}
          text={option}
          disabled={isWaitingForAI}
          onClick={() => { void handleCycleMetaOption(option); }}
        />
      ))}
      <UserInput embedded />
      {options.length > 0 && <RerollBtn disabled={isWaitingForAI} onClick={() => reroll()} />}
    </div>
  );
}

function PixelChoiceBtn({ index, text, disabled, onClick }: {
  index: number;
  text: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isDisabled = !!disabled;
  const state = isDisabled ? 'disabled' : hovered ? 'hover' : 'normal';

  return (
    <button
      data-cursor={isDisabled ? undefined : 'pointer'}
      className="choice-button relative min-h-[86px] select-none overflow-hidden rounded-none text-left transition-[filter,transform] duration-100"
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/choice-frame-${state}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        padding: '16px 24px 16px 28px',
        color: isDisabled ? TEXT_DISABLED : hovered ? TEXT_MAIN : TEXT_DIM,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        fontSize: '23px',
        lineHeight: 1.55,
        opacity: isDisabled ? 0.52 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        imageRendering: 'pixelated',
        filter: hovered && !isDisabled ? 'drop-shadow(0 0 12px rgba(107,143,196,0.26))' : 'drop-shadow(3px 3px 0 rgba(0,0,0,0.42))',
        transform: pressed ? 'translate(2px, 2px)' : hovered ? 'translate(1px, 0)' : 'translate(0, 0)',
      }}
      onMouseEnter={() => {
        if (!isDisabled) setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => {
        if (!isDisabled) setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
      onClick={() => {
        if (!isDisabled) onClick();
      }}
      disabled={isDisabled}
    >
      <span
        className="mr-4 inline-flex h-8 min-w-10 items-center justify-center align-top"
        style={{
          color: isDisabled ? TEXT_DISABLED : hovered ? ACCENT : TEXT_DIM,
          border: `2px solid ${hovered && !isDisabled ? ACCENT : '#3a3a42'}`,
          background: 'rgba(0,0,0,0.22)',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '16px',
          lineHeight: 1,
          boxShadow: hovered && !isDisabled ? '0 0 8px rgba(107,143,196,0.28)' : 'none',
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <span>{text}</span>
      {hovered && !isDisabled && (
        <span
          className="pointer-events-none absolute right-5 top-1/2 h-3 w-3 -translate-y-1/2"
          style={{
            background: ACCENT,
            clipPath: 'polygon(0 0, 100% 50%, 0 100%)',
            filter: 'drop-shadow(0 0 6px rgba(107,143,196,0.7))',
          }}
        />
      )}
    </button>
  );
}

function RerollBtn({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isDisabled = !!disabled;

  return (
    <button
      data-cursor={isDisabled ? undefined : 'pointer'}
      className="choice-reroll-button relative mt-2 flex min-h-14 select-none items-center gap-3 overflow-hidden rounded-none px-6 text-left transition-[filter,transform] duration-100"
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/choice-frame-${isDisabled ? 'disabled' : hovered ? 'hover' : 'normal'}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        color: isDisabled ? TEXT_DISABLED : hovered ? '#d4a853' : TEXT_DIM,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        fontSize: '18px',
        opacity: isDisabled ? 0.52 : 0.9,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transform: pressed ? 'translate(2px, 2px)' : 'translate(0, 0)',
        filter: hovered && !isDisabled ? 'drop-shadow(0 0 10px rgba(212,168,83,0.22))' : 'drop-shadow(2px 2px 0 rgba(0,0,0,0.36))',
        imageRendering: 'pixelated',
      }}
      onMouseEnter={() => {
        if (!isDisabled) setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => {
        if (!isDisabled) setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
      onClick={() => {
        if (!isDisabled) onClick();
      }}
      disabled={isDisabled}
    >
      <GameIcon name="restart" size={20} />
      <span>尝试进入其他时间线</span>
    </button>
  );
}
