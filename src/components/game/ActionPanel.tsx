import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';
import type { OrganizedClue } from '../../sillytavern/types';
import { saveChat } from '../../sillytavern/database';
import { findItemForInvestigation, getItemsForBackground } from '../../utils/itemAssetMatch';
import type { ItemAsset } from '../../data/itemAssets';
import { ItemViewer } from './ItemViewer';
import {
  PixelModalContent,
  PixelModalHeader,
  PixelModalListItem,
  PixelModalShell,
  PixelModalStatus,
} from '../ui/PixelModal';

type PanelItemData = {
  desc: string;
  time?: string | number;
  stamina?: number;
  sanity?: number;
  suspect?: string;
  style?: string;
};

type ActionPanelPayload = {
  visible: boolean;
  type: 'observe' | 'investigate' | 'act' | null;
  content: string;
  selectedIndex: number | null;
};

const CLOSE_MS = 220;
const MOBILE_ACTION_MEDIA_QUERY = '(max-width: 700px)';

function useNarrowActionViewport() {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_ACTION_MEDIA_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(MOBILE_ACTION_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isNarrow;
}

function useActionPanelPortalTarget(isNarrow: boolean) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isNarrow || typeof document === 'undefined') {
      setPortalTarget(null);
      return;
    }

    setPortalTarget(document.querySelector<HTMLElement>('.game-canvas') ?? document.body);
  }, [isNarrow]);

  return portalTarget;
}

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
  const background = useGameStore(state => state.game.currentState.background);
  const [viewingItem, setViewingItem] = useState<ItemAsset | null>(null);
  const [lastVisiblePayload, setLastVisiblePayload] = useState<ActionPanelPayload | null>(
    () => actionPanel.visible ? { ...actionPanel } : null,
  );
  const { performAction } = useGameLoop();
  const isNarrowActionViewport = useNarrowActionViewport();
  const actionPanelPortalTarget = useActionPanelPortalTarget(isNarrowActionViewport);

  useEffect(() => {
    if (actionPanel.visible) {
      setLastVisiblePayload({ ...actionPanel });
      return;
    }

    const timer = window.setTimeout(() => setLastVisiblePayload(null), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [actionPanel]);

  useEffect(() => {
    if (!actionPanel.visible) setViewingItem(null);
  }, [actionPanel.visible]);

  const panel = actionPanel.visible ? actionPanel : lastVisiblePayload ?? actionPanel;

  const handleClose = () => {
    setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
  };

  const handleSelectItem = (index: number) => {
    if (panel.type === 'investigate' && currentScene?.investigateItems) {
      performAction('investigate', index);
    } else if (panel.type === 'act' && currentScene?.actionItems) {
      performAction('actions', index);
    }
  };

  const title = panel.type === 'observe'
    ? '观察'
    : panel.type === 'investigate'
      ? '调查'
      : panel.type === 'act'
        ? '行动'
        : '操作';
  const isListType = panel.type === 'investigate' || panel.type === 'act';
  const items = panel.type === 'investigate'
    ? currentScene?.investigateItems ?? []
    : panel.type === 'act'
      ? currentScene?.actionItems ?? []
      : [];
  const meta = panel.type === 'observe'
    ? 'OBSERVATION LOG'
    : `AVAILABLE INTERACTIONS / ${items.length}`;
  const headerIcon = panel.type === 'act' ? 'action' : 'investigate';
  const organizedClues: OrganizedClue[] = Array.isArray(variables.organizedClues) ? variables.organizedClues : [];
  const sceneItems = panel.type === 'investigate' ? getItemsForBackground(background) : [];

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

  const dialog = (
    <PixelModalShell
        open={actionPanel.visible}
        onClose={handleClose}
        labelledBy="action-panel-title"
        className="action-panel"
        compact
      >
        <PixelModalHeader
          titleId="action-panel-title"
          title={title}
          meta={meta}
          iconSrc={headerIcon}
          onClose={handleClose}
          closeLabel={`关闭${title}`}
        />
        <PixelModalContent className="action-panel-content pixel-scroll-blue">
          {isListType ? (
            <div className="action-panel-list">
              {panel.type === 'investigate' && sceneItems.length > 0 && (
                <SceneItemShelf items={sceneItems} onOpen={setViewingItem} />
              )}
              {items.map((item, index) => (
                <ActionPanelItem
                  key={`${index}-${item.desc}`}
                  index={index}
                  item={item}
                  linkedItem={panel.type === 'investigate' ? findItemForInvestigation(item.desc, background) : undefined}
                  onOpenItem={setViewingItem}
                  onClick={() => handleSelectItem(index)}
                  actionType={panel.type === 'act' ? 'act' : 'investigate'}
                />
              ))}
            </div>
          ) : (
            <ObserveContent
              text={panel.content}
              organizedClues={organizedClues}
              onOrganize={handleOrganizeClue}
            />
          )}
        </PixelModalContent>
    </PixelModalShell>
  );

  const fallbackPortalTarget = typeof document === 'undefined' ? null : document.body;
  const portalTarget = actionPanelPortalTarget ?? fallbackPortalTarget;

  return (
    <>
      {isNarrowActionViewport && portalTarget ? createPortal(dialog, portalTarget) : dialog}
      {viewingItem && <ItemViewer item={viewingItem} onClose={() => setViewingItem(null)} />}
    </>
  );
}

function ActionPanelItem({ index, item, linkedItem, onOpenItem, onClick, actionType }: {
  index: number;
  item: PanelItemData;
  linkedItem?: ItemAsset;
  onOpenItem: (item: ItemAsset) => void;
  onClick: () => void;
  actionType: 'investigate' | 'act';
}) {
  return (
    <div className="action-panel-card">
      <PixelModalListItem
        data-cursor="pointer"
        className="action-panel-item"
        onClick={onClick}
        aria-label={`执行${actionType === 'act' ? '行动' : '调查'} ${item.desc}`}
      >
        <span className="action-panel-item-icon" aria-hidden="true">
          <GameIcon name={actionType === 'act' ? 'action' : 'investigate'} size={26} />
        </span>
        <span className="action-panel-item-copy">
          <span className="action-panel-item-title">{item.desc}</span>
          <span className="action-panel-item-meta">
            <MetaChip label="耗时" value={item.time ?? '--'} />
            <MetaChip label="体力" value={`-${item.stamina ?? 0}`} />
            <MetaChip label="理智" value={`-${item.sanity ?? 0}`} />
            {'suspect' in item && item.suspect && <MetaChip label="关联" value={item.suspect} />}
            {'style' in item && item.style && <MetaChip label="方式" value={item.style} />}
          </span>
        </span>
        <span className="action-panel-item-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      </PixelModalListItem>
      {linkedItem && (
        <button
          type="button"
          data-cursor="pointer"
          data-sfx="investigate-object"
          className="action-panel-item-viewer"
          onClick={() => onOpenItem(linkedItem)}
          aria-label={`查看${linkedItem.displayName}`}
        >
          <img src={assetUrl(`assets/images/items/${linkedItem.file}`)} alt="" style={{ imageRendering: 'pixelated' }} />
        </button>
      )}
    </div>
  );
}

function SceneItemShelf({ items, onOpen }: { items: ItemAsset[]; onOpen: (item: ItemAsset) => void }) {
  return (
    <div className="action-panel-scene-items">
      <span>SCENE ITEMS</span>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          data-cursor="pointer"
          data-sfx="investigate-object"
          title={item.displayName}
          onClick={() => onOpen(item)}
          aria-label={`查看${item.displayName}`}
        >
          <img src={assetUrl(`assets/images/items/${item.file}`)} alt="" style={{ imageRendering: 'pixelated' }} />
        </button>
      ))}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string | number }) {
  return <PixelModalStatus className="action-panel-meta-chip">{label} {value}</PixelModalStatus>;
}

type ClueCandidate = { marker: string; title: string; description: string; };

function ObserveContent({ text, organizedClues, onOrganize }: {
  text: string;
  organizedClues: OrganizedClue[];
  onOrganize: (candidate: ClueCandidate) => void;
}) {
  const candidates = parseObserveClues(text);

  return (
    <div className="action-panel-observe-copy">
      {formatObserveText(text)}
      {candidates.length > 0 && (
        <div className="action-panel-candidates">
          {candidates.map((candidate, index) => {
            const organized = organizedClues.some(clue => normalizeText(clue.description) === normalizeText(candidate.description));
            return (
              <div key={`${candidate.marker}-${index}-${candidate.title}`} className={`clue-candidate-card action-panel-candidate ${organized ? 'is-organized' : ''}`}>
                <div className="action-panel-candidate-header">
                  <span className="observe-marker">{candidate.marker}</span>
                  <button
                    type="button"
                    data-sfx="clue-add"
                    data-cursor={organized ? undefined : 'pointer'}
                    disabled={organized}
                    onClick={() => onOrganize(candidate)}
                    className={`clue-organize-btn ${organized ? 'is-done' : ''}`}
                    aria-label={organized ? `线索已整理：${candidate.title}` : `整理线索：${candidate.title}`}
                  >
                    <GameIcon name={organized ? 'success' : 'plus'} size={14} />
                    {organized ? '已整理' : '整理线索'}
                  </button>
                </div>
                <div className="action-panel-candidate-description">{candidate.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatObserveText(text: string): React.ReactNode {
  const parts = text.split(/(\[(?:发现|發現|异常|異常|线索|線索)\])/g);
  return parts.map((part, index) => {
    if (/^\[(?:发现|發現|异常|異常|线索|線索)\]$/.test(part)) {
      return <span key={index} className="observe-marker" data-marker={part}>{part}</span>;
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
    return fallback ? [{ marker: '[发现]', title: makeClueTitle(fallback), description: fallback }] : [];
  }
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    const description = normalized.slice(start, end).trim();
    return { marker: match[0], title: makeClueTitle(description), description };
  }).filter(candidate => candidate.description.length > 0);
}

function makeClueTitle(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact || '未命名线索';
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').trim();
}
