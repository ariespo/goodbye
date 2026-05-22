import { useGameStore } from '../../stores/gameStore';
import { useGameLoop } from '../../hooks/useGameLoop';
import { X } from '@phosphor-icons/react';

const PANEL_BG = 'rgba(12, 12, 16, 0.95)';
const BORDER = '#3a3a42';
const BORDER_BRIGHT = '#52525c';
const CORNER = '#5a5a64';
const TEXT_MAIN = '#d8d4cc';
const TEXT_DIM = '#7a756e';
const ACCENT = '#6b8fc4';
const ACCENT_BG = 'rgba(107, 143, 196, 0.12)';

export function ActionPanel() {
  const actionPanel = useGameStore(state => state.game.actionPanel);
  const currentScene = useGameStore(state => state.game.currentScene);
  const setActionPanel = useGameStore(state => state.actions.setActionPanel);
  const { performAction } = useGameLoop();

  if (!actionPanel.visible) return null;

  const handleClose = () => {
    setActionPanel({ visible: false, type: null, content: '', selectedIndex: null });
  };

  const handleSelectItem = (index: number) => {
    if (actionPanel.type === 'investigate' && currentScene?.investigateItems) {
      performAction('investigate', index);
    } else if (actionPanel.type === 'act' && currentScene?.actionItems) {
      performAction('actions', index);
    }
  };

  const title = actionPanel.type === 'observe' ? '观 察'
    : actionPanel.type === 'investigate' ? '调 查'
    : actionPanel.type === 'act' ? '行 动'
    : '';

  const icon = actionPanel.type === 'observe' ? '👁'
    : actionPanel.type === 'investigate' ? '🔍'
    : actionPanel.type === 'act' ? '➤'
    : '';

  // 判断是否是列表类型（调查/行动需要显示可选列表）
  const isListType = actionPanel.type === 'investigate' || actionPanel.type === 'act';

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-40 select-none"
      style={{ width: 'min(88vw, 980px)', maxHeight: '380px', top: '8%' }}
    >
      {/* 主体背景 */}
      <div
        className="relative w-full h-full overflow-y-auto"
        style={{
          background: PANEL_BG,
          border: `3px solid ${BORDER}`,
          padding: '20px 24px 28px 24px',
          boxShadow:
            `inset 2px 2px 0 ${BORDER_BRIGHT},` +
            `inset -2px -2px 0 rgba(0,0,0,0.5),` +
            `4px 4px 0 rgba(0,0,0,0.6),` +
            `5px 5px 0 rgba(0,0,0,0.4),` +
            `6px 6px 0 rgba(0,0,0,0.2)`,
        }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '20px' }}>{icon}</span>
            <span
              style={{
                fontSize: '20px',
                color: ACCENT,
                fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
                letterSpacing: '0.2em',
              }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center transition-colors duration-150"
            style={{
              width: 28,
              height: 28,
              border: `2px solid ${BORDER}`,
              color: TEXT_DIM,
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = ACCENT;
              e.currentTarget.style.color = ACCENT;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BORDER;
              e.currentTarget.style.color = TEXT_DIM;
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容区 */}
        {isListType ? (
          /* 调查/行动列表 */
          <div className="flex flex-col gap-3">
            {actionPanel.type === 'investigate' && currentScene?.investigateItems?.map((item, i) => (
              <button
                key={i}
                className="text-left w-full transition-all duration-150"
                style={{
                  background: ACCENT_BG,
                  border: `2px solid ${BORDER}`,
                  padding: '12px 16px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
                onClick={() => handleSelectItem(i)}
              >
                <div
                  style={{
                    fontSize: '20px',
                    color: TEXT_MAIN,
                    fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
                    lineHeight: 1.6,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: ACCENT, marginRight: 8 }}>[{i + 1}]</span>
                  {item.desc}
                </div>
                <div
                  className="flex flex-wrap gap-3"
                  style={{
                    fontSize: '15px',
                    color: TEXT_DIM,
                    fontFamily: '"MuzaiPixel", monospace',
                  }}
                >
                  <span>耗时: {item.time}</span>
                  <span>体力-{item.stamina}</span>
                  <span>理智-{item.sanity}</span>
                </div>
              </button>
            ))}
            {actionPanel.type === 'act' && currentScene?.actionItems?.map((item, i) => (
              <button
                key={i}
                className="text-left w-full transition-all duration-150"
                style={{
                  background: ACCENT_BG,
                  border: `2px solid ${BORDER}`,
                  padding: '12px 16px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = BORDER;
                }}
                onClick={() => handleSelectItem(i)}
              >
                <div
                  style={{
                    fontSize: '20px',
                    color: TEXT_MAIN,
                    fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
                    lineHeight: 1.6,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: ACCENT, marginRight: 8 }}>[{i + 1}]</span>
                  {item.desc}
                </div>
                <div
                  className="flex flex-wrap gap-3"
                  style={{
                    fontSize: '15px',
                    color: TEXT_DIM,
                    fontFamily: '"MuzaiPixel", monospace',
                  }}
                >
                  <span>耗时: {item.time}</span>
                  <span>体力-{item.stamina}</span>
                  <span>理智-{item.sanity}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* 观察文本 */
          <div
            className="whitespace-pre-wrap"
            style={{
              fontSize: '20px',
              lineHeight: 1.8,
              color: TEXT_MAIN,
              fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
            }}
          >
            {formatObserveText(actionPanel.content)}
          </div>
        )}
      </div>

      {/* 四角像素装饰 */}
      <div style={{ position: 'absolute', top: -4, left: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, left: -4, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', top: -4, right: -2, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -4, left: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -2, left: -4, width: 3, height: 10, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 3, background: CORNER }} />
      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 3, height: 10, background: CORNER }} />
    </div>
  );
}

/** 高亮观察文本中的 [发现]/[异常]/[线索] 标记 */
function formatObserveText(text: string): React.ReactNode {
  const parts = text.split(/(\[发现\]|\[异常\]|\[线索\])/g);
  return parts.map((part, i) => {
    if (part === '[发现]' || part === '[异常]' || part === '[线索]') {
      return (
        <span
          key={i}
          style={{
            color: ACCENT,
            fontWeight: 'bold',
            fontFamily: '"MuzaiPixel", monospace',
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}
