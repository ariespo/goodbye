import { useState, useEffect } from 'react';
import type { LorebookEntry } from '../../sillytavern/types';
import { CaretDown, CaretRight } from '@phosphor-icons/react';

interface Props {
  entry: LorebookEntry;
  onChange: (next: LorebookEntry) => void;
  onDelete: () => void;
}

const POSITION_LABELS: Record<LorebookEntry['position'], string> = {
  before_char: '角色描述前',
  after_char: '角色描述后',
  before_example: '示例对话前',
  after_example: '示例对话后',
  at_depth: '深度插入',
  example_msg_top: '示例消息顶',
  example_msg_bottom: '示例消息底',
  outlet: 'Outlet',
};

const LOGIC_LABELS: Record<LorebookEntry['selectiveLogic'], string> = {
  and_any: 'AND ANY (任一即触发)',
  and_all: 'AND ALL (全部都需要)',
  not_any: 'NOT ANY (一个都不能有)',
  not_all: 'NOT ALL (不能全部都有)',
};

export function LorebookEntryEditor({ entry, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(entry);

  useEffect(() => { setLocal(entry); }, [entry.id]);

  function patch(p: Partial<LorebookEntry>) {
    const next = { ...local, ...p };
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="border border-border-subtle bg-bg-secondary">
      {/* 头部:折叠开关 / 启用复选 / 注释 / 关键词预览 / 删除 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-text-muted hover:text-text-primary"
        >
          {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
        </button>
        <input
          type="checkbox"
          checked={local.enabled !== false}
          onChange={e => patch({ enabled: e.target.checked })}
          className="accent-accent-blue"
        />
        <input
          type="text"
          value={local.comment ?? ''}
          onChange={e => patch({ comment: e.target.value })}
          placeholder="注释"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
        />
        <span className="text-xs text-text-muted truncate max-w-[180px]" title={local.keys.join(', ')}>
          {local.keys.length ? local.keys.join(', ') : '<无关键词>'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-text-muted hover:text-danger text-xs"
        >
          删除
        </button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* 关键词 */}
          <Field label="主关键词 (逗号分隔)">
            <input
              type="text"
              value={local.keys.join(', ')}
              onChange={e => patch({ keys: parseCsv(e.target.value) })}
              className={inputCls}
              placeholder="少女, 女孩"
            />
          </Field>

          <Field label="内容">
            <textarea
              value={local.content}
              onChange={e => patch({ content: e.target.value })}
              rows={5}
              className={inputCls + ' resize-y font-mono text-xs'}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="位置">
              <select
                value={local.position}
                onChange={e => patch({ position: e.target.value as LorebookEntry['position'] })}
                className={inputCls}
              >
                {Object.entries(POSITION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>

            <Field label="顺序 (越小越靠前)">
              <input
                type="number"
                value={local.order}
                onChange={e => patch({ order: Number(e.target.value) || 0 })}
                className={inputCls}
              />
            </Field>

            <Field label="概率 (0-100)">
              <input
                type="number"
                min={0}
                max={100}
                value={local.probability}
                onChange={e => patch({ probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Toggle label="常驻 (Constant)" checked={local.constant} onChange={v => patch({ constant: v })} />
            <Toggle label="启用次关键词 (Selective)" checked={local.selective} onChange={v => patch({ selective: v })} />
            <Toggle label="启用概率" checked={local.useProbability ?? false} onChange={v => patch({ useProbability: v })} />
          </div>

          {local.selective && (
            <>
              <Field label="次关键词">
                <input
                  type="text"
                  value={local.secondaryKeys.join(', ')}
                  onChange={e => patch({ secondaryKeys: parseCsv(e.target.value) })}
                  className={inputCls}
                  placeholder="次关键词,逗号分隔"
                />
              </Field>
              <Field label="逻辑">
                <select
                  value={local.selectiveLogic}
                  onChange={e => patch({ selectiveLogic: e.target.value as LorebookEntry['selectiveLogic'] })}
                  className={inputCls}
                >
                  {Object.entries(LOGIC_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Toggle label="区分大小写" checked={local.caseSensitive ?? false} onChange={v => patch({ caseSensitive: v })} />
            <Toggle label="整词匹配" checked={local.matchWholeWords ?? false} onChange={v => patch({ matchWholeWords: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Toggle label="不参与递归扫描" checked={local.excludeRecursion ?? false} onChange={v => patch({ excludeRecursion: v })} />
            <Toggle label="阻止递归触发其他条目" checked={local.preventRecursion ?? false} onChange={v => patch({ preventRecursion: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1">{label}</div>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs text-text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-accent-blue"
      />
      <span>{label}</span>
    </label>
  );
}

const inputCls = 'w-full px-2 py-1 bg-bg-primary border border-border-subtle text-text-primary text-xs focus:border-accent-blue focus:outline-none transition-colors';

function parseCsv(s: string): string[] {
  return s.split(/[,，]/).map(x => x.trim()).filter(Boolean);
}
