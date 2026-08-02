import { useMemo, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { GameIcon } from '../ui/GameIcon';
import type { OrganizedClue } from '../../sillytavern/types';
import { saveChat } from '../../sillytavern/database';
import { ConfirmModal } from '../system/ConfirmModal';

const TEXT_MAIN = '#e8e4dc';
const TEXT_DIM = '#aaa59e';
const BLUE = '#86a8f2';

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

  const clues = useMemo<OrganizedClue[]>(
    () => Array.isArray(variables.organizedClues) ? variables.organizedClues : [],
    [variables.organizedClues]
  );

  if (!showClues) return null;

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

  return (
    <div
      className="clue-modal-shell fixed inset-0 z-[245] flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 45%, rgba(24,30,40,0.42), rgba(0,0,0,0.88) 62%)' }}
      onClick={close}
    >
      <div
        className="clue-modal clean-modal-frame clean-modal-frame-blue relative w-[720px] max-w-[94vw] select-none px-8 py-7"
        onClick={event => event.stopPropagation()}
        style={{
          minHeight: 460,
          maxHeight: '86vh',
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 24px 54px rgba(0,0,0,0.66))',
        }}
      >
        <div className="mb-5 flex items-center justify-between border-b-2 border-[#25252d] pb-3">
          <div>
            <h2 className="font-serif-cn text-[22px] tracking-[0.18em]" style={{ color: TEXT_MAIN }}>线索</h2>
            <div className="font-mono text-[11px] tracking-[0.2em]" style={{ color: TEXT_DIM }}>
              ORGANIZED CLUE INDEX {clues.length}/6
            </div>
          </div>
          <button onClick={close} data-cursor="pointer" className="pixel-close-button flex h-9 w-9 items-center justify-center" style={{ cursor: 'pointer' }}>
            <GameIcon name="close" size={15} />
          </button>
        </div>

        <div className="pixel-scroll-blue max-h-[52vh] space-y-3 overflow-y-auto pr-3">
          {clues.length === 0 ? (
            <div className="py-20 text-center text-sm tracking-[0.12em]" style={{ color: TEXT_DIM }}>
              暂无整理线索
            </div>
          ) : clues.map(clue => {
            const selected = selectedIds.includes(clue.id);
            return (
              <div
                key={clue.id}
                className={`clue-card relative px-4 py-3 ${selected ? 'is-selected' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    data-cursor="pointer"
                    onClick={() => toggleSelect(clue.id)}
                    className="clue-select-button mt-1 flex h-8 w-8 shrink-0 items-center justify-center"
                    aria-label={`${selected ? '取消选择' : '选择'}线索：${clue.title}`}
                    aria-pressed={selected}
                  >
                    {selected && <GameIcon name="success" size={14} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 font-serif-cn text-[18px]" style={{ color: selected ? BLUE : TEXT_MAIN }}>{clue.title}</div>
                    <div className="mb-2 text-[13px]" style={{ color: TEXT_DIM }}>来源：{clue.source}</div>
                    <div className="whitespace-pre-wrap text-[15px] leading-7" style={{ color: TEXT_MAIN }}>{clue.description}</div>
                  </div>
                  <button
                    data-cursor="pointer"
                    onClick={() => setPendingDeleteId(clue.id)}
                    className="clue-delete-button flex h-8 w-8 shrink-0 items-center justify-center"
                    aria-label="删除线索"
                  >
                    <GameIcon name="trash" size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="clue-modal-footer mt-5 flex items-center justify-between gap-4 border-t-2 border-[#25252d] pt-4">
          <div className="clue-selection-count text-[13px]" style={{ color: TEXT_DIM }}>
            已选择 <strong>{selectedIds.length}</strong> 条
          </div>
          <button
            data-sfx="deduction-start"
            data-cursor={isWaitingForAI ? undefined : 'pointer'}
            data-ready={selectedIds.length >= 2 ? 'true' : 'false'}
            disabled={isWaitingForAI}
            onClick={handleInfer}
            className="clue-infer-button flex h-[46px] min-w-[150px] items-center justify-center gap-2 px-5 text-sm"
            aria-label={selectedIds.length >= 2 ? `使用已选中的${selectedIds.length}条线索尝试推理` : '尝试推理，至少需要选择两条线索'}
          >
            <span className="clue-infer-icon"><GameIcon name="lightning" size={16} /></span>
            {isWaitingForAI ? '推理中' : '尝试推理'}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="删除线索"
        message="确定要删除这条整理过的线索吗？此操作会从当前线索界面中移除它。"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) removeClue(pendingDeleteId);
        }}
      />
    </div>
  );
}
