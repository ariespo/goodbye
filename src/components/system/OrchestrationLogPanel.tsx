import { useState, useSyncExternalStore } from 'react';
import { useGameStore } from '../../stores/gameStore';
import {
  clearOrchestrationLog,
  getOrchestrationLog,
  getOrchestrationLogCapacity,
  subscribeOrchestrationLog,
  type OrchestrationLogEntry,
} from '../../agents/mystery';
import { GameIcon } from '../ui/GameIcon';

const OUTCOME_STYLES: Record<OrchestrationLogEntry['outcome'], { label: string; className: string }> = {
  success: { label: '成功', className: 'bg-green-400/10 text-green-400 border-green-400/20' },
  blocked: { label: '安全闸拦截', className: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  error: { label: '失败', className: 'bg-red-400/10 text-red-400 border-red-400/20' },
};

const STAGE_LABELS: Record<string, string> = {
  director: '导演计划',
  'hard-review': '硬审查',
  'director-repair': '导演修复',
  'hard-review-retry': '硬审查(重试)',
  'semantic-review': '语义审查',
  'pacing-review': '节奏审查',
};

export function OrchestrationLogPanel() {
  const show = useGameStore(state => state.ui.showOrchestrationLog);
  const setShow = useGameStore(state => state.actions.setShowOrchestrationLog);
  const entries = useSyncExternalStore(subscribeOrchestrationLog, getOrchestrationLog, getOrchestrationLog);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!show) return null;

  const toggle = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const ordered = [...entries].reverse();

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={() => setShow(false)}
    >
      <div
        className="w-[900px] max-h-[90vh] bg-bg-primary border border-border-subtle flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 16px 48px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-serif-cn text-text-primary">编排日志</h2>
            <span className="px-1.5 py-0.5 text-[10px] text-text-muted bg-bg-secondary border border-border-subtle">
              最近 {entries.length} / {getOrchestrationLogCapacity()} 回合
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => clearOrchestrationLog()}
              className="px-2 py-1 text-[11px] text-text-muted border border-border-subtle hover:text-text-primary transition-colors"
            >
              清空
            </button>
            <button
              onClick={() => setShow(false)}
              className="pixel-close-button flex h-9 w-9 items-center justify-center"
            >
              <GameIcon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 pixel-scroll-blue overflow-y-auto p-4 space-y-2">
          {ordered.length === 0 && (
            <div className="text-sm text-text-muted text-center py-8">尚无编排记录，进行一个回合后再来查看</div>
          )}
          {ordered.map(entry => (
            <EntryRow key={entry.id} entry={entry} expanded={expandedIds.has(entry.id)} toggle={() => toggle(entry.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryRow({ entry, expanded, toggle }: {
  entry: OrchestrationLogEntry;
  expanded: boolean;
  toggle: () => void;
}) {
  const outcome = OUTCOME_STYLES[entry.outcome];
  const time = new Date(entry.timestamp).toLocaleTimeString();

  return (
    <div className="border border-border-subtle overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-bg-secondary/40 hover:bg-bg-secondary/60 transition-colors"
      >
        <span className="text-[10px] text-text-muted shrink-0">{time}</span>
        <span className={`text-[9px] px-1 py-0.5 border shrink-0 ${outcome.className}`}>{outcome.label}</span>
        {entry.speculative && (
          <span className="text-[9px] px-1 py-0.5 bg-accent-blue/10 text-accent-blue border border-accent-blue/20 shrink-0">预规划</span>
        )}
        <span className="text-[11px] text-text-primary truncate flex-1">
          {entry.playerInput || entry.directorPlan?.turnGoal || '(无输入记录)'}
        </span>
        <span className="text-[10px] text-text-muted shrink-0">{entry.mode}</span>
        <span className="text-[10px] text-text-muted shrink-0">{entry.model}</span>
        <span className="text-[10px] text-text-muted shrink-0">{entry.totalDurationMs}ms</span>
        <span className="text-text-muted shrink-0">{expanded ? <GameIcon name="close" size={12} /> : <GameIcon name="observe" size={12} />}</span>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2 bg-bg-primary">
          <div className="flex flex-wrap gap-2 text-[10px] text-text-muted">
            <span>导演尝试: {entry.directorAttempts}</span>
            <span>结构化输出: {entry.structuredOutput ? '是' : '否(已降级)'}</span>
            <span>硬审查: {entry.hardReview ? (entry.hardReview.approved ? '通过' : `${entry.hardReview.violations.length} 项违规`) : '未执行'}</span>
            <span>语义审查: {entry.semanticReview ? (entry.semanticReview.approved ? '通过' : '未通过') : '未执行'}</span>
            <span>节奏审查: {entry.pacingReview ? (entry.pacingReview.approved ? '通过' : '未通过') : '未执行'}</span>
          </div>

          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-widest">阶段耗时</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.stages.map((stage, i) => (
                <span key={i} className="px-1.5 py-0.5 text-[10px] text-text-primary bg-bg-secondary border border-border-subtle">
                  {STAGE_LABELS[stage.stage] ?? stage.stage}: {stage.durationMs}ms
                </span>
              ))}
            </div>
          </div>

          {entry.error && (
            <div>
              <label className="text-[10px] text-red-400 uppercase tracking-widest">错误</label>
              <pre className="mt-1 p-2 bg-bg-secondary border border-red-400/20 text-[11px] text-red-400 font-mono whitespace-pre-wrap break-all">
                {entry.error}
              </pre>
            </div>
          )}

          {entry.directorPlan && (
            <JsonBlock label="导演计划" value={entry.directorPlan} />
          )}
          {entry.hardReview && !entry.hardReview.approved && (
            <JsonBlock label="硬审查违规" value={entry.hardReview.violations} />
          )}
          {entry.semanticReview && (
            <JsonBlock label="语义审查结果" value={entry.semanticReview} />
          )}
          {entry.pacingReview && (
            <JsonBlock label="节奏审查结果" value={entry.pacingReview} />
          )}
        </div>
      )}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <label className="text-[10px] text-text-muted uppercase tracking-widest">{label}</label>
      <pre className="mt-1 p-2 bg-bg-secondary border border-border-subtle text-[11px] text-text-primary font-mono whitespace-pre-wrap break-all max-h-[240px] pixel-scroll-blue overflow-y-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
