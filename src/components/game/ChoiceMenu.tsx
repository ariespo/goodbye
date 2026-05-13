import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';

const PANEL_BG = 'rgba(12, 12, 16, 0.88)';
const BORDER = '#3a3a42';
const BORDER_HOVER = '#6b8fc4';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#6a6560';
const ACCENT = '#6b8fc4';

export function ChoiceMenu() {
  const parsedContent = useGameStore(state => state.api.parsedContent);
  const isStreaming = useGameStore(state => state.api.isStreaming);
  const { selectOption } = useGameLoop();

  const options = parsedContent.options;
  if (isStreaming || options.length === 0) return null;

  return (
    <div
      className="absolute bottom-[36%] left-1/2 -translate-x-1/2 flex flex-col gap-2 z-20"
      style={{ width: 'min(70vw, 720px)' }}
    >
      {options.map((option, index) => (
        <PixelChoiceBtn
          key={index}
          index={index}
          text={option}
          onClick={() => selectOption(option)}
        />
      ))}
    </div>
  );
}

/* ── 像素选项按钮 ── */

function PixelChoiceBtn({ index, text, onClick }: {
  index: number; text: string; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = hovered ? 'rgba(107,143,196,0.1)' : PANEL_BG;
  const border = hovered ? BORDER_HOVER : BORDER;
  const borderLeft = hovered ? `4px solid ${ACCENT}` : `2px solid ${BORDER}`;
  const textColor = hovered ? TEXT_MAIN : TEXT_DIM;
  const numColor = hovered ? ACCENT : TEXT_DIM;

  return (
    <button
      className="relative text-left select-none cursor-none transition-all duration-150"
      style={{
        background: bg,
        border: borderLeft,
        borderTop: `2px solid ${border}`,
        borderRight: `2px solid ${border}`,
        borderBottom: `2px solid ${border}`,
        padding: '14px 20px',
        color: textColor,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        fontSize: '16px',
        lineHeight: 1.6,
        boxShadow: hovered
          ? `inset 1px 1px 0 rgba(255,255,255,0.05), 3px 3px 0 rgba(0,0,0,0.35)`
          : `inset 1px 1px 0 rgba(255,255,255,0.02), 2px 2px 0 rgba(0,0,0,0.3)`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <span
        className="inline-block mr-3"
        style={{
          color: numColor,
          fontFamily: '"MuzaiPixel", monospace',
          fontSize: '13px',
          minWidth: 24,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <span>{text}</span>
    </button>
  );
}

import { useState } from 'react';
