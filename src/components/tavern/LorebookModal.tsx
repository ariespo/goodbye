import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveLorebook, deleteLorebook, saveSettings } from '../../sillytavern/database';
import { importLorebook, exportLorebook, exportToJson, importJsonFile } from '../../sillytavern/importer';
import { X, Trash, Download, Upload } from '@phosphor-icons/react';

export function LorebookModal() {
  const lorebooks = useGameStore(state => state.tavern.lorebooks);
  const settings = useGameStore(state => state.tavern.settings);
  const showLorebook = useGameStore(state => state.ui.showLorebook);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);
  const activeLorebookIds = settings?.activeLorebookIds ?? [];
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  if (!showLorebook) return null;

  const selectedBook = lorebooks.find(b => b.id === selectedBookId);

  const handleImport = async () => {
    const data = await importJsonFile();
    if (!data) return;
    const imported = importLorebook(data);
    await saveLorebook(imported);
    actions.setLorebooks([...lorebooks, imported]);
    actions.addNotification({ type: 'success', message: `已导入世界书: ${imported.name}`, duration: 3000 });
  };

  const handleExport = (book: typeof lorebooks[0]) => {
    exportToJson(exportLorebook(book), `${book.name}.json`);
  };

  const handleToggleActive = async (id: string) => {
    const settings = useGameStore.getState().tavern.settings;
    if (!settings) return;
    const newIds = activeLorebookIds.includes(id)
      ? activeLorebookIds.filter(i => i !== id)
      : [...activeLorebookIds, id];
    const updated = { ...settings, activeLorebookIds: newIds };
    await saveSettings(updated);
    actions.setSettings(updated);
  };

  const handleDelete = async (id: string) => {
    await deleteLorebook(id);
    actions.setLorebooks(lorebooks.filter(b => b.id !== id));
    if (selectedBookId === id) setSelectedBookId(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => toggleModal('lorebook')}>
      <div className="w-[800px] h-[600px] bg-bg-primary border border-border-subtle flex animate-[scaleIn_0.35s_ease-out]" onClick={e => e.stopPropagation()}>
        {/* Book List */}
        <div className="w-[250px] border-r border-border-subtle flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-serif-cn text-text-primary">世界书</h2>
            <button onClick={() => toggleModal('lorebook')} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {lorebooks.map(book => (
              <div
                key={book.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${selectedBookId === book.id ? 'bg-accent-blue/10 border-l-[3px] border-l-accent-blue' : 'hover:bg-bg-secondary'}`}
                onClick={() => setSelectedBookId(book.id)}
              >
                <input
                  type="checkbox"
                  checked={activeLorebookIds.includes(book.id)}
                  onChange={() => handleToggleActive(book.id)}
                  className="accent-accent-blue"
                  onClick={e => e.stopPropagation()}
                />
                <span className="text-sm text-text-primary flex-1 truncate">{book.name}</span>
                <span className="text-xs text-text-muted">{book.entries.length}</span>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border-subtle flex gap-2">
            <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors">
              <Upload size={14} /> 导入
            </button>
          </div>
        </div>

        {/* Entry Editor */}
        <div className="flex-1 flex flex-col">
          {selectedBook ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                <h3 className="text-sm text-text-primary">{selectedBook.name}</h3>
                <div className="flex gap-2">
                  <button onClick={() => handleExport(selectedBook)} className="text-text-muted hover:text-accent-blue transition-colors"><Download size={16} /></button>
                  <button onClick={() => handleDelete(selectedBook.id)} className="text-text-muted hover:text-danger transition-colors"><Trash size={16} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {selectedBook.entries.map((entry, idx) => (
                  <div key={entry.uid} className="mb-4 p-3 border border-border-subtle bg-bg-secondary">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-text-muted">#{idx + 1}</span>
                      <span className="text-xs text-accent-blue">{entry.comment || '无注释'}</span>
                    </div>
                    <div className="text-xs text-text-muted mb-1">关键词: {entry.key.join(', ')}</div>
                    <div className="text-sm text-text-primary whitespace-pre-wrap">{entry.content}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted">选择一个世界书</div>
          )}
        </div>
      </div>
    </div>
  );
}
