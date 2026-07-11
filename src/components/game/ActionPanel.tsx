import { useState } from 'react';

import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';
import { PixelFrame } from '../ui/PixelFrame';
import type { OrganizedClue } from '../../sillytavern/types';
import { saveChat } from '../../sillytavern/database';

const TEXT_MAIN = '#e2ded6';
const TEXT_DIM = '#8a8580';
const BLUE = '#86a8f2';
const GOLD = '#d4a853';
const DANGER = '#c94f4f';

export function ActionPanel() {
  const actionPanel = useGameStore(state => state.game.actionPanel);
  const currentScene = useGameStore(state => state.game.currentScene);
  const variables = useGameStore(state => state.tavern.variables);
  const chats = useGameStore(state => state.tavern.chats);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const setActionPanel = useGameStore(state => state.actions.setActionPanel);
  const setVariables = useGameStore(state => state.actions.setVariables);
  const setChats = useGameStore(state => state.actions.setChats);
  const addNotification = useGameStore(state => state.actions.addNotification);
  const { performAction } = useGameLoop();

  if (!actionPanel.visible) return null;

  const handleClose = () => {
    setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
  };

  const handleSelectItem = (index: number) => {
    if (actionPanel.type === 'investigate' && currentScene?.investigateItems) {
      performAction('investigate', index);
    } else if (actionPanel.type === 'act' && currentScene?.actionItems) {
      performAction('actions', index);
    }
  };

  const title = actionPanel.type === 'observe'
    ? '观 察'
    : actionPanel.type === 'investigate'
      ? '调 查'
      : actionPanel.type === 'act'
        ? '行 动'
        : '';
  const subTitle = actionPanel.type === 'observe'
    ? 'OBSERVATION LOG'
    : actionPanel.type === 'investigate'
      ? 'INVESTIGATION TARGETS'
      : 'ACTION ROUTES';
  const icon = actionPanel.type === 'observe'
    ? 'observe'
    : actionPanel.type === 'investigate'
      ? 'investigate'
      : actionPanel.type === 'act'
        ? 'action'
        : 'observe';
  const tone = actionPanel.type === 'act' ? 'gold' : 'blue';
  const isListType = actionPanel.type === 'investigate' || actionPanel.type === 'act';
  const items = actionPanel.type === 'investigate'
    ? currentScene?.investigateItems ?? []
    : actionPanel.type === 'act'
      ? currentScene?.actionItems ?? []
      : [];
  const organizedClues: OrganizedClue[] = Array.isArray(variables.organizedClues) ? variables.organizedClues : [];

  const handleOrganizeClue = (candidate: ClueCandidate) => {
    if (organizedClues.length >= 6) {
      addNotification({ type: 'error', message: '整理失败：线索栏已满（最多 6 条），请先处理现有线索', duration: 3800 });
      return;
    }

    const exists = organizedClues.some(clue => normalizeText(clue.description) === normalizeText(candidate.description));
    if (exists) {
      addNotification({ type: 'warning', message: '整理失败：这条线索已经整理过了', duration: 2800 });
      return;
    }

    const nextClue: OrganizedClue = {
      id: crypto.randomUUID(),
      title: candidate.title,
      description: candidate.description,
      source: '观察',
      createdAt: Date.now(),
    };

    const nextVariables = { ...variables, organizedClues: [...organizedClues, nextClue] };
    setVariables(nextVariables);
    const activeChat = chats.find(chat => chat.id === activeChatId);
    if (activeChat) {
      const updatedChat = { ...activeChat, variables: nextVariables, updatedAt: Date.now() };
      saveChat(updatedChat);
      setChats(chats.map(chat => chat.id === updatedChat.id ? updatedChat : chat));
    }
    addNotification({ type: 'success', message: `整理成功：已记录「${nextClue.title}」`, duration: 2800 });
  };

  return (
    <div
      className="action-panel absolute left-1/2 top-[8%] z-40 max-h-[420px] -translate-x-1/2 select-none"
      style={{ width: 'min(88vw, 980px)' }}
    >
      <PixelFrame
        variant="panel"
        className="w-full"
        contentClassName="pixel-scroll-blue max-h-[390px] overflow-y-auto pr-3"
        contentStyle={{ padding: '20px 24px 28px 24px' }}
        style={{
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 8px 8px 0 rgba(0,0,0,0.48), 0 0 34px rgba(0,0,0,0.42)',
        }}
      >
        <div className="mb-5 flex items-center justify-between border-b-2 border-[#25252d] pb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center"
              style={{
                backgroundImage: `url(${assetUrl(`assets/ui/action-slot-${tone}-hover.png`)})`,
                backgroundSize: '100% 100%',
                color: tone === 'gold' ? GOLD : BLUE,
                imageRendering: 'pixelated',
              }}
            >
              <GameIcon name={icon} size={25} />
            </div>
            <div>
              <div
                style={{
                  color: tone === 'gold' ? GOLD : BLUE,
                  fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
                  fontSize: 22,
                  letterSpacing: '0.22em',
                  lineHeight: 1.1,
                  textShadow: `0 0 12px ${tone === 'gold' ? 'rgba(212,168,83,0.25)' : 'rgba(107,143,196,0.25)'}`,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  color: TEXT_DIM,
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  marginTop: 4,
                }}
              >
                {subTitle}
              </div>
            </div>
          </div>
          <button
            aria-label="关闭"
            data-cursor="pointer"
            onClick={handleClose}
            className="pixel-close-button flex h-10 w-10 items-center justify-center"
            style={{
              cursor: 'pointer',
            }}
          >
            <GameIcon name="close" size={16} />
          </button>
        </div>

        {isListType ? (
          <div className="flex flex-col gap-3">
            {items.map((item, index) => (
              <ActionPanelItem
                key={`${index}-${item.desc}`}
                index={index}
                item={item}
                tone={tone}
                onClick={() => handleSelectItem(index)}
              />
            ))}
          </div>
        ) : (
          <ObserveContent
            text={actionPanel.content}
            organizedClues={organizedClues}
            onOrganize={handleOrganizeClue}
          />
        )}
      </PixelFrame>
    </div>
  );
}

type PanelItemData = {
  desc: string;
  time?: string | number;
  stamina?: number;
  sanity?: number;
  suspect?: string;
  style?: string;
};

function ActionPanelItem({ index, item, tone, onClick }: {
  index: number;
  item: PanelItemData;
  tone: 'blue' | 'gold';
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const accent = tone === 'gold' ? GOLD : BLUE;
  const sanityDanger = (item.sanity ?? 0) > 6;

  return (
    <button
      data-cursor="pointer"
      className="action-panel-item relative w-full overflow-hidden rounded-none text-left transition-[filter,transform] duration-100"
      style={{
        minHeight: 96,
        padding: '16px 20px 14px 24px',
        backgroundImage: `url(${assetUrl(`assets/ui/panel-item-${tone}-${hovered ? 'hover' : 'normal'}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        color: TEXT_MAIN,
        imageRendering: 'pixelated',
        cursor: 'pointer',
        filter: hovered ? `drop-shadow(0 0 14px ${accent}26)` : 'drop-shadow(3px 3px 0 rgba(0,0,0,0.34))',
        transform: pressed ? 'translate(2px, 2px)' : hovered ? 'translate(1px, 0)' : 'translate(0, 0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onClick={onClick}
    >
      <div className="mb-2 flex items-start gap-3">
        <span
          className="mt-1 inline-flex h-8 min-w-10 items-center justify-center"
          style={{
            border: `2px solid ${hovered ? accent : '#3a3a42'}`,
            background: 'rgba(0,0,0,0.24)',
            color: hovered ? accent : TEXT_DIM,
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 15,
            boxShadow: hovered ? `0 0 9px ${accent}33` : 'none',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          style={{
            color: hovered ? '#f0ede7' : TEXT_MAIN,
            fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
            fontSize: 20,
            lineHeight: 1.55,
          }}
        >
          {item.desc}
        </span>
      </div>
      <div
        className="action-panel-meta flex flex-wrap gap-2"
        style={{
          color: TEXT_DIM,
          fontFamily: '"MuzaiPixel", "JetBrains Mono", monospace',
          fontSize: 13,
          letterSpacing: '0.08em',
        }}
      >
        <MetaChip label="耗时" value={item.time ?? '--'} tone={tone} />
        <MetaChip label="体力" value={`-${item.stamina ?? 0}`} tone={tone} />
        <MetaChip label="理智" value={`-${item.sanity ?? 0}`} tone={sanityDanger ? 'red' : tone} />
        {'suspect' in item && item.suspect && <MetaChip label="关联" value={item.suspect} tone="blue" />}
        {'style' in item && item.style && <MetaChip label="方式" value={item.style} tone="gold" />}
      </div>
    </button>
  );
}

function MetaChip({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'gold' | 'red' }) {
  const color = tone === 'gold' ? GOLD : tone === 'red' ? DANGER : BLUE;
  const border = tone === 'gold' ? 'rgba(212,168,83,0.55)' : tone === 'red' ? 'rgba(201,79,79,0.55)' : 'rgba(134,168,242,0.55)';
  return (
    <span
      className="meta-chip inline-flex items-center gap-1 px-2 py-1"
      style={{
        color,
        border: `1px solid ${border}`,
        background: 'rgba(0,0,0,0.35)',
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.4), 0 0 8px ${color}22`,
      }}
    >
      <span style={{ color: TEXT_DIM }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

type ClueCandidate = {
  marker: string;
  title: string;
  description: string;
};

function ObserveContent({
  text,
  organizedClues,
  onOrganize,
}: {
  text: string;
  organizedClues: OrganizedClue[];
  onOrganize: (candidate: ClueCandidate) => void;
}) {
  const candidates = parseObserveClues(text);

  return (
    <div
      className="whitespace-pre-wrap"
      style={{
        color: TEXT_MAIN,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        fontSize: 20,
        lineHeight: 1.85,
        textShadow: '0 2px 0 rgba(0,0,0,0.62)',
      }}
    >
      {formatObserveText(text)}

      {candidates.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {candidates.map((candidate, index) => {
            const organized = organizedClues.some(clue => normalizeText(clue.description) === normalizeText(candidate.description));
            return (
              <div
                key={`${candidate.marker}-${index}-${candidate.title}`}
                className="relative w-full overflow-hidden rounded-none text-left"
                style={{
                  minHeight: 74,
                  padding: '12px 16px 12px 18px',
                  backgroundImage: `url(${assetUrl(`assets/ui/panel-item-blue-${organized ? 'disabled' : 'normal'}.png`)})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '100% 100%',
                  color: organized ? TEXT_DIM : TEXT_MAIN,
                  cursor: 'default',
                  opacity: organized ? 0.62 : 1,
                  imageRendering: 'pixelated',
                }}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span
                    className="observe-marker"
                    style={{
                      color: observeMarkerColor(candidate.marker),
                      fontSize: 16,
                      letterSpacing: '0.12em',
                      fontWeight: 700,
                      textShadow: `0 0 10px ${observeMarkerColor(candidate.marker)}44`,
                    }}
                  >
                    {candidate.marker}
                  </span>
                  <button
                    type="button"
                    data-sfx="clue-add"
                    data-cursor={organized ? undefined : 'pointer'}
                    disabled={organized}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOrganize(candidate);
                    }}
                    className={`clue-organize-btn inline-flex items-center gap-2 px-2 py-1 text-[13px] transition-[filter,transform] duration-100 disabled:cursor-default ${organized ? 'is-done' : ''}`}
                    style={{
                      color: organized ? TEXT_DIM : '#1a1408',
                      background: organized ? 'transparent' : GOLD,
                      border: `2px solid ${organized ? '#3a3a42' : GOLD}`,
                      boxShadow: organized ? 'none' : '2px 2px 0 #000, 0 0 10px rgba(212,168,83,0.35)',
                      cursor: organized ? 'default' : 'pointer',
                    }}
                    onMouseDown={(event) => {
                      if (!organized) event.currentTarget.style.transform = 'translate(1px, 1px)';
                    }}
                    onMouseUp={(event) => {
                      event.currentTarget.style.transform = 'translate(0, 0)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = 'translate(0, 0)';
                    }}
                  >
                    <GameIcon name={organized ? 'success' : 'plus'} size={14} />
                    {organized ? '已整理' : '+整理该线索'}
                  </button>
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.55 }}>{candidate.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function observeMarkerColor(marker: string): string {
  if (marker.includes('异常') || marker.includes('異常')) return DANGER;
  if (marker.includes('线索') || marker.includes('線索')) return GOLD;
  return BLUE; // 发现
}

function formatObserveText(text: string): React.ReactNode {
  const parts = text.split(/(\[(?:发现|發現|异常|異常|线索|線索)\])/g);
  return parts.map((part, index) => {
    if (/^\[(?:发现|發現|异常|異常|线索|線索)\]$/.test(part)) {
      const color = observeMarkerColor(part);
      return (
        <span
          key={index}
          className="observe-marker"
          data-marker={part}
          style={{
            color,
            fontWeight: 'bold',
            fontFamily: '"MuzaiPixel", monospace',
            textShadow: `0 0 10px ${color}55`,
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}

function parseObserveClues(text: string): ClueCandidate[] {
  const normalized = text.replace(/\r/g, '');
  const markerPattern = /\[(发现|發現|异常|異常|线索|線索)\]/g;
  const matches = Array.from(normalized.matchAll(markerPattern));

  if (matches.length === 0) {
    const fallback = normalized.trim();
    return fallback ? [{
      marker: '[发现]',
      title: makeClueTitle(fallback),
      description: fallback,
    }] : [];
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    const description = normalized.slice(start, end).trim();
    return {
      marker: match[0],
      title: makeClueTitle(description),
      description,
    };
  }).filter(candidate => candidate.description.length > 0);
}

function makeClueTitle(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact || '未命名线索';
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}
