import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { GameIcon } from '../ui/GameIcon';
import type { OrganizedClue } from '../../sillytavern/types';
import { saveChat } from '../../sillytavern/database';
import { ConfirmModal } from '../system/ConfirmModal';
import {
  PixelModalAction,
  PixelModalContent,
  PixelModalFooter,
  PixelModalHeader,
  PixelModalListItem,
  PixelModalShell,
} from '../ui/PixelModal';

const MOBILE_CLUE_MEDIA_QUERY = '(max-width: 700px)';

function useNarrowClueViewport() {
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_CLUE_MEDIA_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(MOBILE_CLUE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isNarrow;
}

function useCluePortalTarget(isNarrow: boolean) {
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

export function ClueModal() {
  const showClues = useGameStore(state => state.ui.showClues);
  const variables = useGameStore(state => state.tavern.variables);
  const settings = useGameStore(state => state.tavern.settings);
  const chats = useGameStore(state => state.tavern.chats);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const { toggleModal, setVariables, setChats, addNotification } = useGameStore(state => state.actions);
  const { sendMessage } = useGameLoop();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const isNarrowClueViewport = useNarrowClueViewport();
  const cluePortalTarget = useCluePortalTarget(isNarrowClueViewport);

  const clues = useMemo<OrganizedClue[]>(
    () => Array.isArray(variables.organizedClues) ? variables.organizedClues : [],
    [variables.organizedClues]
  );

  const close = () => toggleModal('clues');

  const updateClues = (next: OrganizedClue[]) => {
    const nextVariables = { ...variables, organizedClues: next };
    setVariables(nextVariables);
    const activeChat = chats.find(chat => chat.id === activeChatId);
    if (activeChat) {
      const updatedChat = { ...activeChat, variables: nextVariables, updatedAt: Date.now() };
      saveChat(updatedChat);
      setChats(chats.map(chat => chat.id === updatedChat.id ? updatedChat : chat));
    }
    setSelectedIds(ids => ids.filter(id => next.some(clue => clue.id === id)));
  };

  const removeClue = (id: string) => {
    updateClues(clues.filter(clue => clue.id !== id));
    setPendingDeleteId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  };

  const handleInfer = () => {
    const selected = clues.filter(clue => selectedIds.includes(clue.id));
    if (selected.length < 2) {
      addNotification({ type: 'warning', message: '至少选择两条线索再尝试推理', duration: 3000 });
      return;
    }

    const userName = settings?.userName || '玩家';
    const sanity = Number(variables.sanity ?? 80);
    const clueText = selected.map((clue, index) =>
      `${index + 1}. ${clue.title}\n来源：${clue.source}\n内容：${clue.description}`
    ).join('\n\n');

    const prompt = `${userName}尝试将以下线索结合在一起，对整个事件进行推理：

${clueText}

请根据${userName}整理的线索，构建本次剧情的内容。剧情将主要为${userName}推理的过程、得出的结论/初步判断，并根据最后的结论/判断，在<vars>部分调整对应的变量（好感度、理智值、怀疑度、调查进度）。

当前${userName}的sanity值为${sanity}。sanity越高，推理就越有条理，越符合逻辑和现实，结论也就越合理和越正常；sanity越低，推理中混乱思维、超现实、黑暗、呓语、重复的疯狂言语就会越多，且结论就会越离奇。

如果结论/判断比较难以接受、恐怖、令人震惊或不合常理，则${userName}会进一步降低sanity，并且有可能推理完毕后做出疯狂、反常的行动，或生成疯狂、反常行动选项。`;

    close();
    sendMessage(prompt);
  };

  const dialog = (
    <PixelModalShell
      open={showClues}
      onClose={close}
      labelledBy="clue-modal-title"
      className="clue-modal-shell"
      closeBlocked={pendingDeleteId !== null}
    >
      <PixelModalHeader
        titleId="clue-modal-title"
        title="线索"
        meta={`ORGANIZED CLUE INDEX ${clues.length}/6`}
        iconSrc="clue"
        onClose={close}
        closeLabel="关闭线索"
      />
      <PixelModalContent className="clue-modal-content">
        <div className="clue-modal-list">
          {clues.length === 0 ? (
            <div className="clue-empty-state">
              暂无整理线索
            </div>
          ) : clues.map(clue => {
            const selected = selectedIds.includes(clue.id);
            return (
              <div
                key={clue.id}
                className="clue-card"
              >
                <PixelModalListItem
                  selected={selected}
                  onClick={() => toggleSelect(clue.id)}
                  className="clue-card-select"
                  aria-label={`${selected ? '取消选择' : '选择'}线索：${clue.title}`}
                  aria-pressed={selected}
                >
                  <span className="clue-select-mark" aria-hidden="true">
                    {selected && <GameIcon name="success" size={14} />}
                  </span>
                  <span className="clue-card-copy">
                    <span className="clue-card-title">{clue.title}</span>
                    <span className="clue-card-source">来源：{clue.source}</span>
                    <span className="clue-card-description">{clue.description}</span>
                  </span>
                </PixelModalListItem>
                <button
                  type="button"
                  data-cursor="pointer"
                  onClick={() => setPendingDeleteId(clue.id)}
                  className="clue-delete-button"
                  aria-label="删除线索"
                >
                  <GameIcon name="trash" size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </PixelModalContent>
      <PixelModalFooter className="clue-modal-footer">
        <div className="clue-selection-count">
          已选择 <strong>{selectedIds.length}</strong> 条
        </div>
        <PixelModalAction
          active={selectedIds.length >= 2}
          data-sfx="deduction-start"
          data-cursor={isWaitingForAI ? undefined : 'pointer'}
          data-ready={selectedIds.length >= 2 ? 'true' : 'false'}
          disabled={isWaitingForAI}
          onClick={handleInfer}
          className="clue-infer-button"
          aria-label={selectedIds.length >= 2 ? `使用已选中的${selectedIds.length}条线索尝试推理` : '尝试推理，至少需要选择两条线索'}
          icon={<GameIcon name="lightning" size={16} />}
        >
          {isWaitingForAI ? '推理中' : '尝试推理'}
        </PixelModalAction>
      </PixelModalFooter>
      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="删除线索"
        message="确定要删除这条整理过的线索吗？此操作会从当前线索界面中移除它。"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) removeClue(pendingDeleteId);
        }}
      />
    </PixelModalShell>
  );

  const fallbackPortalTarget = typeof document === 'undefined' ? null : document.body;
  const portalTarget = cluePortalTarget ?? fallbackPortalTarget;

  return isNarrowClueViewport && portalTarget ? createPortal(dialog, portalTarget) : dialog;
}
