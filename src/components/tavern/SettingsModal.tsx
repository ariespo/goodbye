import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { X } from '@phosphor-icons/react';

export function SettingsModal() {
  const settings = useGameStore(state => state.tavern.settings);
  const showSettings = useGameStore(state => state.ui.showSettings);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);

  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings, showSettings]);

  if (!showSettings) return null;
  if (!localSettings) return null;

  const handleSave = async () => {
    await saveSettings(localSettings);
    actions.setSettings(localSettings);
    toggleModal('settings');
    actions.addNotification({ type: 'success', message: '设置已保存', duration: 3000 });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={() => toggleModal('settings')}
    >
      <div
        className="w-[600px] max-h-[80vh] bg-bg-primary border border-border-subtle overflow-y-auto animate-[scaleIn_0.35s_ease-out]"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-serif-cn text-text-primary">设置</h2>
          <button
            onClick={() => toggleModal('settings')}
            className="text-text-muted hover:text-text-primary hover:rotate-90 transition-all duration-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* API Settings */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-4">API 设置</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">Base URL</label>
                <input
                  type="text"
                  value={localSettings.api.baseUrl}
                  onChange={e => setLocalSettings({ ...localSettings, api: { ...localSettings.api, baseUrl: e.target.value } })}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">API Key</label>
                <input
                  type="password"
                  value={localSettings.api.apiKey}
                  onChange={e => setLocalSettings({ ...localSettings, api: { ...localSettings.api, apiKey: e.target.value } })}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">模型</label>
                <input
                  type="text"
                  value={localSettings.api.model}
                  onChange={e => setLocalSettings({ ...localSettings, api: { ...localSettings.api, model: e.target.value } })}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Character Settings */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-4">角色设置</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">角色名</label>
                <input
                  type="text"
                  value={localSettings.characterName}
                  onChange={e => setLocalSettings({ ...localSettings, characterName: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">玩家名</label>
                <input
                  type="text"
                  value={localSettings.userName}
                  onChange={e => setLocalSettings({ ...localSettings, userName: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Game Settings */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-4">游戏设置</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">打字速度: {localSettings.typingSpeed}ms</label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={localSettings.typingSpeed}
                  onChange={e => setLocalSettings({ ...localSettings, typingSpeed: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-subtle">
          <button
            onClick={() => toggleModal('settings')}
            className="px-4 py-2 border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-muted transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent-blue text-bg-primary hover:bg-accent-blue/80 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
