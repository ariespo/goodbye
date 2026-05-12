import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { Key, ArrowRight } from '@phosphor-icons/react';

const PRESET_PROVIDERS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Anthropic 兼容', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
];

export function ApiKeySetup() {
  const settings = useGameStore(state => state.tavern.settings);
  const introPlayed = useGameStore(state => state.ui.introPlayed);
  const actions = useGameStore(state => state.actions);

  const [baseUrl, setBaseUrl] = useState(settings?.api.baseUrl || PRESET_PROVIDERS[0].baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(settings?.api.model || PRESET_PROVIDERS[0].model);
  const [dismissed, setDismissed] = useState(false);

  if (!introPlayed || !settings || dismissed) return null;
  if (settings.api.apiKey) return null;

  const handlePreset = (preset: typeof PRESET_PROVIDERS[0]) => {
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      actions.addNotification({ type: 'warning', message: '请先填入 API Key', duration: 2500 });
      return;
    }
    const next = {
      ...settings,
      api: { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() || 'gpt-4o-mini' },
    };
    await saveSettings(next);
    actions.setSettings(next);
    setDismissed(true);
    actions.addNotification({ type: 'success', message: 'API 已配置，开始游戏吧', duration: 2500 });
  };

  const handleLater = () => {
    setDismissed(true);
    actions.addNotification({ type: 'info', message: '可随时在设置中配置 API Key', duration: 3000 });
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="w-full max-w-[560px] bg-bg-primary border border-border-subtle animate-[scaleIn_0.35s_ease-out]"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 20px 60px rgba(0,0,0,0.7)' }}
      >
        <div className="px-7 pt-7 pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3 mb-2">
            <Key size={22} className="text-accent-gold" />
            <h2 className="text-xl font-serif-cn text-text-primary tracking-wider">配置 AI 接口</h2>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            你的 API Key 仅保存在本机浏览器中（IndexedDB），不会上传到任何服务器。
          </p>
        </div>

        <div className="px-7 py-5 space-y-5">
          <div>
            <label className="text-xs text-text-muted uppercase tracking-widest block mb-2">快速选择</label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_PROVIDERS.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={`px-3 py-2 text-xs border transition-all text-left ${
                    baseUrl === preset.baseUrl
                      ? 'border-accent-blue text-text-primary bg-accent-blue/10'
                      : 'border-border-subtle text-text-muted hover:border-text-muted hover:text-text-primary'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">
              API Key <span className="text-accent-gold">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoFocus
              className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter' && apiKey.trim()) handleSave();
              }}
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">模型</label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm font-mono focus:border-accent-blue focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-7 py-4 border-t border-border-subtle">
          <button
            onClick={handleLater}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            稍后配置
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 bg-accent-blue text-bg-primary hover:bg-accent-blue/80 transition-colors text-sm font-serif-cn tracking-wide"
          >
            开始
            <ArrowRight size={14} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
