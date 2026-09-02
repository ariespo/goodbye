import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { fetchModels } from '../../sillytavern/api-router';
import { GameIcon } from '../ui/GameIcon';
import { PixelModalContent, PixelModalFooter, PixelModalShell } from '../ui/PixelModal';

const PRESET_PROVIDERS = [
  { name: 'OpenAI', short: 'OA', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek Flash', short: 'DS', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash' },
  { name: '智谱 GLM', short: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Anthropic 兼容', short: 'ANT', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
];

export function ApiKeySetup() {
  const settings = useGameStore(state => state.tavern.settings);
  const introPlayed = useGameStore(state => state.ui.introPlayed);
  const actions = useGameStore(state => state.actions);

  const [baseUrl, setBaseUrl] = useState(settings?.api?.baseUrl || PRESET_PROVIDERS[0].baseUrl);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(settings?.api?.model || PRESET_PROVIDERS[0].model);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!settings || settings.api.apiKey) return;
    setBaseUrl(settings.api.baseUrl || PRESET_PROVIDERS[0].baseUrl);
    setModel(settings.api.model || PRESET_PROVIDERS[0].model);
  }, [settings]);

  if (!introPlayed || !settings || dismissed) return null;
  if (settings.api?.apiKey) return null;

  const handlePreset = (preset: typeof PRESET_PROVIDERS[0]) => {
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setModels([]);
  };

  const handleFetchModels = async () => {
    const normalizedBaseUrl = baseUrl.trim();
    const normalizedApiKey = apiKey.trim();
    if (!normalizedBaseUrl || !normalizedApiKey) {
      actions.addNotification({ type: 'warning', message: '请先填写 Base URL 和 API Key', duration: 3000 });
      return;
    }
    setFetchingModels(true);
    try {
      const fetched = await fetchModels({ baseUrl: normalizedBaseUrl, apiKey: normalizedApiKey, model: '' });
      const ids = [...new Set(fetched.map(item => item.id).filter(Boolean))];
      setModels(ids);
      if (ids.length > 0 && !ids.includes(model)) setModel(ids[0]);
      actions.addNotification({ type: 'success', message: `读取到 ${ids.length} 个模型，请从列表中选择`, duration: 3000 });
    } catch (error) {
      actions.addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : '读取模型列表失败',
        duration: 4500,
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      actions.addNotification({ type: 'warning', message: '请完整填写 Base URL、API Key 和模型', duration: 2500 });
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
    <PixelModalShell
      open
      onClose={() => undefined}
      closeBlocked
      labelledBy="api-setup-title"
      className="api-setup-shell"
    >
      <div className="api-setup-modal">
        <header className="api-setup-header">
          <div className="api-setup-heading">
            <div className="api-setup-icon">
              <GameIcon name="key" size={22} />
            </div>
            <div>
              <h2 id="api-setup-title">配置 AI 接口</h2>
              <div>LOCAL CONNECTION SETUP</div>
            </div>
          </div>
          <p>
            API Key 仅保存在本机浏览器 IndexedDB 中，不会上传到本项目服务器；发送请求时会直接交给你配置的 AI 服务商。你也可以稍后在设置里完成配置。
          </p>
        </header>

        <PixelModalContent className="api-setup-content">
          <section>
            <div className="api-setup-label">快速选择</div>
            <div className="api-provider-grid">
              {PRESET_PROVIDERS.map(preset => {
                const active = baseUrl === preset.baseUrl;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    data-cursor="pointer"
                    aria-label={preset.name}
                    aria-pressed={active}
                    onClick={() => handlePreset(preset)}
                    className={`api-provider-button ${active ? 'is-active' : ''}`}
                  >
                    <div className="api-provider-short">{preset.short}</div>
                    <div className="api-provider-name">{preset.name}</div>
                    <div className="api-provider-model">{preset.model}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <PixelInput label="Base URL" value={baseUrl} onChange={value => { setBaseUrl(value); setModels([]); }} placeholder="https://api.openai.com/v1" />
            </div>
            <button
              type="button"
              data-cursor="pointer"
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="api-setup-button api-fetch-button"
            >
              <GameIcon name="restart" size={13} className={fetchingModels ? 'animate-spin' : ''} />
              {fetchingModels ? '读取中' : '读取模型'}
            </button>
          </div>
          <PixelInput
            label="API Key"
            required
            type="password"
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-..."
            onEnter={() => {
              if (apiKey.trim()) handleSave();
            }}
          />
          {models.length > 0 ? (
            <label className="api-input-field">
              <span className="api-setup-label">模型</span>
              <span className="api-input-frame">
                <select
                  value={model}
                  onChange={event => setModel(event.target.value)}
                  className="api-setup-input"
                >
                  {models.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </span>
            </label>
          ) : (
            <PixelInput label="模型" value={model} onChange={setModel} placeholder="gpt-4o-mini" />
          )}
        </PixelModalContent>

        <PixelModalFooter className="api-setup-actions">
          <button
            type="button"
            data-cursor="pointer"
            onClick={handleLater}
            className="api-setup-button is-secondary"
          >
            稍后配置
          </button>
          <button
            type="button"
            data-cursor="pointer"
            onClick={handleSave}
            className="api-setup-button is-primary"
          >
            保存
            <GameIcon name="action" size={14} />
          </button>
        </PixelModalFooter>
      </div>
    </PixelModalShell>
  );
}

function PixelInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  autoFocus = false,
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  return (
    <label className="api-input-field">
      <span className="api-setup-label">
        {label} {required && <span>*</span>}
      </span>
      <span className="api-input-frame">
        <input
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={event => {
            if (event.key === 'Enter') onEnter?.();
          }}
          className="api-setup-input"
        />
      </span>
    </label>
  );
}
