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
import {
  clearTurnMetrics, getTurnMetrics, subscribeTurnMetrics, TURN_METRICS_CAPACITY,
  summarizeTurnCosts, type TurnMetricsEntry, type TurnMetricStage, type TurnUsageSummary,
} from '../../agents/mystery/turn-metrics';

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

const TURN_STAGE_LABELS: Record<TurnMetricStage, string> = {
  preparation: '计划与前置审查', writer: '正文生成', 'fact-review': '正文事实审查',
  'style-review': '风格审查', repair: '修复', state: '状态结算', persistence: '保存',
  commit: '提交', protocol: '格式校验',
};

export function OrchestrationLogPanel() {
  const show = useGameStore(state => state.ui.showOrchestrationLog);
  const setShow = useGameStore(state => state.actions.setShowOrchestrationLog);
  const entries = useSyncExternalStore(subscribeOrchestrationLog, getOrchestrationLog, getOrchestrationLog);
  const turns = useSyncExternalStore(subscribeTurnMetrics, getTurnMetrics, getTurnMetrics);
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
        className="w-[900px] max-w-[calc(100vw-16px)] max-h-[90vh] bg-bg-primary border border-border-subtle flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 16px 48px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-serif-cn text-text-primary">编排日志</h2>
            <span className="px-1.5 py-0.5 text-[10px] text-text-muted bg-bg-secondary border border-border-subtle">
              完整回合 {turns.length} / {TURN_METRICS_CAPACITY}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { clearOrchestrationLog(); clearTurnMetrics(); }}
              className="px-2 py-1 text-[11px] text-text-muted border border-border-subtle hover:text-text-primary transition-colors"
            >
              清空
            </button>
            <button
              onClick={() => setShow(false)}
              aria-label="关闭编排日志"
              className="pixel-close-button flex h-11 w-11 items-center justify-center"
            >
              <GameIcon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 pixel-scroll-blue overflow-y-auto p-4 space-y-2">
          <h3 className="text-xs text-text-primary">完整回合耗时</h3>
          <p className="text-[10px] text-text-muted">总耗时按实际经过时间计量；并行阶段不相加。首 token 是模型开始返回正文，可游玩是审查与结算后呈现场景。</p>
          <WindowCosts turns={turns} />
          {turns.length === 0 && <div className="text-xs text-text-muted py-3">尚无完整回合记录</div>}
          {[...turns].reverse().map(entry => <TurnTimingRow key={entry.id} entry={entry} />)}
          <h3 className="text-xs text-text-primary pt-4">准备阶段日志（{entries.length} / {getOrchestrationLogCapacity()}）</h3>
          <p className="text-[10px] text-text-muted">仅含导演计划与前置审查，也可能来自预规划，不代表完整回合。</p>
          {ordered.length === 0 && (
            <div className="text-xs text-text-muted text-center py-3">尚无准备阶段记录</div>
          )}
          {ordered.map(entry => (
            <EntryRow key={entry.id} entry={entry} expanded={expandedIds.has(entry.id)} toggle={() => toggle(entry.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TurnTimingRow({ entry }: { entry: TurnMetricsEntry }) {
  const outcome = { success: '成功', failed: '失败', cancelled: '已取消' }[entry.outcome];
  const duration = (value: number | null) => value === null ? '未到达' : `${value}ms`;
  return (
    <div className="border border-border-subtle p-3 space-y-2 bg-bg-secondary/40">
      <div className="flex flex-wrap gap-3 text-[11px] text-text-primary">
        <span>{new Date(entry.startedAt).toLocaleTimeString()}</span>
        <span>{outcome}</span>
        <span>{`总耗时: ${entry.totalMs}ms`}</span>
        <span>{`首 token: ${duration(entry.firstTokenMs)}`}</span>
        <span>{`可游玩: ${duration(entry.playableMs)}`}</span>
      </div>
      {!entry.accounting?.measured ? <p className="text-[10px] text-text-muted">用量与费用：未计量</p> : <div className="space-y-2 text-[10px] text-text-muted">
        {entry.accounting.preparationReused && <p>已复用准备结果；原调用计入其发起回合，未重复收费。</p>}
        <UsageRow label="前台" summary={entry.accounting.purposes.foreground} />
        <UsageRow label="后台清单" summary={entry.accounting.purposes.checklist} />
        <UsageRow label="预规划" summary={entry.accounting.purposes.preplan} />
      </div>}
      <div className="flex flex-wrap gap-1 text-[10px] text-text-muted">
        {entry.stages.map((stage, index) => (
          <span key={index} className="px-1.5 py-0.5 bg-bg-secondary border border-border-subtle">
            {TURN_STAGE_LABELS[stage.name]}: {stage.durationMs}ms
          </span>
        ))}
      </div>
    </div>
  );
}

const money = (currency: string, amount: number) => `${currency} ${amount.toLocaleString(undefined, { maximumSignificantDigits: 5 })}`;

function WindowCosts({ turns }: { turns: readonly TurnMetricsEntry[] }) {
  const summary = summarizeTurnCosts(turns);
  return <div className="border border-border-subtle p-3 space-y-1 text-[11px] text-text-primary">
    <p>窗口费用估算 · 成功 {summary.successes} / {turns.length} 回合 · {summary.complete ? '用量与价格齐全' : '统计不完整'}</p>
    <p className="text-[10px] text-text-muted">包含失败、取消和后台开销，币种分别统计。未结算请求和缺失用量或价格会使估算不完整；每成功回合费用不是服务商账单。</p>
    {summary.costs.length === 0 ? <p>窗口总费用 / 每成功回合：{summary.complete ? '无请求' : '未知'}</p> : summary.costs.map(cost => <p key={cost.currency}>
      {summary.complete ? '估算总费用' : '已知部分费用'}：{money(cost.currency, cost.amount)} · 每成功回合：{cost.perSuccess === null ? '暂无成功回合' : money(cost.currency, cost.perSuccess)}
    </p>)}
  </div>;
}

function UsageRow({ label, summary }: { label: string; summary: TurnUsageSummary }) {
  const repairs = Object.values(summary.repairs).reduce((total, count) => total + count, 0);
  if (label !== '前台' && !summary.requests && !summary.pendingRequests && !repairs) return null;
  const completeUsage = summary.requests === summary.usageCompleteRequests && summary.pendingRequests === 0;
  const completeCost = summary.requests === summary.costCompleteRequests && summary.pendingRequests === 0;
  const tokens = (value: number, measuredRequests: number) => {
    const requests = summary.requests + summary.pendingRequests;
    if (!measuredRequests && requests) return '未知';
    return measuredRequests === requests ? value : `${value}（部分）`;
  };
  return <div className="space-y-1">
    <p>{label}：{summary.requests} 次请求 · 失败 {summary.failedRequests} · 传输重试 {summary.retries} · 格式兼容重试 {summary.formatFallbacks}
      {summary.pendingRequests > 0 && ` · 未结算 ${summary.pendingRequests} 次`}</p>
    <p>{completeUsage ? 'token' : '已知 token（用量不完整）'}：输入 {tokens(summary.inputTokens, summary.inputUsageRequests)} / 输出 {tokens(summary.outputTokens, summary.outputUsageRequests)} / 缓存输入 {tokens(summary.cachedInputTokens, summary.cachedUsageRequests)}
      {` · 用量覆盖 ${summary.usageCompleteRequests}/${summary.requests + summary.pendingRequests}`}</p>
    <p>修复 {repairs} 次：结构化 {summary.repairs.structured} / 导演 {summary.repairs.director} / 正文 {summary.repairs.narrative} / 协议 {summary.repairs.protocol}</p>
    <p>{completeCost ? '估算费用' : '费用估算（不完整）'}：{summary.costs.length ? summary.costs.map(cost => money(cost.currency, cost.amount)).join(' + ') : summary.requests || summary.pendingRequests ? '未知' : '无请求'}</p>
  </div>;
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
