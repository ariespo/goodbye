import { useState } from 'react';
import type { ChatPreset, PromptOrderItem } from '../../sillytavern/types';
import { DEFAULT_PROMPT_ORDER } from '../../sillytavern/types';
import { ArrowUp, ArrowDown, CaretDown, CaretRight } from '@phosphor-icons/react';

interface Props {
  preset: ChatPreset;
  onChange: (next: ChatPreset) => void;
}

type Tab = 'basic' | 'params' | 'persona' | 'order';

const PROMPT_LABELS: Record<string, string> = {
  main: 'Main Prompt',
  worldInfoBefore: 'World Info (Before)',
  charDescription: 'Character Description',
  charPersonality: 'Character Personality',
  scenario: 'Scenario',
  personaDescription: 'Persona Description',
  dialogueExamples: 'Dialogue Examples',
  chatHistory: 'Chat History',
  worldInfoAfter: 'World Info (After)',
  groupNudge: 'Group Nudge',
  impersonate: 'Impersonate',
  quietPrompt: 'Quiet Prompt',
  nsfw: 'NSFW',
  jailbreak: 'Jailbreak',
  enhanceDefinitions: 'Enhance Definitions',
  authorsNote: "Author's Note",
};

const MARKER_IDS = new Set([
  'worldInfoBefore', 'worldInfoAfter', 'chatHistory',
  'charDescription', 'charPersonality', 'scenario',
  'personaDescription', 'dialogueExamples',
]);

export function PresetEditor({ preset, onChange }: Props) {
  const [tab, setTab] = useState<Tab>('basic');

  const patchSettings = (p: Record<string, any>) => {
    onChange({ ...preset, settings: { ...preset.settings, ...p }, updatedAt: Date.now() });
  };
  const patchPreset = (p: Partial<ChatPreset>) => {
    onChange({ ...preset, ...p, updatedAt: Date.now() });
  };

  const s = preset.settings;
  const promptOrder: PromptOrderItem[] = Array.isArray(s.prompt_order) && s.prompt_order.length
    ? s.prompt_order
    : DEFAULT_PROMPT_ORDER;

  const movePromptOrder = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= promptOrder.length) return;
    const next = [...promptOrder];
    [next[index], next[target]] = [next[target], next[index]];
    patchSettings({ prompt_order: next });
  };

  const togglePromptOrder = (index: number) => {
    const next = promptOrder.map((p, i) => i === index ? { ...p, enabled: p.enabled === false ? true : false } : p);
    patchSettings({ prompt_order: next });
  };

  const ensureModule = (identifier: string) => {
    if (promptOrder.find(p => p.identifier === identifier)) return;
    const next = [...promptOrder, { identifier, role: 'system' as const, enabled: true }];
    patchSettings({ prompt_order: next });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex border-b border-border-subtle text-xs">
        {(['basic', 'params', 'persona', 'order'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 transition-colors ${
              tab === t
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'basic' && (
          <>
            <Field label="名称">
              <input type="text" value={preset.name} onChange={e => patchPreset({ name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="描述">
              <textarea
                value={preset.description ?? ''}
                onChange={e => patchPreset({ description: e.target.value })}
                rows={2}
                className={inputCls + ' resize-y'}
              />
            </Field>
            <Field label="模型 (openai_model)">
              <input type="text" value={s.openai_model ?? ''} onChange={e => patchSettings({ openai_model: e.target.value })} className={inputCls} placeholder="gpt-4o-mini" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="最大上下文 (max_context)">
                <input type="number" value={s.openai_max_context ?? 8192} onChange={e => patchSettings({ openai_max_context: Number(e.target.value) || 0 })} className={inputCls} />
              </Field>
              <Field label="最大输出 (max_tokens)">
                <input type="number" value={s.openai_max_tokens ?? 2048} onChange={e => patchSettings({ openai_max_tokens: Number(e.target.value) || 0 })} className={inputCls} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={s.stream_openai !== false}
                onChange={e => patchSettings({ stream_openai: e.target.checked })}
                className="accent-accent-blue"
              />
              启用流式输出
            </label>
          </>
        )}

        {tab === 'params' && (
          <>
            <SliderField label="Temperature" value={s.temp_openai ?? 0.8} min={0} max={2} step={0.05} onChange={v => patchSettings({ temp_openai: v })} />
            <SliderField label="Top P" value={s.top_p_openai ?? 1} min={0} max={1} step={0.05} onChange={v => patchSettings({ top_p_openai: v })} />
            <SliderField label="Top K" value={s.top_k_openai ?? 0} min={0} max={200} step={1} onChange={v => patchSettings({ top_k_openai: v })} />
            <SliderField label="Frequency Penalty" value={s.freq_pen_openai ?? 0} min={-2} max={2} step={0.05} onChange={v => patchSettings({ freq_pen_openai: v })} />
            <SliderField label="Presence Penalty" value={s.pres_pen_openai ?? 0} min={-2} max={2} step={0.05} onChange={v => patchSettings({ pres_pen_openai: v })} />
          </>
        )}

        {tab === 'persona' && (
          <>
            <TextareaField label="Main Prompt (main)" value={s.main ?? ''} onChange={v => patchSettings({ main: v })} rows={4} placeholder="主提示词,通常是 system 角色设定" />
            <TextareaField label="角色描述 (character_description)" value={s.character_description ?? ''} onChange={v => patchSettings({ character_description: v })} rows={4} />
            <TextareaField label="角色人格 (character_personality)" value={s.character_personality ?? ''} onChange={v => patchSettings({ character_personality: v })} rows={3} />
            <TextareaField label="场景 (scenario)" value={s.scenario ?? ''} onChange={v => patchSettings({ scenario: v })} rows={3} />
            <TextareaField label="用户人设 (persona_description)" value={s.persona_description ?? ''} onChange={v => patchSettings({ persona_description: v })} rows={3} />
            <TextareaField label="对话示例 (dialogue_examples)" value={s.dialogue_examples ?? ''} onChange={v => patchSettings({ dialogue_examples: v })} rows={4} />
            <TextareaField label="NSFW (附加规则)" value={s.nsfw ?? ''} onChange={v => patchSettings({ nsfw: v })} rows={2} />
            <TextareaField label="Jailbreak" value={s.jailbreak ?? ''} onChange={v => patchSettings({ jailbreak: v })} rows={2} />
          </>
        )}

        {tab === 'order' && (
          <>
            <p className="text-xs text-text-muted leading-relaxed mb-2">
              定义提示词模块的<span className="text-text-primary">排列顺序</span>和<span className="text-text-primary">开关</span>。
              组装时按从上到下的顺序拼接。<code className="px-1 bg-bg-secondary">chatHistory</code> 之前的模块作为系统提示前缀,之后的作为后缀。
            </p>

            <div className="space-y-1.5">
              {promptOrder.map((item, idx) => (
                <PromptOrderRow
                  key={`${item.identifier}-${idx}`}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === promptOrder.length - 1}
                  onToggle={() => togglePromptOrder(idx)}
                  onMoveUp={() => movePromptOrder(idx, -1)}
                  onMoveDown={() => movePromptOrder(idx, 1)}
                  onContentChange={(next) => {
                    const arr = promptOrder.map((p, i) => i === idx ? { ...p, content: next } : p);
                    patchSettings({ prompt_order: arr });
                  }}
                />
              ))}
            </div>

            <div className="pt-3 border-t border-border-subtle">
              <div className="text-[10px] text-text-muted uppercase tracking-widest mb-2">添加缺失模块</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(PROMPT_LABELS)
                  .filter(id => !promptOrder.find(p => p.identifier === id))
                  .map(id => (
                    <button
                      key={id}
                      onClick={() => ensureModule(id)}
                      className="px-2 py-1 text-[10px] text-text-muted border border-border-subtle hover:border-accent-blue hover:text-accent-blue transition-colors"
                    >
                      + {PROMPT_LABELS[id]}
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function tabLabel(t: Tab) {
  return { basic: '基本', params: '参数', persona: '人设', order: '提示词顺序' }[t];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">{label}</div>
      {children}
    </label>
  );
}

function SliderField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} = ${value}`}>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent-blue"
      />
    </Field>
  );
}

function TextareaField({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={inputCls + ' resize-y font-mono text-xs'}
      />
    </Field>
  );
}

const inputCls = 'w-full px-2 py-1.5 bg-bg-primary border border-border-subtle text-text-primary text-xs focus:border-accent-blue focus:outline-none transition-colors';

function PromptOrderRow({ item, isFirst, isLast, onToggle, onMoveUp, onMoveDown, onContentChange }: {
  item: PromptOrderItem;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onContentChange: (content: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMarker = item.marker || MARKER_IDS.has(item.identifier);
  const hasContent = !!(item.content && item.content.trim());
  const role = item.role || 'system';

  return (
    <div className="border border-border-subtle bg-bg-secondary">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-text-muted hover:text-text-primary"
          title={expanded ? '折叠' : '展开'}
        >
          {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
        </button>
        <input
          type="checkbox"
          checked={item.enabled !== false}
          onChange={onToggle}
          className="accent-accent-blue"
        />
        <span className="flex-1 text-xs text-text-primary truncate" title={item.identifier}>
          {PROMPT_LABELS[item.identifier] || item.name || item.identifier}
          <span className="ml-2 text-text-muted font-mono">{item.identifier}</span>
        </span>

        {/* 标签 chips */}
        {isMarker && (
          <span className="text-[9px] px-1.5 py-0.5 border border-accent-gold/40 text-accent-gold/80 tracking-wider" title="占位符:运行时由世界书/历史/角色字段动态填充">
            占位
          </span>
        )}
        {!isMarker && hasContent && (
          <span className="text-[9px] px-1.5 py-0.5 border border-accent-blue/40 text-accent-blue/80 tracking-wider">
            有内容
          </span>
        )}
        {role !== 'system' && (
          <span className="text-[9px] px-1.5 py-0.5 border border-border-subtle text-text-muted font-mono">
            {role}
          </span>
        )}

        <button onClick={onMoveUp} disabled={isFirst} className="text-text-muted hover:text-accent-blue disabled:opacity-30">
          <ArrowUp size={12} />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="text-text-muted hover:text-accent-blue disabled:opacity-30">
          <ArrowDown size={12} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border-subtle/50">
          {isMarker ? (
            <p className="text-[11px] text-text-muted leading-relaxed">
              {item.identifier === 'worldInfoBefore' && '占位符:运行时注入匹配到的世界书条目(position: before_char / before_example / example_msg_top)。'}
              {item.identifier === 'worldInfoAfter' && '占位符:运行时注入匹配到的世界书条目(position: after_char / after_example / at_depth / example_msg_bottom / outlet)。'}
              {item.identifier === 'chatHistory' && '占位符:运行时注入聊天历史(按 token 预算自动裁剪)。'}
              {(item.identifier === 'charDescription' || item.identifier === 'charPersonality' || item.identifier === 'scenario' || item.identifier === 'personaDescription' || item.identifier === 'dialogueExamples') &&
                '占位符:运行时读取 preset.settings 中对应字段(character_description / character_personality / scenario / persona_description / dialogue_examples)。可在「人设」tab 编辑。'}
            </p>
          ) : (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">内容</div>
              <textarea
                value={item.content ?? ''}
                onChange={e => onContentChange(e.target.value)}
                rows={5}
                placeholder="(空)"
                className={inputCls + ' resize-y font-mono text-xs'}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
