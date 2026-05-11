import { useGameStore } from '../../stores/gameStore';
import { savePreset, deletePreset, saveSettings } from '../../sillytavern/database';
import { importPreset, exportPreset, exportToJson, importJsonFile } from '../../sillytavern/importer';
import { X, Trash, Download, Upload } from '@phosphor-icons/react';

export function PresetModal() {
  const presets = useGameStore(state => state.tavern.presets);
  const activePresetId = useGameStore(state => state.tavern.settings?.activePresetId);
  const showPreset = useGameStore(state => state.ui.showPreset);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);


  if (!showPreset) return null;

  const handleSelect = async (id: string) => {
    const settings = useGameStore.getState().tavern.settings;
    if (!settings) return;
    const updated = { ...settings, activePresetId: id };
    await saveSettings(updated);
    actions.setSettings(updated);
  };

  const handleImport = async () => {
    const data = await importJsonFile();
    if (!data) return;
    const imported = importPreset(data);
    await savePreset(imported);
    actions.setPresets([...presets, imported]);
    if (!activePresetId) {
      await handleSelect(imported.id);
    }
  };

  const handleExport = (preset: typeof presets[0]) => {
    exportToJson(exportPreset(preset), `${preset.name}.json`);
  };

  const handleDelete = async (id: string) => {
    await deletePreset(id);
    actions.setPresets(presets.filter(p => p.id !== id));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => toggleModal('preset')}>
      <div className="w-[500px] max-h-[80vh] bg-bg-primary border border-border-subtle overflow-y-auto animate-[scaleIn_0.35s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-serif-cn text-text-primary">预设管理</h2>
          <button onClick={() => toggleModal('preset')} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
        </div>

        <div className="p-6">
          <button onClick={handleImport} className="w-full mb-4 py-2 border border-border-subtle text-text-muted hover:border-accent-blue hover:text-accent-blue transition-colors flex items-center justify-center gap-2">
            <Upload size={16} /> 导入 SillyTavern 预设
          </button>

          <div className="space-y-2">
            {presets.map(preset => (
              <div
                key={preset.id}
                className={`flex items-center gap-3 px-4 py-3 border transition-colors cursor-pointer ${preset.id === activePresetId ? 'border-l-[3px] border-l-accent-gold bg-accent-gold/5' : 'border-border-subtle hover:bg-bg-secondary'}`}
                onClick={() => handleSelect(preset.id)}
              >
                <span className="flex-1 text-sm text-text-primary">{preset.name}</span>
                <span className="text-xs text-text-muted">{preset.settings.openai_model}</span>
                <button onClick={e => { e.stopPropagation(); handleExport(preset); }} className="text-text-muted hover:text-accent-blue"><Download size={14} /></button>
                <button onClick={e => { e.stopPropagation(); handleDelete(preset.id); }} className="text-text-muted hover:text-danger"><Trash size={14} /></button>
              </div>
            ))}
          </div>

          {presets.length === 0 && (
            <div className="text-center text-text-muted py-8">暂无预设，请导入一个</div>
          )}
        </div>
      </div>
    </div>
  );
}
