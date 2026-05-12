import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveLorebook, deleteLorebook, saveSettings } from '../../sillytavern/database';
import { importLorebook, exportLorebook, exportToJson, importJsonFile } from '../../sillytavern/importer';
import type { SillyTavernLorebookExport, Lorebook, LorebookEntry } from '../../sillytavern/types';
import { LorebookEntryEditor } from './LorebookEntryEditor';
import { X, Trash, Download, Upload, Plus, Pencil } from '@phosphor-icons/react';

function createEmptyEntry(): LorebookEntry {
  return {
    id: crypto.randomUUID(),
    keys: [],
    secondaryKeys: [],
    content: '',
    comment: '',
    enabled: true,
    order: 100,
    position: 'after_char',
    selective: false,
    selectiveLogic: 'and_any',
    constant: false,
    probability: 100,
    useProbability: false,
    addMemo: false,
  };
}

function createEmptyBook(): Lorebook {
  return {
    id: crypto.randomUUID(),
    name: '新建世界书',
    entries: [],
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function LorebookModal() {
  const lorebooks = useGameStore(state => state.tavern.lorebooks);
  const settings = useGameStore(state => state.tavern.settings);
  const showLorebook = useGameStore(state => state.ui.showLorebook);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);
  const activeLorebookIds = settings?.activeLorebookIds ?? [];

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  if (!showLorebook) return null;

  const selectedBook = lorebooks.find(b => b.id === selectedBookId) || null;

  const persistBook = async (updated: Lorebook) => {
    const next: Lorebook = { ...updated, updatedAt: Date.now() };
    await saveLorebook(next);
    actions.setLorebooks(lorebooks.map(b => (b.id === next.id ? next : b)));
  };

  const handleImport = async () => {
    const data = await importJsonFile<SillyTavernLorebookExport>();
    if (!data) return;
    const imported = importLorebook(data);
    await saveLorebook(imported);
    actions.setLorebooks([...lorebooks, imported]);
    setSelectedBookId(imported.id);
    actions.addNotification({ type: 'success', message: `已导入: ${imported.name}`, duration: 2500 });
  };

  const handleNewBook = async () => {
    const book = createEmptyBook();
    await saveLorebook(book);
    actions.setLorebooks([...lorebooks, book]);
    setSelectedBookId(book.id);
    setRenamingId(book.id);
    setRenameDraft(book.name);
  };

  const handleRename = async (id: string) => {
    const book = lorebooks.find(b => b.id === id);
    if (!book || !renameDraft.trim()) {
      setRenamingId(null);
      return;
    }
    await persistBook({ ...book, name: renameDraft.trim() });
    setRenamingId(null);
  };

  const handleExport = (book: Lorebook) => {
    exportToJson(exportLorebook(book), `${book.name}.json`);
  };

  const handleToggleActive = async (id: string) => {
    if (!settings) return;
    const newIds = activeLorebookIds.includes(id)
      ? activeLorebookIds.filter(i => i !== id)
      : [...activeLorebookIds, id];
    const updated = { ...settings, activeLorebookIds: newIds };
    await saveSettings(updated);
    actions.setSettings(updated);
  };

  const handleDeleteBook = async (id: string) => {
    await deleteLorebook(id);
    actions.setLorebooks(lorebooks.filter(b => b.id !== id));
    if (selectedBookId === id) setSelectedBookId(null);
  };

  const handleAddEntry = async () => {
    if (!selectedBook) return;
    const entry = createEmptyEntry();
    await persistBook({ ...selectedBook, entries: [...selectedBook.entries, entry] });
  };

  const handleEntryChange = async (next: LorebookEntry) => {
    if (!selectedBook) return;
    const entries = selectedBook.entries.map(e => (e.id === next.id ? next : e));
    await persistBook({ ...selectedBook, entries });
  };

  const handleEntryDelete = async (id: string) => {
    if (!selectedBook) return;
    const entries = selectedBook.entries.filter(e => e.id !== id);
    await persistBook({ ...selectedBook, entries });
  };

  const handleBookConfigChange = async (patch: Partial<Lorebook>) => {
    if (!selectedBook) return;
    await persistBook({ ...selectedBook, ...patch });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => toggleModal('lorebook')}>
      <div className="w-[1000px] h-[700px] bg-bg-primary border border-border-subtle flex animate-[scaleIn_0.35s_ease-out]" onClick={e => e.stopPropagation()}>

        {/* 左栏:世界书列表 */}
        <div className="w-[260px] border-r border-border-subtle flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-serif-cn text-text-primary">世界书</h2>
            <button onClick={() => toggleModal('lorebook')} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {lorebooks.length === 0 && (
              <div className="text-center text-text-muted text-xs py-8">暂无世界书</div>
            )}
            {lorebooks.map(book => (
              <div
                key={book.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
                  selectedBookId === book.id ? 'bg-accent-blue/10 border-l-[3px] border-l-accent-blue' : 'hover:bg-bg-secondary'
                }`}
                onClick={() => setSelectedBookId(book.id)}
              >
                <input
                  type="checkbox"
                  checked={activeLorebookIds.includes(book.id)}
                  onChange={() => handleToggleActive(book.id)}
                  className="accent-accent-blue"
                  onClick={e => e.stopPropagation()}
                />
                {renamingId === book.id ? (
                  <input
                    type="text"
                    value={renameDraft}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={() => handleRename(book.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(book.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="flex-1 bg-bg-primary border border-border-subtle text-text-primary text-sm px-1 py-0.5 focus:outline-none focus:border-accent-blue"
                  />
                ) : (
                  <span
                    className="text-sm text-text-primary flex-1 truncate"
                    onDoubleClick={e => {
                      e.stopPropagation();
                      setRenamingId(book.id);
                      setRenameDraft(book.name);
                    }}
                    title="双击重命名"
                  >
                    {book.name}
                  </span>
                )}
                <span className="text-xs text-text-muted">{book.entries.length}</span>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border-subtle flex gap-2">
            <button onClick={handleNewBook} className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors">
              <Plus size={14} /> 新建
            </button>
            <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors">
              <Upload size={14} /> 导入
            </button>
          </div>
        </div>

        {/* 右栏:条目编辑区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedBook ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                <h3 className="text-sm text-text-primary flex-1 truncate">{selectedBook.name}</h3>
                <button
                  onClick={() => { setRenamingId(selectedBook.id); setRenameDraft(selectedBook.name); }}
                  title="重命名"
                  className="text-text-muted hover:text-accent-blue transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleExport(selectedBook)} title="导出 JSON" className="text-text-muted hover:text-accent-blue transition-colors"><Download size={14} /></button>
                <button onClick={() => handleDeleteBook(selectedBook.id)} title="删除整本" className="text-text-muted hover:text-danger transition-colors"><Trash size={14} /></button>
              </div>

              {/* 世界书级配置 */}
              <div className="flex items-center gap-4 px-4 py-2 border-b border-border-subtle bg-bg-secondary/30 text-xs">
                <label className="flex items-center gap-2 text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBook.recursiveScanning}
                    onChange={e => handleBookConfigChange({ recursiveScanning: e.target.checked })}
                    className="accent-accent-blue"
                  />
                  递归扫描
                </label>
                <label className="flex items-center gap-2 text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBook.caseSensitive}
                    onChange={e => handleBookConfigChange({ caseSensitive: e.target.checked })}
                    className="accent-accent-blue"
                  />
                  区分大小写
                </label>
                <label className="flex items-center gap-2 text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBook.matchWholeWords}
                    onChange={e => handleBookConfigChange({ matchWholeWords: e.target.checked })}
                    className="accent-accent-blue"
                  />
                  整词匹配
                </label>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedBook.entries.map(entry => (
                  <LorebookEntryEditor
                    key={entry.id}
                    entry={entry}
                    onChange={handleEntryChange}
                    onDelete={() => handleEntryDelete(entry.id)}
                  />
                ))}
                {selectedBook.entries.length === 0 && (
                  <div className="text-center text-text-muted text-xs py-8">暂无条目</div>
                )}
              </div>

              <div className="p-3 border-t border-border-subtle">
                <button
                  onClick={handleAddEntry}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors"
                >
                  <Plus size={14} /> 新建条目
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              选择一个世界书,或点击左下角 + 新建
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
