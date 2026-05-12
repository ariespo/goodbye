import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { X, Lightning, Stack } from '@phosphor-icons/react';
import type { AppSettings } from '../../sillytavern/types';

const PRESET_PROVIDERS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Anthropic 兼容', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
];

const SECONDARY_PRESET = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };

export function SettingsModal() {
  const settings = useGameStore(state => state.tavern.settings);
  const showSettings = useGameStore(state => state.ui.showSettings);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);

  const [draft, setDraft] = useState<AppSettings | null>(settings);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings, showSettings]);

  if (!showSettings || !draft) return null;

  const apiMode: 'single' | 'dual' = draft.api.secondary?.enabled ? 'dual' : 'single';

  const patch = (p: Partial<AppSettings>) => setDraft({ ...draft, ...p });
  const patchApi = (p: Partial<AppSettings['api']>) => setDraft({ ...draft, api: { ...draft.api, ...p } });
  const patchSecondary = (p: Partial<NonNullable<AppSettings['api']['secondary']>>) => {
    const cur = draft.api.secondary || { enabled: false, ...SECONDARY_PRESET, apiKey: '' };
    setDraft({ ...draft, api: { ...draft.api, secondary: { ...cur, ...p } } });
  };

  const applyMainProvider = (preset: typeof PRESET_PROVIDERS[0]) => {
    patchApi({ baseUrl: preset.baseUrl, model: preset.model });
  };
  const applySecondaryProvider = (preset: typeof PRESET_PROVIDERS[0]) => {
    patchSecondary({ baseUrl: preset.baseUrl, model: preset.model });
  };

  const switchMode = (mode: 'single' | 'dual') => {
    if (mode === 'single') {
      patchSecondary({ enabled: false });
    } else {
      // 启用双 API
      const cur = draft.api.secondary;
      if (cur) {
        patchSecondary({ enabled: true });
      } else {
        patchApi({
          secondary: {
            enabled: true,
            baseUrl: SECONDARY_PRESET.baseUrl,
            apiKey: draft.api.apiKey,
            model: SECONDARY_PRESET.model,
          },
        });
      }
    }
  };

  const handleSave = async () => {
    await saveSettings(draft);
    actions.setSettings(draft);
    toggleModal('settings');
    actions.addNotification({ type: 'success', message: '设置已保存', duration: 2500 });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={() => toggleModal('settings')}
    >
      <div
        className="w-[680px] max-h-[85vh] bg-bg-primary border border-border-subtle overflow-y-auto animate-[scaleIn_0.35s_ease-out]"
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
          {/* API 模式 */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-3">API 模式</h3>
            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                active={apiMode === 'single'}
                icon={<Lightning size={18} />}
                title="单 API"
                desc="所有任务都走主 API"
                onClick={() => switchMode('single')}
              />
              <ModeCard
                active={apiMode === 'dual'}
                icon={<Stack size={18} />}
                title="双 API 路由"
                desc="次 API 跑变量/总结(可用更便宜模型)"
                onClick={() => switchMode('dual')}
              />
            </div>
          </div>

          {/* 主 API */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm text-text-muted uppercase tracking-widest">主 API <span className="text-text-muted/60 normal-case tracking-normal">(剧情生成)</span></h3>
            </div>
            <ProviderPresets selected={draft.api.baseUrl} onPick={applyMainProvider} />
            <ApiFields
              baseUrl={draft.api.baseUrl}
              apiKey={draft.api.apiKey}
              model={draft.api.model}
              onChange={patchApi}
            />
          </div>

          {/* 次 API */}
          {apiMode === 'dual' && (
            <div>
              <h3 className="text-sm text-text-muted uppercase tracking-widest mb-3">次 API <span className="text-text-muted/60 normal-case tracking-normal">(变量/总结)</span></h3>
              <ProviderPresets selected={draft.api.secondary?.baseUrl ?? ''} onPick={applySecondaryProvider} />
              <ApiFields
                baseUrl={draft.api.secondary?.baseUrl ?? ''}
                apiKey={draft.api.secondary?.apiKey ?? ''}
                model={draft.api.secondary?.model ?? ''}
                onChange={p => patchSecondary({
                  baseUrl: p.baseUrl ?? draft.api.secondary?.baseUrl ?? '',
                  apiKey: p.apiKey ?? draft.api.secondary?.apiKey ?? '',
                  model: p.model ?? draft.api.secondary?.model ?? '',
                })}
              />
              <p className="mt-2 text-[11px] text-text-muted/70 leading-relaxed">
                次 API 仅用于无需高质量推理的辅助任务(变量更新、回合总结)。如调用失败会自动回退到主 API。
              </p>
            </div>
          )}

          {/* 角色 */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-3">角色</h3>
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="角色名" value={draft.characterName} onChange={v => patch({ characterName: v })} />
              <LabeledInput label="玩家名" value={draft.userName} onChange={v => patch({ userName: v })} />
            </div>
          </div>

          {/* 游戏 */}
          <div>
            <h3 className="text-sm text-text-muted uppercase tracking-widest mb-3">游戏</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted block mb-1">
                  打字速度: <span className="text-text-primary">{draft.typingSpeed} ms / 字</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={draft.typingSpeed}
                  onChange={e => patch({ typingSpeed: Number(e.target.value) })}
                  className="w-full accent-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">
                  情绪强度: <span className="text-text-primary">{Math.round(draft.moodIntensity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.moodIntensity}
                  onChange={e => patch({ moodIntensity: Number(e.target.value) })}
                  className="w-full accent-accent-blue"
                />
              </div>

              <div>
                <label className="text-xs text-text-muted block mb-1">字号</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => patch({ fontSize: size })}
                      className={`px-3 py-1 text-xs border transition-colors ${
                        draft.fontSize === size
                          ? 'border-accent-blue text-accent-blue bg-accent-blue/10'
                          : 'border-border-subtle text-text-muted hover:border-text-muted hover:text-text-primary'
                      }`}
                    >
                      {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                    </button>
                  ))}
                </div>
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

// ============ 子组件 ============

function ModeCard({ active, icon, title, desc, onClick }: {
  active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 border transition-all ${
        active
          ? 'border-accent-blue bg-accent-blue/10'
          : 'border-border-subtle hover:border-text-muted'
      }`}
    >
      <div className={`flex items-center gap-2 mb-1 ${active ? 'text-accent-blue' : 'text-text-primary'}`}>
        {icon}
        <span className="text-sm font-serif-cn">{title}</span>
      </div>
      <div className="text-xs text-text-muted leading-relaxed">{desc}</div>
    </button>
  );
}

function ProviderPresets({ selected, onPick }: {
  selected: string;
  onPick: (preset: typeof PRESET_PROVIDERS[0]) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-3">
      {PRESET_PROVIDERS.map(p => (
        <button
          key={p.name}
          type="button"
          onClick={() => onPick(p)}
          className={`px-2 py-1.5 text-[11px] border transition-colors ${
            selected === p.baseUrl
              ? 'border-accent-blue text-accent-blue bg-accent-blue/10'
              : 'border-border-subtle text-text-muted hover:border-text-muted hover:text-text-primary'
          }`}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

function ApiFields({ baseUrl, apiKey, model, onChange }: {
  baseUrl: string;
  apiKey: string;
  model: string;
  onChange: (p: { baseUrl?: string; apiKey?: string; model?: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <LabeledInput label="Base URL" value={baseUrl} mono onChange={v => onChange({ baseUrl: v })} />
      <LabeledInput label="API Key" value={apiKey} mono password onChange={v => onChange({ apiKey: v })} />
      <LabeledInput label="模型" value={model} mono onChange={v => onChange({ model: v })} />
    </div>
  );
}

function LabeledInput({ label, value, onChange, mono, password }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  password?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">{label}</div>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors ${
          mono ? 'font-mono' : ''
        }`}
      />
    </label>
  );
}
