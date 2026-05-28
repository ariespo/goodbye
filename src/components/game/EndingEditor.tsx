import { useState, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { X, Plus, Trash, Copy } from '@phosphor-icons/react';
import type { Ending, EndingConditionGroup, TruthType, EndingTag } from '../../sillytavern/types';

const PANEL_BG = 'rgba(12, 12, 16, 0.96)';
const BORDER = '#3a3a42';
const BORDER_BRIGHT = '#52525c';
const CORNER = '#5a5a64';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#7a756e';
const ACCENT = '#6b8fc4';
const ACCENT_BG = 'rgba(107, 143, 196, 0.15)';

const TRUTH_LABELS: Record<TruthType, string> = {
  A: 'A-自刃者',
  B: 'B-梦觉',
  C: 'C-深渊',
  D: 'D-等价交换',
  E: 'E-观测者',
};

const TRUTH_COLORS: Record<TruthType, string> = {
  A: '#8b7a6a',
  B: '#6a8b7a',
  C: '#8b6a7a',
  D: '#7a7a8b',
  E: '#a08a6a',
};

const TAG_LABELS: Record<EndingTag, string> = {
  normal: '普通',
  good: '好结局',
  bad: '坏结局',
  true: '真结局',
  hidden: '隐藏',
};

const TAG_COLORS: Record<EndingTag, string> = {
  normal: '#6b8fc4',
  good: '#6ab48a',
  bad: '#c46b6b',
  true: '#c4a86b',
  hidden: '#8b6ac4',
};

const VARIABLE_OPTIONS = [
  { label: '轮回次数', value: 'cycleCount' },
  { label: '文穂好感度', value: 'affinity.fumi' },
  { label: '灯织好感度', value: 'affinity.touko' },
  { label: '时坂好感度', value: 'affinity.saku' },
  { label: '自疑度', value: 'suspicion.self' },
  { label: '疑文穂度', value: 'suspicion.fumi' },
  { label: '疑灯织度', value: 'suspicion.touko' },
  { label: '疑超自然度', value: 'suspicion.occult' },
  { label: '心理方向', value: 'investigation.psych' },
  { label: '犯罪方向', value: 'investigation.crime' },
  { label: '超自然方向', value: 'investigation.occult' },
  { label: '科学方向', value: 'investigation.science' },
];

const OPERATOR_OPTIONS = [
  { label: '>=', value: '>=' },
  { label: '<=', value: '<=' },
  { label: '>', value: '>' },
  { label: '<', value: '<' },
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
];

/** 生成唯一ID */
function uid(prefix = '') {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function EndingEditor() {
  const endings = useGameStore(state => state.game.endings);
  const endingsSeen = useGameStore(state => state.game.endingsSeen);
  const showPanel = useGameStore(state => state.ui.showEndingEditor);
  const { addEnding, removeEnding, updateEnding, setShowEndingEditor } = useGameStore(state => state.actions);
  const [selectedId, setSelectedId] = useState<string | null>(endings[0]?.id ?? null);

  const selected = endings.find(e => e.id === selectedId) ?? null;

  const handleAddEnding = useCallback(() => {
    const newEnding: Ending = {
      id: uid('end-'),
      name: '新结局',
      truthType: 'A',
      tag: 'normal',
      description: '',
      conditionGroups: [
        {
          id: uid('cg-'),
          name: '条件组1',
          mode: 'all',
          conditions: [
            { variablePath: 'cycleCount', operator: '>=', targetValue: 1 },
          ],
        },
      ],
      isUnlocked: false,
      order: endings.length * 10,
    };
    addEnding(newEnding);
    setSelectedId(newEnding.id);
  }, [endings.length, addEnding]);

  const handleCloneEnding = useCallback((ending: Ending) => {
    const cloned: Ending = {
      ...ending,
      id: uid('end-'),
      name: `${ending.name} (复制)`,
      isUnlocked: false,
      order: endings.length * 10,
    };
    addEnding(cloned);
    setSelectedId(cloned.id);
  }, [endings.length, addEnding]);

  const patchSelected = useCallback((patch: Partial<Ending>) => {
    if (!selected) return;
    updateEnding(selected.id, patch);
  }, [selected, updateEnding]);

  if (!showPanel) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={() => setShowEndingEditor(false)}
    >
      <div
        className="relative flex select-none"
        style={{
          width: 'min(95vw, 1200px)',
          height: 'min(90vh, 700px)',
          background: PANEL_BG,
          border: `3px solid ${BORDER}`,
          boxShadow:
            `inset 2px 2px 0 ${BORDER_BRIGHT},` +
            `inset -2px -2px 0 rgba(0,0,0,0.5),` +
            `4px 4px 0 rgba(0,0,0,0.6),` +
            `5px 5px 0 rgba(0,0,0,0.4),` +
            `6px 6px 0 rgba(0,0,0,0.2)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 左侧列表 */}
        <div
          className="flex flex-col"
          style={{ width: 280, borderRight: `2px solid ${BORDER}`, background: 'rgba(8,8,12,0.5)' }}
        >
          {/* 标题栏 */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `2px solid ${BORDER}` }}
          >
            <span style={{ fontSize: '18px', color: ACCENT, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.15em' }}>
              结局列表
            </span>
            <button
              onClick={() => setShowEndingEditor(false)}
              className="flex items-center justify-center transition-colors"
              style={{ width: 24, height: 24, border: `2px solid ${BORDER}`, color: TEXT_DIM, background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_DIM; }}
            >
              <X size={14} />
            </button>
          </div>

          {/* 添加按钮 */}
          <div className="p-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <PixelButtonSmall
              onClick={handleAddEnding}
              label="添加结局"
              icon={<Plus size={14} />}
            />
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {(['A', 'B', 'C', 'D', 'E'] as TruthType[]).map(truth => {
              const group = endings.filter(e => e.truthType === truth).sort((a, b) => a.order - b.order);
              if (group.length === 0) return null;
              return (
                <div key={truth} className="mb-3">
                  <div
                    className="px-2 py-1 mb-1"
                    style={{
                      fontSize: '13px',
                      color: TRUTH_COLORS[truth],
                      fontFamily: '"MuzaiPixel", monospace',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {TRUTH_LABELS[truth]}
                  </div>
                  {group.map(ending => {
                    const isSelected = ending.id === selectedId;
                    const isSeen = endingsSeen.includes(ending.id);
                    return (
                      <button
                        key={ending.id}
                        className="w-full text-left transition-all duration-150 relative"
                        style={{
                          background: isSelected ? ACCENT_BG : 'transparent',
                          border: `2px solid ${isSelected ? ACCENT : BORDER}`,
                          padding: '8px 10px',
                          marginBottom: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedId(ending.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span style={{ fontSize: '15px', color: TEXT_MAIN, fontFamily: '"MuzaiPixel", serif' }}>
                            {ending.name}
                          </span>
                          <div className="flex items-center gap-1">
                            {isSeen && <span style={{ fontSize: '11px', color: '#6ab48a' }}>✓</span>}
                            <span
                              style={{
                                fontSize: '11px',
                                color: TAG_COLORS[ending.tag],
                                fontFamily: '"MuzaiPixel", monospace',
                              }}
                            >
                              {TAG_LABELS[ending.tag]}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧编辑器 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selected ? (
            <>
              {/* 工具栏 */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: `2px solid ${BORDER}` }}
              >
                <span style={{ fontSize: '18px', color: TEXT_MAIN, fontFamily: '"MuzaiPixel", serif' }}>
                  {selected.name}
                </span>
                <div className="flex items-center gap-2">
                  <PixelIconBtn onClick={() => handleCloneEnding(selected)} icon={<Copy size={14} />} title="复制" />
                  <PixelIconBtn onClick={() => { removeEnding(selected.id); setSelectedId(null); }} icon={<Trash size={14} />} title="删除" />
                </div>
              </div>

              {/* 滚动内容 */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* 基本信息 */}
                <Section title="基本信息">
                  <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <PixelField label="结局名称">
                      <PixelInput
                        value={selected.name}
                        onChange={(v) => patchSelected({ name: v })}
                      />
                    </PixelField>
                    <PixelField label="真相线">
                      <PixelSelect
                        value={selected.truthType}
                        options={Object.entries(TRUTH_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                        onChange={(v) => patchSelected({ truthType: v as TruthType })}
                      />
                    </PixelField>
                    <PixelField label="结局标签">
                      <PixelSelect
                        value={selected.tag}
                        options={Object.entries(TAG_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                        onChange={(v) => patchSelected({ tag: v as EndingTag })}
                      />
                    </PixelField>
                    <PixelField label="排序权重">
                      <PixelInput
                        type="number"
                        value={String(selected.order)}
                        onChange={(v) => patchSelected({ order: parseInt(v, 10) || 0 })}
                      />
                    </PixelField>
                  </div>
                  <PixelField label="结局描述">
                    <PixelTextArea
                      value={selected.description}
                      onChange={(v) => patchSelected({ description: v })}
                      rows={3}
                    />
                  </PixelField>
                </Section>

                {/* 条件组 */}
                <Section title="触发条件">
                  <div className="space-y-3">
                    {selected.conditionGroups.map((cg, cgIdx) => (
                      <ConditionGroupEditor
                        key={cg.id}
                        group={cg}
                        index={cgIdx}
                        onChange={(next) => {
                          const nextGroups = [...selected.conditionGroups];
                          nextGroups[cgIdx] = next;
                          patchSelected({ conditionGroups: nextGroups });
                        }}
                        onDelete={() => {
                          const nextGroups = selected.conditionGroups.filter((_, i) => i !== cgIdx);
                          patchSelected({ conditionGroups: nextGroups });
                        }}
                      />
                    ))}
                    <PixelButtonSmall
                      onClick={() => {
                        patchSelected({
                          conditionGroups: [
                            ...selected.conditionGroups,
                            { id: uid('cg-'), name: `条件组${selected.conditionGroups.length + 1}`, mode: 'all', conditions: [] },
                          ],
                        });
                      }}
                      label="添加条件组"
                      icon={<Plus size={14} />}
                    />
                  </div>
                </Section>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span style={{ fontSize: '18px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", serif' }}>
                选择左侧结局进行编辑
              </span>
            </div>
          )}
        </div>

        {/* 四角装饰 */}
        <CornerDecorations />
      </div>
    </div>
  );
}

/* ── 条件组编辑器 ── */

function ConditionGroupEditor({
  group, index, onChange, onDelete,
}: {
  group: EndingConditionGroup;
  index: number;
  onChange: (next: EndingConditionGroup) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ border: `2px solid ${BORDER}`, background: 'rgba(20,20,28,0.5)', padding: '10px 12px' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '14px', color: ACCENT, fontFamily: '"MuzaiPixel", monospace' }}>
            条件组 {index + 1}
          </span>
          <PixelSelect
            value={group.mode}
            options={[{ value: 'all', label: '全部满足' }, { value: 'any', label: '任一满足' }]}
            onChange={(v) => onChange({ ...group, mode: v as 'all' | 'any' })}
            small
          />
        </div>
        <button
          onClick={onDelete}
          className="flex items-center justify-center transition-colors"
          style={{ width: 22, height: 22, border: `2px solid ${BORDER}`, color: TEXT_DIM, background: 'transparent' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c46b6b'; e.currentTarget.style.color = '#c46b6b'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_DIM; }}
        >
          <Trash size={12} />
        </button>
      </div>

      <div className="space-y-1.5">
        {group.conditions.map((cond, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <PixelSelect
              value={cond.variablePath}
              options={VARIABLE_OPTIONS}
              onChange={(v) => {
                const next = [...group.conditions];
                next[ci] = { ...cond, variablePath: v };
                onChange({ ...group, conditions: next });
              }}
              small
              style={{ minWidth: 130 }}
            />
            <PixelSelect
              value={cond.operator}
              options={OPERATOR_OPTIONS}
              onChange={(v) => {
                const next = [...group.conditions];
                next[ci] = { ...cond, operator: v as any };
                onChange({ ...group, conditions: next });
              }}
              small
              style={{ minWidth: 60 }}
            />
            <PixelInput
              value={String(cond.targetValue)}
              onChange={(v) => {
                const next = [...group.conditions];
                const num = parseFloat(v);
                next[ci] = { ...cond, targetValue: isNaN(num) ? v : num };
                onChange({ ...group, conditions: next });
              }}
              small
              style={{ width: 80 }}
            />
            <button
              onClick={() => {
                const next = group.conditions.filter((_, i) => i !== ci);
                onChange({ ...group, conditions: next });
              }}
              className="flex items-center justify-center"
              style={{ width: 20, height: 20, border: `2px solid ${BORDER}`, color: TEXT_DIM, background: 'transparent' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c46b6b'; e.currentTarget.style.color = '#c46b6b'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = TEXT_DIM; }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <PixelButtonSmall
          onClick={() => {
            onChange({
              ...group,
              conditions: [...group.conditions, { variablePath: 'cycleCount', operator: '>=', targetValue: 1 }],
            });
          }}
          label="添加条件"
          icon={<Plus size={12} />}
        />
      </div>
    </div>
  );
}

/* ── 通用 UI 组件 ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-3"
        style={{
          fontSize: '15px',
          color: ACCENT,
          fontFamily: '"MuzaiPixel", monospace',
          letterSpacing: '0.12em',
          borderBottom: `1px solid ${BORDER}`,
          paddingBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function PixelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '13px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function PixelInput({
  value, onChange, type = 'text', small, style: extraStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full outline-none"
      style={{
        background: 'rgba(20,20,28,0.6)',
        border: `2px solid ${BORDER}`,
        padding: small ? '4px 8px' : '6px 10px',
        fontSize: small ? '13px' : '15px',
        color: TEXT_MAIN,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
        ...extraStyle,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
    />
  );
}

function PixelTextArea({
  value, onChange, rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full outline-none resize-none"
      style={{
        background: 'rgba(20,20,28,0.6)',
        border: `2px solid ${BORDER}`,
        padding: '6px 10px',
        fontSize: '14px',
        lineHeight: 1.6,
        color: TEXT_MAIN,
        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
    />
  );
}

function PixelSelect({
  value, options, onChange, small, style: extraStyle,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="outline-none cursor-pointer"
      style={{
        background: 'rgba(20,20,28,0.6)',
        border: `2px solid ${BORDER}`,
        padding: small ? '4px 8px' : '6px 10px',
        fontSize: small ? '13px' : '15px',
        color: TEXT_MAIN,
        fontFamily: '"MuzaiPixel", monospace',
        ...extraStyle,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = BORDER; }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function PixelButtonSmall({ onClick, label, icon }: { onClick: () => void; label: string; icon?: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 transition-all"
      style={{
        background: hovered ? ACCENT_BG : 'rgba(20,20,28,0.6)',
        border: `2px solid ${hovered ? ACCENT : BORDER}`,
        color: hovered ? ACCENT : TEXT_DIM,
        fontSize: '13px',
        fontFamily: '"MuzaiPixel", monospace',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon}
      {label}
    </button>
  );
}

function PixelIconBtn({ onClick, icon, title }: { onClick: () => void; icon: React.ReactNode; title?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-8 h-8 transition-all"
      style={{
        background: hovered ? 'rgba(107,143,196,0.12)' : 'transparent',
        border: `2px solid ${hovered ? ACCENT : BORDER}`,
        color: hovered ? ACCENT : TEXT_DIM,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon}
    </button>
  );
}

function CornerDecorations() {
  return (
    <>
      <div style={{ position: 'absolute', top: -4, left: -4, width: 10, height: 3, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -4, left: -4, width: 3, height: 10, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 3, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -4, right: -2, width: 3, height: 10, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -4, left: -4, width: 10, height: 3, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -2, left: -4, width: 3, height: 10, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 3, background: CORNER, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 3, height: 10, background: CORNER, pointerEvents: 'none' }} />
    </>
  );
}
