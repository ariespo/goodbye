import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { saveSettings } from '../../sillytavern/database';
import { fetchModels, testConnectivity } from '../../sillytavern/api-router';
import { X, Lightning, Stack, CheckCircle, Warning, ArrowCounterClockwise } from '@phosphor-icons/react';
import type { AppSettings } from '../../sillytavern/types';

const PRESET_PROVIDERS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
];

const SECONDARY_PRESET = { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 512 };

interface ModelCache {
  [baseUrl: string]: { models: string[]; timestamp: number };
}

const modelCache: ModelCache = {};
const CACHE_TTL = 5 * 60 * 1000;

export function SettingsModal() {
  const settings = useGameStore(state => state.tavern.settings);
  const showSettings = useGameStore(state => state.ui.showSettings);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const actions = useGameStore(state => state.actions);

  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [mainModels, setMainModels] = useState<string[]>([]);
  const [secModels, setSecModels] = useState<string[]>([]);
  const [mainConn, setMainConn] = useState<{ ok: boolean; latency: number; model?: string } | null>(null);
  const [secConn, setSecConn] = useState<{ ok: boolean; latency: number; model?: string } | null>(null);
  const [fetchingMain, setFetchingMain] = useState(false);
  const [fetchingSec, setFetchingSec] = useState(false);
  const [testingMain, setTestingMain] = useState(false);
  const [testingSec, setTestingSec] = useState(false);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings, showSettings]);

  useEffect(() => {
    if (!showSettings || !draft) return;
    // 尝试从缓存恢复模型列表
    const mainCache = modelCache[draft.api.baseUrl];
    if (mainCache && Date.now() - mainCache.timestamp < CACHE_TTL) {
      setMainModels(mainCache.models);
    }
    if (draft.api.secondary?.baseUrl) {
      const secCache = modelCache[draft.api.secondary.baseUrl];
      if (secCache && Date.now() - secCache.timestamp < CACHE_TTL) {
        setSecModels(secCache.models);
      }
    }
  }, [showSettings, draft?.api.baseUrl, draft?.api.secondary?.baseUrl]);

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
    setMainModels([]);
    setMainConn(null);
  };
  const applySecondaryProvider = (preset: typeof PRESET_PROVIDERS[0]) => {
    patchSecondary({ baseUrl: preset.baseUrl, model: preset.model });
    setSecModels([]);
    setSecConn(null);
  };

  const switchMode = (mode: 'single' | 'dual') => {
    if (mode === 'single') {
      patchSecondary({ enabled: false });
    } else {
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
            temperature: SECONDARY_PRESET.temperature,
            maxTokens: SECONDARY_PRESET.maxTokens,
          },
        });
      }
    }
  };

  const handleFetchModels = useCallback(async (isSecondary: boolean) => {
    const config = isSecondary
      ? { baseUrl: draft.api.secondary?.baseUrl ?? '', apiKey: draft.api.secondary?.apiKey ?? '', model: '' }
      : { baseUrl: draft.api.baseUrl, apiKey: draft.api.apiKey, model: '' };

    if (!config.baseUrl || !config.apiKey) {
      actions.addNotification({ type: 'warning', message: '请先填写 Base URL 和 API Key', duration: 3000 });
      return;
    }

    const setFetching = isSecondary ? setFetchingSec : setFetchingMain;
    const setModels = isSecondary ? setSecModels : setMainModels;
    setFetching(true);

    try {
      const fetched = await fetchModels(config);
      const ids = fetched.map(m => m.id);
      setModels(ids);
      modelCache[config.baseUrl] = { models: ids, timestamp: Date.now() };
      actions.addNotification({ type: 'success', message: `获取到 ${ids.length} 个模型`, duration: 2500 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '获取模型列表失败';
      actions.addNotification({ type: 'error', message: msg, duration: 4000 });
    } finally {
      setFetching(false);
    }
  }, [draft.api, actions]);

  const handleTestConnectivity = useCallback(async (isSecondary: boolean) => {
    const config = isSecondary
      ? { baseUrl: draft.api.secondary?.baseUrl ?? '', apiKey: draft.api.secondary?.apiKey ?? '', model: draft.api.secondary?.model ?? '' }
      : { baseUrl: draft.api.baseUrl, apiKey: draft.api.apiKey, model: draft.api.model };

    if (!config.baseUrl || !config.apiKey || !config.model) {
      actions.addNotification({ type: 'warning', message: '请先填写 Base URL、API Key 和模型', duration: 3000 });
      return;
    }

    const setTesting = isSecondary ? setTestingSec : setTestingMain;
    const setConn = isSecondary ? setSecConn : setMainConn;
    setTesting(true);

    try {
      const result = await testConnectivity(config);
      setConn(result);
      actions.addNotification({ type: 'success', message: `连通性测试通过 (${result.latency}ms)`, duration: 2500 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '连通性测试失败';
      setConn({ ok: false, latency: 0 });
      actions.addNotification({ type: 'error', message: msg, duration: 4000 });
    } finally {
      setTesting(false);
    }
  }, [draft.api, actions]);

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
        className="w-[720px] max-h-[85vh] bg-bg-primary border border-border-subtle overflow-y-auto animate-[scaleIn_0.35s_ease-out]"
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
              {mainConn && (
                <span className={`flex items-center gap-1 text-xs ${mainConn.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {mainConn.ok ? <CheckCircle size={12} /> : <Warning size={12} />}
                  {mainConn.ok ? `${mainConn.latency}ms` : '未连通'}
                </span>
              )}
            </div>
            <ProviderPresets selected={draft.api.baseUrl} onPick={applyMainProvider} />
            <ApiConfigSection
              baseUrl={draft.api.baseUrl}
              apiKey={draft.api.apiKey}
              model={draft.api.model}
              models={mainModels}
              onChange={patchApi}
              onFetchModels={() => handleFetchModels(false)}
              onTest={() => handleTestConnectivity(false)}
              fetching={fetchingMain}
              testing={testingMain}
            />
          </div>

          {/* 次 API */}
          {apiMode === 'dual' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-text-muted uppercase tracking-widest">次 API <span className="text-text-muted/60 normal-case tracking-normal">(变量/总结)</span></h3>
                {secConn && (
                  <span className={`flex items-center gap-1 text-xs ${secConn.ok ? 'text-green-400' : 'text-red-400'}`}>
                    {secConn.ok ? <CheckCircle size={12} /> : <Warning size={12} />}
                    {secConn.ok ? `${secConn.latency}ms` : '未连通'}
                  </span>
                )}
              </div>
              <ProviderPresets selected={draft.api.secondary?.baseUrl ?? ''} onPick={applySecondaryProvider} />
              <ApiConfigSection
                baseUrl={draft.api.secondary?.baseUrl ?? ''}
                apiKey={draft.api.secondary?.apiKey ?? ''}
                model={draft.api.secondary?.model ?? ''}
                models={secModels}
                onChange={p => patchSecondary({
                  baseUrl: p.baseUrl ?? draft.api.secondary?.baseUrl ?? '',
                  apiKey: p.apiKey ?? draft.api.secondary?.apiKey ?? '',
                  model: p.model ?? draft.api.secondary?.model ?? '',
                })}
                onFetchModels={() => handleFetchModels(true)}
                onTest={() => handleTestConnectivity(true)}
                fetching={fetchingSec}
                testing={testingSec}
                extraFields={(
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-[10px] text-text-muted uppercase tracking-widest mb-1 block">温度</label>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={draft.api.secondary?.temperature ?? 0.3}
                        onChange={e => patchSecondary({ temperature: Number(e.target.value) })}
                        className="w-full accent-accent-blue"
                      />
                      <div className="text-[11px] text-text-muted text-right">{draft.api.secondary?.temperature ?? 0.3}</div>
                    </div>
                    <LabeledInput
                      label="最大 Token"
                      value={String(draft.api.secondary?.maxTokens ?? 512)}
                      mono
                      onChange={v => patchSecondary({ maxTokens: parseInt(v, 10) || 512 })}
                    />
                  </div>
                )}
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

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-text-muted">
                  <input
                    type="checkbox"
                    checked={draft.autoMode ?? false}
                    onChange={e => patch({ autoMode: e.target.checked })}
                    className="accent-accent-blue"
                  />
                  <span>自动播放模式</span>
                </label>
                <span className="text-[11px] text-text-muted/60">{draft.autoMode ? '一行显示完毕后自动推进下一行' : '打字完等待点击或空格'}</span>
              </div>

              {draft.autoMode && (
                <div>
                  <label className="text-xs text-text-muted block mb-1">
                    自动间隔: <span className="text-text-primary">{(draft.autoIntervalMs ?? 1500) / 1000} 秒</span>
                  </label>
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={draft.autoIntervalMs ?? 1500}
                    onChange={e => patch({ autoIntervalMs: Number(e.target.value) })}
                    className="w-full accent-accent-blue"
                  />
                </div>
              )}

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

function ApiConfigSection({
  baseUrl, apiKey, model, models, onChange, onFetchModels, onTest, fetching, testing, extraFields,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  models: string[];
  onChange: (p: { baseUrl?: string; apiKey?: string; model?: string }) => void;
  onFetchModels: () => void;
  onTest: () => void;
  fetching: boolean;
  testing: boolean;
  extraFields?: React.ReactNode;
}) {
  const showDropdown = models.length > 0;
  const modelInList = models.includes(model);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <LabeledInput label="Base URL" value={baseUrl} mono onChange={v => onChange({ baseUrl: v })} />
        </div>
        <div className="flex gap-2 pt-5">
          <button
            type="button"
            onClick={onFetchModels}
            disabled={fetching}
            className="px-3 py-2 text-[11px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-muted transition-all disabled:opacity-40 whitespace-nowrap flex items-center gap-1"
            title="获取模型列表"
          >
            <ArrowCounterClockwise size={12} className={fetching ? 'animate-spin' : ''} />
            {fetching ? '获取中' : '获取模型'}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="px-3 py-2 text-[11px] border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-muted transition-all disabled:opacity-40 whitespace-nowrap"
          >
            {testing ? '测试中' : '测试连通'}
          </button>
        </div>
      </div>

      <LabeledInput label="API Key" value={apiKey} mono password onChange={v => onChange({ apiKey: v })} />

      <div>
        <label className="block">
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">模型</div>
          {showDropdown ? (
            <div className="flex gap-2">
              <select
                value={modelInList ? model : ''}
                onChange={e => onChange({ model: e.target.value })}
                className="flex-1 px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors font-mono"
              >
                <option value="">-- 选择模型 --</option>
                {models.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="text"
                value={model}
                onChange={e => onChange({ model: e.target.value })}
                placeholder="或手动输入"
                className="flex-1 px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors font-mono"
              />
            </div>
          ) : (
            <input
              type="text"
              value={model}
              onChange={e => onChange({ model: e.target.value })}
              className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle text-text-primary text-sm focus:border-accent-blue focus:outline-none transition-colors font-mono"
            />
          )}
        </label>
      </div>

      {extraFields}
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
