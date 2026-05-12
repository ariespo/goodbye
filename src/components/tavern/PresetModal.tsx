import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { savePreset, deletePreset, saveSettings } from '../../sillytavern/database';
import { importPreset, exportPreset, exportToJson, importJsonFile } from '../../sillytavern/importer';
import { createDefaultPreset } from '../../sillytavern/types';
import type { ChatPreset } from '../../sillytavern/types';
import { PresetEditor } from './PresetEditor';
import { X, Trash, Download, Upload, Plus, CheckCircle } from '@phosphor-icons/react';

export function PresetModal() {
  const presets = useGameStore(state => state.tavern.presets);
  const activePresetId = useGameStore(state => state.tavern.settings?.activePresetId);
  const showPreset = useGameStore(state => state.ui.showPreset);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);

  const [selectedId, setSelectedId] = useState<string | null>(activePresetId ?? presets[0]?.id ?? null);

  if (!showPreset) return null;

  const selected = presets.find(p => p.id === selectedId) ?? null;

  const persist = async (next: ChatPreset) => {
    await savePreset(next);
    actions.setPresets(presets.map(p => p.id === next.id ? next : p));
  };

  const handleSelect = async (id: string) => {
    const settings = useGameStore.getState().tavern.settings;
    if (!settings) return;
    const updated = { ...settings, activePresetId: id };
    await saveSettings(updated);
    actions.setSettings(updated);
  };

  const handleImport = async () => {
    const data = await importJsonFile<Record<string, any>>();
    if (!data) return;
    const imported = importPreset(data);
    await savePreset(imported);
    actions.setPresets([...presets, imported]);
    setSelectedId(imported.id);
    if (!activePresetId) await handleSelect(imported.id);
  };

  const handleNew = async () => {
    const preset: ChatPreset = {
      ...createDefaultPreset(),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await savePreset(preset);
    actions.setPresets([...presets, preset]);
    setSelectedId(preset.id);
  };

  const handleExport = (p: ChatPreset) => {
    exportToJson(exportPreset(p), `${p.name}.json`);
  };

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    actions.setPresets(presets.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => toggleModal('preset')}>
      <div className="w-[1000px] h-[700px] bg-bg-primary border border-border-subtle flex animate-[scaleIn_0.35s_ease-out]" onClick={e => e.stopPropagation()}>

        {/* 左栏:预设列表 */}
        <div className="w-[260px] border-r border-border-subtle flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-serif-cn text-text-primary">预设</h2>
            <button onClick={() => toggleModal('preset')} className="text-text-muted hover:text-text-primary"><X size={16} /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {presets.length === 0 && (
              <div className="text-center text-text-muted text-xs py-8">暂无预设</div>
            )}
            {presets.map(preset => (
              <div
                key={preset.id}
                className={`flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors ${
                  selectedId === preset.id ? 'bg-accent-blue/10 border-l-[3px] border-l-accent-blue' : 'hover:bg-bg-secondary'
                }`}
                onClick={() => setSelectedId(preset.id)}
              >
                <span className="text-sm text-text-primary flex-1 truncate">{preset.name}</span>
                {preset.id === activePresetId && (
                  <CheckCircle size={14} weight="fill" className="text-accent-gold" />
                )}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border-subtle flex gap-2">
            <button onClick={handleNew} className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors">
              <Plus size={14} /> 新建
            </button>
            <button onClick={handleImport} className="flex-1 flex items-center justify-center gap-1 py-2 border border-border-subtle text-xs text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors">
              <Upload size={14} /> 导入
            </button>
          </div>
        </div>

        {/* 右栏:编辑器 */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
                <h3 className="text-sm text-text-primary flex-1 truncate">{selected.name}</h3>

                {selected.id !== activePresetId ? (
                  <button
                    onClick={() => handleSelect(selected.id)}
                    className="px-3 py-1 text-xs border border-accent-gold text-accent-gold hover:bg-accent-gold/10 transition-colors"
                  >
                    设为当前
                  </button>
                ) : (
                  <span className="text-xs text-accent-gold">已激活</span>
                )}

                <button onClick={() => handleExport(selected)} title="导出" className="text-text-muted hover:text-accent-blue transition-colors"><Download size={14} /></button>
                <button onClick={() => handleDelete(selected.id)} title="删除" className="text-text-muted hover:text-danger transition-colors"><Trash size={14} /></button>
              </div>

              <PresetEditor preset={selected} onChange={persist} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              选择一个预设,或点击左下角 + 新建
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
