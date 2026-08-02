import { useGameStore } from '../../stores/gameStore';
import { GameIcon } from '../ui/GameIcon';

export function ApiGuideCard() {
  const showApiGuide = useGameStore(state => state.ui.showApiGuide);
  const setShowApiGuide = useGameStore(state => state.actions.setShowApiGuide);
  const toggleModal = useGameStore(state => state.actions.toggleModal);

  if (!showApiGuide) return null;

  const dismiss = () => setShowApiGuide(false);
  const goConfigure = () => {
    setShowApiGuide(false);
    window.dispatchEvent(new CustomEvent('farewell:settings-tab', { detail: 'ai' }));
    toggleModal('settings');
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 45%, rgba(24,30,40,0.42), rgba(0,0,0,0.88) 62%)' }}
      onClick={dismiss}
    >
      <div
        className="clean-modal-frame clean-modal-frame-gold relative w-[520px] max-w-[92vw] select-none px-8 py-7"
        onClick={e => e.stopPropagation()}
        style={{ imageRendering: 'pixelated' }}
        role="dialog"
        aria-label="AI 接口配置引导"
      >
        <div className="mb-4 flex items-center gap-3" style={{ color: '#d8c48a', fontFamily: '"MuzaiPixel", monospace' }}>
          <GameIcon name="lightning" size={24} />
          <span style={{ fontSize: '25px', letterSpacing: '0.12em' }}>需要 AI 接口</span>
        </div>
        <p
          className="mb-2 whitespace-pre-wrap"
          style={{ fontSize: '21px', lineHeight: 1.8, color: '#c8cdd6', fontFamily: '"MuzaiPixel", "LXGW WenKai", serif' }}
        >
          开场剧情可以直接游玩，但要继续与这个世界互动——选择、调查、对话——需要先配置一个 AI 接口。
        </p>
        <p className="mb-6" style={{ fontSize: '17px', color: '#7d8390', fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.08em' }}>
          支持 OpenAI / DeepSeek / 智谱 / Anthropic 等兼容接口，密钥仅保存在本机浏览器。
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2"
            style={{
              fontSize: '19px',
              color: '#9aa0ab',
              fontFamily: '"MuzaiPixel", monospace',
              border: '2px solid #3a3f48',
              background: '#111318',
              cursor: 'pointer',
            }}
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={goConfigure}
            className="px-4 py-2"
            style={{
              fontSize: '19px',
              color: '#0a0b0e',
              fontFamily: '"MuzaiPixel", monospace',
              border: '2px solid #d8c48a',
              background: '#c9b478',
              cursor: 'pointer',
            }}
          >
            去配置
          </button>
        </div>
      </div>
    </div>
  );
}
