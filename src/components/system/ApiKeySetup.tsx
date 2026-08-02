import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';

const PRESET_PROVIDERS = [
  { name: 'OpenAI', short: 'OA', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', short: 'DS', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', short: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Anthropic 兼容', short: 'ANT', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
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
      className="api-setup-shell fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(circle at 50% 42%, rgba(42,34,22,0.28), rgba(0,0,0,0.88) 62%, rgba(0,0,0,0.95))',
      }}
    >
      <div
        className="api-setup-modal clean-modal-frame clean-modal-frame-gold relative w-full max-w-[620px] animate-[scaleIn_0.35s_ease-out] overflow-hidden px-10 py-9"
        style={{
          minHeight: 606,
          imageRendering: 'pixelated',
          filter: 'drop-shadow(0 24px 54px rgba(0,0,0,0.66))',
        }}
      >
        <div className="mb-6 border-b-2 border-[#25252d] pb-4">
          <div className="mb-2 flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center"
              style={{
                backgroundImage: `url(${assetUrl('assets/ui/action-slot-gold-hover.png')})`,
                backgroundSize: '100% 100%',
                color: '#d4a853',
              }}
            >
              <GameIcon name="key" size={22} />
            </div>
            <div>
              <h2 className="font-serif-cn text-[24px] tracking-[0.16em] text-[#e8e4dc]">配置 AI 接口</h2>
              <div className="font-mono text-[11px] tracking-[0.18em] text-[#8a8580]">LOCAL CONNECTION SETUP</div>
            </div>
          </div>
          <p className="max-w-[500px] text-[13px] leading-relaxed text-[#aaa39a]">
            API Key 仅保存在本机浏览器 IndexedDB 中，不会上传到本项目服务器；发送请求时会直接交给你配置的 AI 服务商。你也可以稍后在设置里完成配置。
          </p>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-2 font-mono text-[12px] tracking-[0.18em] text-[#8a8580]">快速选择</div>
            <div className="api-provider-grid grid grid-cols-2 gap-3">
              {PRESET_PROVIDERS.map(preset => {
                const active = baseUrl === preset.baseUrl;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    data-cursor="pointer"
                    onClick={() => handlePreset(preset)}
                    className="api-provider-button relative h-[82px] px-4 text-left transition-[filter,transform] duration-100 hover:translate-x-px hover:translate-y-px"
                    style={{
                      backgroundImage: `url(${assetUrl(`assets/ui/api-provider-card-${active ? 'active' : 'normal'}.png`)})`,
                      backgroundSize: '100% 100%',
                      color: active ? '#e8e4dc' : '#8a8580',
                      imageRendering: 'pixelated',
                      cursor: 'pointer',
                      filter: active ? 'drop-shadow(0 0 12px rgba(107,143,196,0.25))' : 'drop-shadow(2px 2px 0 rgba(0,0,0,0.36))',
                    }}
                  >
                    <div className="mb-1 font-mono text-[11px] tracking-[0.16em] text-[#86a8f2]">{preset.short}</div>
                    <div className="font-serif-cn text-[17px] tracking-[0.08em]">{preset.name}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-[#6f6a64]">{preset.model}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <PixelInput label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
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
          <PixelInput label="模型" value={model} onChange={setModel} placeholder="gpt-4o-mini" />
        </div>

        <div className="api-setup-actions mt-7 flex items-center justify-between border-t-2 border-[#25252d] pt-4">
          <button
            type="button"
            data-cursor="pointer"
            onClick={handleLater}
            className="font-serif-cn text-[14px] tracking-[0.1em] text-[#8a8580] transition-colors hover:text-[#e8e4dc]"
            style={{ cursor: 'pointer' }}
          >
            稍后配置
          </button>
          <button
            type="button"
            data-cursor="pointer"
            onClick={handleSave}
            className="inline-flex h-11 items-center gap-2 px-6 font-serif-cn text-[16px] tracking-[0.12em] text-[#0d0d0f] transition-[filter,transform] duration-100 hover:translate-x-px hover:translate-y-px"
            style={{
              background: '#d4a853',
              boxShadow: '3px 3px 0 rgba(0,0,0,0.58), inset 1px 1px 0 rgba(255,255,255,0.42)',
              cursor: 'pointer',
            }}
          >
            开始
            <GameIcon name="action" size={14} />
          </button>
        </div>
      </div>
    </div>
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
    <label className="block">
      <span className="mb-1.5 block font-mono text-[12px] tracking-[0.16em] text-[#8a8580]">
        {label} {required && <span className="text-[#d4a853]">*</span>}
      </span>
      <span
        className="block h-[46px] px-4"
        style={{
          backgroundImage: `url(${assetUrl('assets/ui/input-frame-blue.png')})`,
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated',
        }}
      >
        <input
          type={type}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onKeyDown={event => {
            if (event.key === 'Enter') onEnter?.();
          }}
          className="h-full w-full bg-transparent font-mono text-[14px] text-[#e8e4dc] outline-none placeholder:text-[#514d49]"
        />
      </span>
    </label>
  );
}
