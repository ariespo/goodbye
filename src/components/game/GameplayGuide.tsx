import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { GameIcon, type GameIconName } from '../ui/GameIcon';

const GUIDE_ITEMS: Array<{ icon: GameIconName; title: string; text: string; target: string }> = [
  { icon: 'observe', title: '观察', text: '先理解现场与异常', target: 'observe' },
  { icon: 'investigate', title: '调查', text: '检查带有微光的关键物', target: 'investigate' },
  { icon: 'stack', title: '线索', text: '整理两条线索即可推理', target: 'clues' },
];

export function GameplayGuide() {
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const actionPanelVisible = useGameStore(state => state.game.actionPanel.visible);
  const ui = useGameStore(state => state.ui);
  const [dismissed, setDismissed] = useState(() => window.localStorage.getItem('farewell.gameplay-guide.dismissed') === 'true');

  const modalOpen = ui.showSettings || ui.showLorebook || ui.showPreset || ui.showHistory || ui.showMap || ui.showClues || ui.showCharacters || ui.showConclusion || ui.showEndingEditor;
  const visible = sceneComplete && !actionPanelVisible && !modalOpen && !dismissed;

  // 指引隐藏/卸载时清掉 hover 高亮标记，避免按钮微光残留
  useEffect(() => {
    if (visible) return;
    delete document.body.dataset.guideHighlight;
  }, [visible]);
  useEffect(() => () => { delete document.body.dataset.guideHighlight; }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem('farewell.gameplay-guide.dismissed', 'true');
    setDismissed(true);
  };

  return (
    <section className="gameplay-guide" aria-label="首次调查指引">
      <div className="gameplay-guide__heading">
        <span><GameIcon name="info" size={15} /> 从这里开始调查</span>
        <button type="button" aria-label="关闭新手指引" onClick={dismiss}><GameIcon name="close" size={14} /></button>
      </div>
      <div className="gameplay-guide__items">
        {GUIDE_ITEMS.map((item, index) => (
          <div
            key={item.title}
            className="gameplay-guide__item"
            onMouseEnter={() => { document.body.dataset.guideHighlight = item.target; }}
            onMouseLeave={() => { delete document.body.dataset.guideHighlight; }}
          >
            <span className="gameplay-guide__step">0{index + 1}</span>
            <GameIcon name={item.icon} size={19} />
            <span><strong>{item.title}</strong><small>{item.text}</small></span>
          </div>
        ))}
      </div>
      <button type="button" className="gameplay-guide__dismiss" onClick={dismiss}>知道了</button>
    </section>
  );
}
