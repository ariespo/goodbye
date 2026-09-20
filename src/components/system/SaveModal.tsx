import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { getSaves, saveSlot, deleteSave } from '../../sillytavern/database';
import { GameIcon } from '../ui/GameIcon';
import type { SaveSlot } from '../../sillytavern/types';
import { buildSaveSlotPayload, loadGameFromSave } from '../../utils/gameSession';
import type { SaveModalMode } from './saveModalEvents';
import { PixelModalContent, PixelModalHeader, PixelModalShell } from '../ui/PixelModal';
import { downloadSaveArchive, importSaveArchive, readSaveArchiveFile } from '../../utils/save-transfer';
import './save-transfer.css';

export function SaveModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [mode, setMode] = useState<SaveModalMode>('manage');
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const actions = useGameStore(state => state.actions);

  const loadSaves = useCallback(async () => setSaves(await getSaves()), []);

  const handleOpen = useCallback(async (nextMode: SaveModalMode = 'manage') => {
    if (busyRef.current) return;
    setMode(nextMode);
    setIsOpen(true);
    try { await loadSaves(); } catch (error) {
      actions.addNotification({ type: 'error', message: error instanceof Error ? error.message : '无法读取存档列表', duration: 3500 });
    }
  }, [actions, loadSaves]);

  useEffect(() => {
    const openFromExternal = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: SaveModalMode }>).detail;
      void handleOpen(detail?.mode === 'manage' ? 'manage' : 'load');
    };
    window.addEventListener('farewell:open-save-modal', openFromExternal);
    return () => window.removeEventListener('farewell:open-save-modal', openFromExternal);
  }, [handleOpen]);

  const perform = async (operation: () => Promise<void> | void, fallback: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      actions.addNotification({ type: 'error', message: error instanceof Error ? error.message : fallback, duration: 3500 });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleSave = () => perform(async () => {
      const name = saveName.trim() || `存档 ${new Date().toLocaleString('zh-CN')}`;
      const canvas = document.querySelector('canvas');
      const thumbnail = canvas ? (canvas as HTMLCanvasElement).toDataURL('image/jpeg', 0.5) : '';
      await saveSlot(buildSaveSlotPayload(name, thumbnail));
      await loadSaves();
      setSaveName('');
      actions.addNotification({ type: 'success', message: '存档已保存（含完整状态）', duration: 3000 });
  }, '存档失败');

  const handleDelete = (id: string) => perform(async () => {
    await deleteSave(id);
    await loadSaves();
  }, '删除存档失败');

  const handleLoad = (save: SaveSlot) => perform(async () => {
      await loadGameFromSave(save);
      setIsOpen(false);
  }, '读档失败');

  const handleImport = (file: File) => perform(async () => {
    await importSaveArchive(await readSaveArchiveFile(file));
    await loadSaves();
    actions.addNotification({ type: 'success', message: '已导入为新存档，选择「读取」即可继续', duration: 3500 });
  }, '导入存档失败');

  const handleExport = (save: SaveSlot) => perform(() => {
    downloadSaveArchive(save);
    actions.addNotification({ type: 'success', message: '存档文件已准备下载', duration: 2500 });
  }, '导出存档失败');

  return (
    <PixelModalShell
      open={isOpen}
      onClose={() => !busyRef.current && setIsOpen(false)}
      closeBlocked={busy}
      labelledBy="save-modal-title"
      className="save-modal-shell"
    >
      <div className="save-modal">
        <PixelModalHeader
          titleId="save-modal-title"
          title={mode === 'load' ? '读取存档' : '存档管理'}
          meta={mode === 'load' ? 'SELECT MEMORY SLOT' : 'MEMORY SLOT ARCHIVE'}
          iconSrc="clue"
          onClose={() => setIsOpen(false)}
          closeLabel="关闭存档"
        />

        <PixelModalContent className="save-modal-content">
          {mode === 'manage' && (
          <div className="save-modal-form">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="存档名称（可选）"
              aria-label="存档名称"
              disabled={busy}
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

          <div className="save-transfer-toolbar">
            <button type="button" className="settings-btn save-transfer-import" disabled={busy}
              onClick={() => fileInput.current?.click()} data-cursor="pointer">导入存档</button>
            <input ref={fileInput} type="file" accept=".json,application/json" aria-label="导入存档文件"
              hidden tabIndex={-1} disabled={busy} onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void handleImport(file);
              }} />
            <p className="settings-help">导入会新增一份存档；点击「读取」后才会切换进度。文件上限 32 MB。</p>
          </div>

        {mode === 'load' && (
          <p className="settings-help mb-4">选择一份记忆残片以继续轮回。将恢复变量、体力/理智、对话、回合历史与结局进度。</p>
        )}

        <div className="save-modal-body pixel-scroll-blue">
          {saves.length === 0 ? (
            <div className="save-empty">暂无存档</div>
          ) : (
            saves.map(save => (
              <div key={save.id} className="save-slot group">
                {save.thumbnail ? (
                  <img src={save.thumbnail} alt="" className="save-slot-thumb" />
                ) : (
                  <div className="save-slot-thumb save-slot-thumb-empty">
                    <GameIcon name="clock" size={17} />
                  </div>
                )}
                <div className="save-slot-description min-w-0 flex-1">
                  <div className="save-slot-name truncate">{save.name}</div>
                  <div className="save-slot-time">{new Date(save.createdAt).toLocaleString('zh-CN')}</div>
                </div>
                <div className="save-slot-actions">
                    <button
                      type="button"
                      onClick={() => void handleLoad(save)}
                      data-cursor="pointer"
                      className="save-action-btn"
                      aria-label={`读取 ${save.name}`}
                      disabled={busy}
                    >
                      <GameIcon name="back" size={14} /> 读取
                    </button>
                    <button type="button" onClick={() => void handleExport(save)} data-cursor="pointer"
                      className="save-action-btn" disabled={busy} aria-label={`导出 ${save.name}`}>导出</button>
                    {mode === 'manage' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(save.id)}
                      data-cursor="pointer"
                      className="save-action-btn is-danger"
                      aria-label={`删除 ${save.name}`}
                      disabled={busy}
                    >
                      <GameIcon name="trash" size={15} />
                    </button>
                    )}
                </div>
              </div>
            ))
          )}
        </div>
        </PixelModalContent>
      </div>
    </PixelModalShell>
  );
}
