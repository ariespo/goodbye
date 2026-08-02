import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { getSaves, saveSlot, deleteSave } from '../../sillytavern/database';
import { GameIcon } from '../ui/GameIcon';
import type { SaveSlot } from '../../sillytavern/types';
import { buildSaveSlotPayload, loadGameFromSave } from '../../utils/gameSession';
import type { SaveModalMode } from './saveModalEvents';

export function SaveModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [mode, setMode] = useState<SaveModalMode>('manage');
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);
  const showTitle = useGameStore(state => state.ui.showTitle);
  const actions = useGameStore(state => state.actions);

  const loadSaves = async () => setSaves(await getSaves());

  const handleOpen = async (nextMode: SaveModalMode = 'manage') => {
    setMode(nextMode);
    setIsOpen(true);
    await loadSaves();
  };

  useEffect(() => {
    const openFromExternal = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: SaveModalMode }>).detail;
      void handleOpen(detail?.mode === 'manage' ? 'manage' : 'load');
    };
    window.addEventListener('farewell:open-save-modal', openFromExternal);
    return () => window.removeEventListener('farewell:open-save-modal', openFromExternal);
  }, []);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const name = saveName.trim() || `存档 ${new Date().toLocaleString('zh-CN')}`;
      const canvas = document.querySelector('canvas');
      const thumbnail = canvas ? (canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.5) : '';
      await saveSlot(buildSaveSlotPayload(name, thumbnail));
      await loadSaves();
      setSaveName('');
      actions.addNotification({ type: 'success', message: '存档已保存（含完整状态）', duration: 3000 });
    } catch (e) {
      actions.addNotification({
        type: 'error',
        message: e instanceof Error ? e.message : '存档失败',
        duration: 3500,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSave(id);
    await loadSaves();
  };

  const handleLoad = async (save: SaveSlot) => {
    if (busy) return;
    setBusy(true);
    try {
      await loadGameFromSave(save);
      setIsOpen(false);
    } catch (e) {
      actions.addNotification({
        type: 'error',
        message: e instanceof Error ? e.message : '读档失败',
        duration: 3500,
      });
    } finally {
      setBusy(false);
    }
  };

  // 标题页不显示局内悬浮存档按钮；仅局内显示
  if (!isOpen) {
    if (showTitle) return null;
    return (
      <button
        type="button"
        onClick={() => handleOpen('manage')}
        data-cursor="pointer"
        aria-label="存档"
        className="save-trigger absolute left-5 top-5 z-20 flex h-10 w-10 items-center justify-center"
      >
        <GameIcon name="save" size={19} />
      </button>
    );
  }

  return (
    <div
      className="save-modal-shell fixed inset-0 z-[250] flex items-center justify-center px-4"
      onClick={() => !busy && setIsOpen(false)}
    >
      <div
        className="save-modal relative animate-[scaleIn_0.35s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="save-modal-header mb-5 flex items-center justify-between pb-3">
          <div>
            <h2 className="save-modal-title">{mode === 'load' ? '读取存档' : '存档管理'}</h2>
            <div className="save-modal-subtitle">{mode === 'load' ? 'SELECT MEMORY SLOT' : 'MEMORY SLOT ARCHIVE'}</div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            data-cursor="pointer"
            className="pixel-close-button flex h-9 w-9 items-center justify-center"
            disabled={busy}
          >
            <GameIcon name="close" size={15} />
          </button>
        </div>

        {mode === 'manage' && (
          <div className="save-modal-form mb-5 flex gap-3">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="存档名称（可选）"
              className="settings-input h-[46px] flex-1"
            />
            <button
              type="button"
              onClick={handleSave}
              data-cursor="pointer"
              disabled={busy}
              className="settings-btn settings-btn-primary h-[46px]"
            >
              <GameIcon name="save" size={15} /> 保存
            </button>
          </div>
        )}

        {mode === 'load' && (
          <p className="settings-help mb-4">选择一份记忆残片以继续轮回。将恢复变量、体力/理智、对话、回合历史与结局进度。</p>
        )}

        <div className="save-modal-body pixel-scroll-blue space-y-2 overflow-y-auto pr-2">
          {saves.length === 0 ? (
            <div className="save-empty">暂无存档</div>
          ) : (
            saves.map(save => (
              <div
                key={save.id}
                className="save-slot group"
                role={mode === 'load' ? 'button' : undefined}
                tabIndex={mode === 'load' ? 0 : undefined}
                data-cursor={mode === 'load' ? 'pointer' : undefined}
                onClick={mode === 'load' ? () => void handleLoad(save) : undefined}
                onKeyDown={mode === 'load' ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleLoad(save);
                  }
                } : undefined}
              >
                {save.thumbnail ? (
                  <img src={save.thumbnail} alt="" className="save-slot-thumb" />
                ) : (
                  <div className="save-slot-thumb save-slot-thumb-empty">
                    <GameIcon name="clock" size={17} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="save-slot-name truncate">{save.name}</div>
                  <div className="save-slot-time">{new Date(save.createdAt).toLocaleString('zh-CN')}</div>
                </div>
                {mode === 'manage' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleLoad(save)}
                      data-cursor="pointer"
                      className="save-action-btn"
                      disabled={busy}
                    >
                      <GameIcon name="back" size={14} /> 读取
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(save.id)}
                      data-cursor="pointer"
                      className="save-action-btn is-danger"
                      aria-label="删除存档"
                      disabled={busy}
                    >
                      <GameIcon name="trash" size={15} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleLoad(save); }}
                    data-cursor="pointer"
                    className="save-action-btn"
                    disabled={busy}
                  >
                    <GameIcon name="back" size={14} /> 读取
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
