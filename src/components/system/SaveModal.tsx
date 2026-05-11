import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { getSaves, saveSlot, deleteSave } from '../../sillytavern/database';
import { X, FloppyDisk, Trash, Clock } from '@phosphor-icons/react';

export function SaveModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [saves, setSaves] = useState<Array<{ id: string; name: string; createdAt: number; thumbnail?: string }>>([]);
  const [saveName, setSaveName] = useState('');
  const gameState = useGameStore(state => state.game);
  const tavernState = useGameStore(state => state.tavern);
  const actions = useGameStore(state => state.actions);

  const loadSaves = async () => {
    const data = await getSaves();
    setSaves(data);
  };

  const handleOpen = async () => {
    setIsOpen(true);
    await loadSaves();
  };

  const handleSave = async () => {
    const name = saveName.trim() || `存档 ${new Date().toLocaleString('zh-CN')}`;
    const canvas = document.querySelector('canvas');
    let thumbnail = '';
    if (canvas) {
      thumbnail = canvas.toDataURL('image/jpeg', 0.5);
    }

    await saveSlot({
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      thumbnail,
      gameState: {
        currentSceneIndex: 0,
        currentLineIndex: gameState.currentLineIndex,
        gameStatus: gameState.gameStatus,
        currentState: gameState.currentState,
      },
      tavernState: {
        variables: tavernState.variables,
        messages: tavernState.chats.find(c => c.id === tavernState.activeChatId)?.messages || [],
      },
      historyIndex: gameState.history.length,
    });

    await loadSaves();
    setSaveName('');
    actions.addNotification({ type: 'success', message: '存档已保存', duration: 3000 });
  };

  const handleDelete = async (id: string) => {
    await deleteSave(id);
    await loadSaves();
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="absolute top-5 left-5 z-20 w-10 h-10 flex items-center justify-center border border-border-subtle text-text-muted hover:border-accent-blue hover:text-accent-blue hover:bg-accent-blue/10 transition-all duration-200"
      >
        <FloppyDisk size={20} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-[500px] max-h-[70vh] bg-bg-primary border border-border-subtle overflow-hidden animate-[scaleIn_0.35s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-serif-cn text-text-primary">存档管理</h2>
          <button onClick={() => setIsOpen(false)} className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* 新建存档 */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="存档名称（可选）"
              className="flex-1 px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors"
            />
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-accent-blue text-bg-primary hover:bg-accent-blue/80 transition-colors flex items-center gap-2"
            >
              <FloppyDisk size={16} />
              保存
            </button>
          </div>

          {/* 存档列表 */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {saves.length === 0 ? (
              <div className="text-center text-text-muted py-8">暂无存档</div>
            ) : (
              saves.map(save => (
                <div
                  key={save.id}
                  className="flex items-center gap-3 px-4 py-3 border border-border-subtle hover:bg-bg-secondary transition-colors"
                >
                  {save.thumbnail ? (
                    <img src={save.thumbnail} alt="" className="w-16 h-10 object-cover bg-bg-secondary" />
                  ) : (
                    <div className="w-16 h-10 bg-bg-secondary flex items-center justify-center">
                      <Clock size={16} className="text-text-muted" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{save.name}</div>
                    <div className="text-xs text-text-muted">
                      {new Date(save.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(save.id)}
                    className="text-text-muted hover:text-danger transition-colors"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
