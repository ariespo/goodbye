import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { GameIcon, type GameIconName } from '../ui/GameIcon';
import { saveSettings } from '../../sillytavern/database';
import { fetchModels, testConnectivity } from '../../sillytavern/api-router';
import type { AppSettings } from '../../sillytavern/types';
import type { CSSProperties } from 'react';
import { applyFontFamily, FONT_OPTIONS, getFontStack } from '../../utils/fonts';
import { setSfxVolume } from '../../utils/sfx';

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
type SettingsTab = 'game' | 'audio' | 'ai' | 'story' | 'advanced';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: GameIconName }> = [
  { id: 'game', label: '游戏', icon: 'action' },
  { id: 'audio', label: '音频', icon: 'play' },
  { id: 'ai', label: 'AI 接口', icon: 'lightning' },
  { id: 'story', label: '剧情模式', icon: 'stack' },
  { id: 'advanced', label: '高级', icon: 'settings' },
];

export function SettingsModal() {
  const settings = useGameStore(state => state.tavern.settings);
  const showSettings = useGameStore(state => state.ui.showSettings);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const setShowPromptInspector = useGameStore(state => state.actions.setShowPromptInspector);
  const setShowOrchestrationLog = useGameStore(state => state.actions.setShowOrchestrationLog);
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('game');

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings, showSettings]);

  useEffect(() => {
    const onTab = (e: Event) => setActiveTab((e as CustomEvent<SettingsTab>).detail);
    window.addEventListener('farewell:settings-tab', onTab);
    return () => window.removeEventListener('farewell:settings-tab', onTab);
  }, []);

  useEffect(() => {
    if (!showSettings || !draft) return;
    applyFontFamily(draft.fontFamily);
    return () => applyFontFamily(settings?.fontFamily);
  }, [showSettings, draft?.fontFamily, settings?.fontFamily]);

  useEffect(() => {
    if (!showSettings || !draft) return;
    setSfxVolume(draft.soundVolume ?? 0.65);
    return () => setSfxVolume(settings?.soundVolume ?? 0.65);
  }, [showSettings, draft?.soundVolume, settings?.soundVolume]);

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

  const apiMode: 'single' | 'dual' = draft?.api.secondary?.enabled ? 'dual' : 'single';

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
    if (!draft) return;
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
  }, [draft, actions]);

  const handleTestConnectivity = useCallback(async (isSecondary: boolean) => {
    if (!draft) return;
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
  }, [draft, actions]);

  const handleSave = async () => {
    if (!draft) return;
    await saveSettings(draft);
    actions.setSettings(draft);
    toggleModal('settings');
    actions.addNotification({ type: 'success', message: '设置已保存', duration: 2500 });
  };

  const openAdvancedTool = (tool: 'lorebook' | 'preset' | 'prompt' | 'orchestration') => {
    toggleModal('settings');
    if (tool === 'prompt') setShowPromptInspector(true);
    else if (tool === 'orchestration') setShowOrchestrationLog(true);
    else toggleModal(tool);
  };

  if (!showSettings || !draft) return null;

  return (
    <div
      className="settings-modal-shell fixed inset-0 z-[200] flex items-center justify-center px-4"
      onClick={() => toggleModal('settings')}
    >
      <div
        className="settings-modal relative w-[740px] max-h-[88vh] overflow-hidden animate-[scaleIn_0.35s_ease-out]"
        onClick={e => e.stopPropagation()}
      >
        <div className="settings-modal-header flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="settings-modal-title">设置</h2>
            <div className="settings-modal-subtitle">SYSTEM CONFIG</div>
          </div>
          <button
            type="button"
            aria-label="关闭设置"
            data-cursor="pointer"
            onClick={() => toggleModal('settings')}
            className="pixel-close-button flex h-9 w-9 items-center justify-center"
          >
            <GameIcon name="close" size={15} />
          </button>
        </div>

        <nav className="settings-tabs" aria-label="设置分类">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'is-active' : ''}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <GameIcon name={tab.icon} size={16} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="settings-modal-body pixel-scroll-blue overflow-y-auto p-6">
          {activeTab === 'game' && (
            <section className="settings-section settings-tab-panel">
              <h3 className="settings-section-title">游戏与阅读</h3>
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput label="角色名" value={draft.characterName} onChange={v => patch({ characterName: v })} />
                <LabeledInput label="玩家名" value={draft.userName} onChange={v => patch({ userName: v })} />
              </div>
              <div className="mt-5 space-y-4">
              <div>
                <label className="settings-label">
                  打字速度: <span className="settings-value">{draft.typingSpeed} ms / 字</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={120}
                  value={draft.typingSpeed}
                  onChange={e => patch({ typingSpeed: Number(e.target.value) })}
                  className="settings-range w-full"
                />
              </div>

              <div>
                <label className="settings-label">
                  情绪强度: <span className="settings-value">{Math.round(draft.moodIntensity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={draft.moodIntensity}
                  onChange={e => patch({ moodIntensity: Number(e.target.value) })}
                  className="settings-range w-full"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="settings-check">
                  <input
                    type="checkbox"
                    checked={draft.autoMode ?? false}
                    onChange={e => patch({ autoMode: e.target.checked })}
                  />
                  <span>自动播放模式</span>
                </label>
                <span className="settings-help shrink-0">{draft.autoMode ? '一行显示完毕后自动推进下一行' : '打字完等待点击或空格'}</span>
              </div>

              {draft.autoMode && (
                <div>
                  <label className="settings-label">
                    自动间隔: <span className="settings-value">{(draft.autoIntervalMs ?? 1500) / 1000} 秒</span>
                  </label>
                  <input
                    type="range"
                    min={500}
                    max={5000}
                    step={100}
                    value={draft.autoIntervalMs ?? 1500}
                    onChange={e => patch({ autoIntervalMs: Number(e.target.value) })}
                    className="settings-range w-full"
                  />
                </div>
              )}

              <div>
                <label className="settings-label">字体</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FONT_OPTIONS.map(font => {
                    const selected = (draft.fontFamily || 'renou-fangsong') === font.id;
                    return (
                      <button
                        key={font.id}
                        type="button"
                        data-cursor="pointer"
                        aria-pressed={selected}
                        onClick={() => patch({ fontFamily: font.id })}
                        className={`settings-chip font-preview-option min-h-[58px] px-4 py-2 text-left ${selected ? 'is-active' : ''}`}
                        style={{ '--preview-font-family': getFontStack(font.id), cursor: 'pointer' } as CSSProperties}
                      >
                        <span className="block text-[17px] leading-6">{font.name}</span>
                        <span className="block text-[12px] opacity-70">永别之前 · Goodbye 09:00</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="settings-label">字号</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map(size => (
                    <button
                      key={size}
                      type="button"
                      data-cursor="pointer"
                      onClick={() => patch({ fontSize: size })}
                      className={`settings-chip px-3 py-1 text-xs ${draft.fontSize === size ? 'is-active' : ''}`}
                    >
                      {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </section>
          )}

          {activeTab === 'audio' && (
            <section className="settings-section settings-tab-panel">
              <h3 className="settings-section-title">音频</h3>
              <div className="space-y-6">
                <VolumeControl label="音乐音量" value={draft.musicVolume ?? 0.5} onChange={value => patch({ musicVolume: value })} />
                <VolumeControl label="音效音量" value={draft.soundVolume ?? 0.65} onChange={value => patch({ soundVolume: value })} />
              </div>
            </section>
          )}

          {activeTab === 'story' && (
            <section className="settings-section settings-tab-panel">
              <h3 className="settings-section-title">剧情一致性</h3>
              <p className="settings-help mb-4">“稳定剧情”和“严谨剧情”都会执行硬规则与语义事实复核；经典模式仅用于兼容旧存档与调试。</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ModeCard active={(draft.agentNarrativeMode ?? 'standard') === 'standard'} icon={<GameIcon name="stack" size={18} />} title="稳定剧情" desc="推荐 · 硬规则、语义复核与事实隔离" onClick={() => patch({ agentNarrativeMode: 'standard' })} />
                <ModeCard active={draft.agentNarrativeMode === 'strict'} icon={<GameIcon name="success" size={18} />} title="严谨剧情" desc="兼容档 · 当前采用同级事实审查" onClick={() => patch({ agentNarrativeMode: 'strict' })} />
                <ModeCard active={draft.agentNarrativeMode === 'legacy'} icon={<GameIcon name="restart" size={18} />} title="经典模式" desc="沿用原有完整提示词生成流程" onClick={() => patch({ agentNarrativeMode: 'legacy' })} />
              </div>
            </section>
          )}

          {activeTab === 'ai' && (
            <div className="settings-tab-panel space-y-6">
              <section className="settings-section">
                <h3 className="settings-section-title">API 分工</h3>
                <div className="grid grid-cols-2 gap-3">
                  <ModeCard active={apiMode === 'single'} icon={<GameIcon name="lightning" size={18} />} title="单 API" desc="所有生成任务使用主接口" onClick={() => switchMode('single')} />
                  <ModeCard active={apiMode === 'dual'} icon={<GameIcon name="stack" size={18} />} title="双 API" desc="使用次接口处理总结与状态" onClick={() => switchMode('dual')} />
                </div>
              </section>
              <section className="settings-section">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="settings-section-title mb-0">主 API <span className="settings-section-hint">剧情生成</span></h3>
                  {mainConn && <span className={`settings-conn ${mainConn.ok ? 'is-ok' : 'is-bad'}`}>{mainConn.ok ? <GameIcon name="success" size={12} /> : <GameIcon name="warning" size={12} />}{mainConn.ok ? `${mainConn.latency}ms` : '未连通'}</span>}
                </div>
                <ProviderPresets selected={draft.api.baseUrl} onPick={applyMainProvider} />
                <ApiConfigSection baseUrl={draft.api.baseUrl} apiKey={draft.api.apiKey} model={draft.api.model} models={mainModels} onChange={patchApi} onFetchModels={() => handleFetchModels(false)} onTest={() => handleTestConnectivity(false)} fetching={fetchingMain} testing={testingMain} />
              </section>
              {apiMode === 'dual' && (
                <section className="settings-section">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="settings-section-title mb-0">次 API <span className="settings-section-hint">Agent 编排 / 总结与状态</span></h3>
                    {secConn && <span className={`settings-conn ${secConn.ok ? 'is-ok' : 'is-bad'}`}>{secConn.ok ? <GameIcon name="success" size={12} /> : <GameIcon name="warning" size={12} />}{secConn.ok ? `${secConn.latency}ms` : '未连通'}</span>}
                  </div>
                  <ProviderPresets selected={draft.api.secondary?.baseUrl ?? ''} onPick={applySecondaryProvider} />
                  <ApiConfigSection baseUrl={draft.api.secondary?.baseUrl ?? ''} apiKey={draft.api.secondary?.apiKey ?? ''} model={draft.api.secondary?.model ?? ''} models={secModels} onChange={p => patchSecondary({ baseUrl: p.baseUrl ?? draft.api.secondary?.baseUrl ?? '', apiKey: p.apiKey ?? draft.api.secondary?.apiKey ?? '', model: p.model ?? draft.api.secondary?.model ?? '' })} onFetchModels={() => handleFetchModels(true)} onTest={() => handleTestConnectivity(true)} fetching={fetchingSec} testing={testingSec} extraFields={<div className="mt-3 grid grid-cols-2 gap-3"><VolumeLikeRange label="温度" value={draft.api.secondary?.temperature ?? 0.3} max={2} step={0.1} onChange={value => patchSecondary({ temperature: value })} /><LabeledInput label="最大 Token" value={String(draft.api.secondary?.maxTokens ?? 512)} mono onChange={value => patchSecondary({ maxTokens: parseInt(value, 10) || 512 })} /></div>} />
                </section>
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <section className="settings-section settings-tab-panel">
              <h3 className="settings-section-title">创作与诊断工具</h3>
              <p className="settings-help mb-4">以下入口用于调整生成资料和检查提示词，普通游玩无需使用。</p>
              <div className="advanced-tool-grid">
                <AdvancedTool icon="lorebook" title="世界书" desc="管理背景资料与触发条目" onClick={() => openAdvancedTool('lorebook')} />
                <AdvancedTool icon="preset" title="预设" desc="导入和编辑模型预设" onClick={() => openAdvancedTool('preset')} />
                <AdvancedTool icon="prompt" title="提示词检查" desc="查看最终发送给模型的内容" onClick={() => openAdvancedTool('prompt')} />
                <AdvancedTool icon="history" title="编排日志" desc="查看多 Agent 编排的计划、审查与耗时" onClick={() => openAdvancedTool('orchestration')} />
              </div>
            </section>
          )}
        </div>

        <div className="settings-modal-footer flex items-center justify-between gap-3 px-6 py-4">
          <span className="settings-footer-hint">更改将在保存后生效</span>
          <div className="flex gap-3">
            <button
              type="button"
              data-cursor="pointer"
              onClick={() => toggleModal('settings')}
              className="settings-btn settings-btn-ghost"
            >
              取消
            </button>
            <button
              type="button"
              data-cursor="pointer"
              onClick={handleSave}
              className="settings-btn settings-btn-primary"
            >
              保存
            </button>
          </div>
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
      data-cursor="pointer"
      onClick={onClick}
      className={`settings-mode-card ${active ? 'is-active' : ''}`}
    >
      <div className="settings-mode-card-title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="settings-mode-card-desc">{desc}</div>
    </button>
  );
}

function ProviderPresets({ selected, onPick }: {
  selected: string;
  onPick: (preset: typeof PRESET_PROVIDERS[0]) => void;
}) {
  return (
    <div className="mb-3 grid grid-cols-4 gap-2">
      {PRESET_PROVIDERS.map(p => (
        <button
          key={p.name}
          type="button"
          data-cursor="pointer"
          onClick={() => onPick(p)}
          className={`settings-chip ${selected === p.baseUrl ? 'is-active' : ''}`}
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
            data-cursor="pointer"
            onClick={onFetchModels}
            disabled={fetching}
            className="settings-btn settings-btn-ghost settings-btn-sm"
            title="获取模型列表"
          >
            <GameIcon name="restart" size={12} className={fetching ? 'animate-spin' : ''} />
            {fetching ? '获取中' : '获取模型'}
          </button>
          <button
            type="button"
            data-cursor="pointer"
            onClick={onTest}
            disabled={testing}
            className="settings-btn settings-btn-ghost settings-btn-sm"
          >
            {testing ? '测试中' : '测试连通'}
          </button>
        </div>
      </div>

      <LabeledInput label="API Key" value={apiKey} mono password onChange={v => onChange({ apiKey: v })} />

      <div>
        <label className="block">
          <div className="settings-label">模型</div>
          {showDropdown ? (
            <div className="flex gap-2">
              <select
                value={modelInList ? model : ''}
                onChange={e => onChange({ model: e.target.value })}
                className="settings-input flex-1 font-mono"
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
                className="settings-input flex-1 font-mono"
              />
            </div>
          ) : (
            <input
              type="text"
              value={model}
              onChange={e => onChange({ model: e.target.value })}
              className="settings-input w-full font-mono"
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
      <div className="settings-label">{label}</div>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`settings-input w-full ${mono ? 'font-mono' : ''}`}
      />
    </label>
  );
}

function VolumeControl({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="settings-volume-control">
      <span className="settings-volume-control__header">
        <span className="settings-label">{label}</span>
        <span className="settings-value">{percent}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
        className="settings-range w-full"
      />
      <span className="settings-volume-scale" aria-hidden="true">
        <span>静音</span><span>最大</span>
      </span>
    </label>
  );
}

function VolumeLikeRange({ label, value, max, step, onChange }: {
  label: string;
  value: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="settings-volume-control__header">
        <span className="settings-label">{label}</span>
        <span className="settings-value">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value))}
        className="settings-range w-full"
      />
    </label>
  );
}

function AdvancedTool({ icon, title, desc, onClick }: {
  icon: GameIconName;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="advanced-tool-card" onClick={onClick}>
      <span className="advanced-tool-card__icon"><GameIcon name={icon} size={22} /></span>
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      <GameIcon name="back" size={14} className="advanced-tool-card__arrow" />
    </button>
  );
}
