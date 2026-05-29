import { useState, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { inspectPrompt } from '../../sillytavern/prompt-assembler';
import type { PromptInspectionResult, PromptOrderInspectItem } from '../../sillytavern/prompt-assembler';
import { X, Eye, EyeSlash, BookOpen, ChatText, ListDashes, CheckCircle, XCircle, Minus } from '@phosphor-icons/react';

type TabKey = 'order' | 'lorebook' | 'history' | 'final';

export function PromptInspector() {
  const show = useGameStore(state => state.ui.showPromptInspector);
  const setShow = useGameStore(state => state.actions.setShowPromptInspector);
  const store = useGameStore();

  const [activeTab, setActiveTab] = useState<TabKey>('order');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const data = useMemo(() => {
    if (!show) return null;
    const { tavern } = store;
    const settings = tavern.settings;
    if (!settings) return null;

    const activeChat = tavern.chats.find(c => c.id === tavern.activeChatId);
    const lastUserMsg = activeChat?.messages.slice().reverse().find(m => m.role === 'user');
    const userInput = lastUserMsg?.content || '';

    return inspectPrompt({
      userInput,
      history: activeChat?.messages || [],
      preset: tavern.presets.find(p => p.id === settings.activePresetId) || null,
      lorebooks: tavern.lorebooks,
      activeLorebookIds: settings.activeLorebookIds,
      userName: settings.userName,
      characterName: settings.characterName,
      variables: tavern.variables,
      formatPrompt: settings.formatPromptTemplate,
    });
  }, [show, store]);

  if (!show || !data) return null;

  const toggleItem = (idx: number) => {
    const next = new Set(expandedItems);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedItems(next);
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'order', label: 'Prompt 结构', icon: <ListDashes size={14} /> },
    { key: 'lorebook', label: '世界书', icon: <BookOpen size={14} /> },
    { key: 'history', label: '历史消息', icon: <ChatText size={14} /> },
    { key: 'final', label: '最终消息', icon: <Eye size={14} /> },
  ];

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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-serif-cn text-text-primary">提示词查看器</h2>
            <div className="flex items-center gap-1 text-[10px] text-text-muted">
              <span className="px-1.5 py-0.5 bg-bg-secondary border border-border-subtle">总 Token: {data.stats.totalTokens}</span>
              <span className="px-1.5 py-0.5 bg-bg-secondary border border-border-subtle">系统: {data.stats.systemTokens}</span>
              <span className="px-1.5 py-0.5 bg-bg-secondary border border-border-subtle">历史: {data.stats.historyTokens}</span>
              <span className="px-1.5 py-0.5 bg-bg-secondary border border-border-subtle">输入: {data.stats.userInputTokens}</span>
            </div>
          </div>
          <button
            onClick={() => setShow(false)}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-subtle shrink-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs transition-colors ${
                activeTab === t.key
                  ? 'text-accent-blue border-b border-accent-blue bg-accent-blue/5'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'order' && <OrderTab data={data} expanded={expandedItems} toggle={toggleItem} />}
          {activeTab === 'lorebook' && <LorebookTab data={data} />}
          {activeTab === 'history' && <HistoryTab data={data} />}
          {activeTab === 'final' && <FinalTab data={data} />}
        </div>
      </div>
    </div>
  );
}

// ============ Order Tab ============

function OrderTab({ data, expanded, toggle }: {
  data: PromptInspectionResult;
  expanded: Set<number>;
  toggle: (idx: number) => void;
}) {
  const enabledCount = data.orderItems.filter(i => !i.skipped).length;
  const skippedCount = data.orderItems.filter(i => i.skipped).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1"><CheckCircle size={11} className="text-green-400" /> 生效: {enabledCount}</span>
        <span className="flex items-center gap-1"><XCircle size={11} className="text-red-400" /> 跳过: {skippedCount}</span>
      </div>

      <div className="space-y-1">
        {data.orderItems.map((item, idx) => (
          <OrderItemRow key={idx} item={item} idx={idx} expanded={expanded.has(idx)} toggle={() => toggle(idx)} />
        ))}
      </div>
    </div>
  );
}

function OrderItemRow({ item, idx, expanded, toggle }: {
  item: PromptOrderInspectItem;
  idx: number;
  expanded: boolean;
  toggle: () => void;
}) {
  const isSkipped = item.skipped;
  const hasContent = !!item.finalContent;

  return (
    <div className={`border ${isSkipped ? 'border-border-subtle/40' : 'border-border-subtle'} overflow-hidden`}>
      <button
        onClick={toggle}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
          isSkipped ? 'bg-bg-secondary/30' : 'bg-bg-secondary/60 hover:bg-bg-secondary'
        }`}
      >
        <span className="text-[10px] text-text-muted w-5">{idx + 1}</span>
        <span className={`text-xs ${isSkipped ? 'text-text-muted/60' : 'text-text-primary'}`}>
          {item.name}
        </span>
        {item.marker && <span className="text-[9px] px-1 py-0.5 bg-accent-blue/10 text-accent-blue border border-accent-blue/20">marker</span>}
        {!item.enabled && <span className="text-[9px] px-1 py-0.5 bg-red-400/10 text-red-400 border border-red-400/20">已禁用</span>}
        {isSkipped && item.enabled && <span className="text-[9px] px-1 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{item.skipReason}</span>}
        {!isSkipped && <span className="text-[9px] px-1 py-0.5 bg-green-400/10 text-green-400 border border-green-400/20">生效</span>}
        <span className="ml-auto text-text-muted">{expanded ? <EyeSlash size={12} /> : <Eye size={12} />}</span>
      </button>

      {expanded && (
        <div className="px-3 py-2 space-y-2 bg-bg-primary">
          <div className="flex gap-2 text-[10px]">
            <span className="text-text-muted">标识: {item.identifier}</span>
            <span className="text-text-muted">角色: {item.role}</span>
          </div>

          {item.rawContent !== null && item.rawContent !== item.resolvedContent && (
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-widest">原始内容</label>
              <pre className="mt-1 p-2 bg-bg-secondary border border-border-subtle text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">
                {item.rawContent}
              </pre>
            </div>
          )}

          {item.resolvedContent !== null && item.resolvedContent !== item.finalContent && (
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-widest">解析后（宏替换前）</label>
              <pre className="mt-1 p-2 bg-bg-secondary border border-border-subtle text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">
                {item.resolvedContent}
              </pre>
            </div>
          )}

          {hasContent && (
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-widest">最终内容</label>
              <pre className="mt-1 p-2 bg-bg-secondary border border-border-subtle text-[11px] text-text-primary font-mono whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                {item.finalContent}
              </pre>
            </div>
          )}

          {isSkipped && !hasContent && (
            <div className="text-[11px] text-text-muted italic">此项被跳过，原因: {item.skipReason}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Lorebook Tab ============

function LorebookTab({ data }: { data: PromptInspectionResult }) {
  const { lorebook } = data;

  if (lorebook.matchedEntries.length === 0) {
    return <div className="text-sm text-text-muted text-center py-8">没有匹配到世界书条目</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-text-muted">
        扫描文本: <span className="text-text-primary font-mono">{lorebook.scanText.slice(0, 200)}{lorebook.scanText.length > 200 ? '...' : ''}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border border-border-subtle p-3">
          <h4 className="text-xs text-text-primary mb-2">前置条目 ({lorebook.beforeEntries.length})</h4>
          <div className="space-y-1">
            {lorebook.beforeEntries.map((e, i) => (
              <LorebookEntryRow key={`b-${i}`} entry={e} />
            ))}
            {lorebook.beforeEntries.length === 0 && <span className="text-[11px] text-text-muted">无</span>}
          </div>
        </div>

        <div className="border border-border-subtle p-3">
          <h4 className="text-xs text-text-primary mb-2">后置条目 ({lorebook.afterEntries.length})</h4>
          <div className="space-y-1">
            {lorebook.afterEntries.map((e, i) => (
              <LorebookEntryRow key={`a-${i}`} entry={e} />
            ))}
            {lorebook.afterEntries.length === 0 && <span className="text-[11px] text-text-muted">无</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function LorebookEntryRow({ entry }: { entry: { entry: { keys: string[]; content: string; comment?: string }; score: number; matchedKeywords: string[] } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border-subtle/60 p-2">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-accent-blue">[{entry.entry.keys.join(', ')}]</span>
          <span className="text-[10px] text-text-muted">匹配: {entry.matchedKeywords.join(', ')}</span>
          <span className="text-[10px] text-text-muted ml-auto">分数: {entry.score.toFixed(2)}</span>
        </div>
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-bg-secondary text-[11px] text-text-muted font-mono whitespace-pre-wrap break-all max-h-[150px] overflow-y-auto">
          {entry.entry.content}
        </pre>
      )}
    </div>
  );
}

// ============ History Tab ============

function HistoryTab({ data }: { data: PromptInspectionResult }) {
  const { history } = data;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <span>总消息: {history.totalMessages}</span>
        <span>包含: {history.includedMessages}</span>
        <span>上下文上限: {history.maxContext}</span>
        <span>可用: {history.availableContext}</span>
      </div>

      <div className="space-y-1">
        {history.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-3 py-2 border ${
              msg.included ? 'border-border-subtle bg-bg-secondary/40' : 'border-border-subtle/30 bg-bg-secondary/10 opacity-50'
            }`}
          >
            <span className={`text-[10px] px-1.5 py-0.5 shrink-0 ${
              msg.role === 'user' ? 'bg-accent-blue/10 text-accent-blue' :
              msg.role === 'assistant' ? 'bg-green-400/10 text-green-400' :
              'bg-yellow-400/10 text-yellow-400'
            }`}>
              {msg.role}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-text-primary truncate">{msg.content}</div>
              <div className="text-[10px] text-text-muted">~{msg.tokens} tokens {msg.included ? '' : '(超出预算)'}</div>
            </div>
            {msg.included ? <CheckCircle size={12} className="text-green-400 shrink-0" /> : <Minus size={12} className="text-text-muted shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Final Tab ============

function FinalTab({ data }: { data: PromptInspectionResult }) {
  const [expandedMsg, setExpandedMsg] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    const next = new Set(expandedMsg);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedMsg(next);
  };

  return (
    <div className="space-y-2">
      {data.finalMessages.map((msg) => (
        <div key={msg.index} className="border border-border-subtle overflow-hidden">
          <button
            onClick={() => toggle(msg.index)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left bg-bg-secondary/40 hover:bg-bg-secondary/60 transition-colors"
          >
            <span className={`text-[10px] px-1.5 py-0.5 ${
              msg.role === 'system' ? 'bg-yellow-400/10 text-yellow-400' :
              msg.role === 'user' ? 'bg-accent-blue/10 text-accent-blue' :
              'bg-green-400/10 text-green-400'
            }`}>
              {msg.role.toUpperCase()}
            </span>
            <span className="text-[11px] text-text-muted truncate flex-1">{msg.content.slice(0, 80)}{msg.content.length > 80 ? '...' : ''}</span>
            <span className="text-text-muted">{expandedMsg.has(msg.index) ? <EyeSlash size={12} /> : <Eye size={12} />}</span>
          </button>
          {expandedMsg.has(msg.index) && (
            <pre className="p-3 text-[11px] text-text-primary font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto bg-bg-primary">
              {msg.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
