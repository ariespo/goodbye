import { useEffect, useState } from 'react';
import { getCurrentLocationPresentation } from '../../data/playerKnowledge';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { openSaveModal } from '../system/saveModalEvents';
import { GameIcon, type GameIconName } from '../ui/GameIcon';
import { PixelFrameRails } from '../ui/PixelFrame';

type ArchiveItem = {
  id: 'archive' | 'characters' | 'history' | 'settings' | 'conclusion';
  label: string;
  icon: GameIconName;
};

const ARCHIVE_ITEMS: ArchiveItem[] = [
  { id: 'archive', label: '档案', icon: 'save' },
  { id: 'characters', label: '人物', icon: 'info' },
  { id: 'history', label: '历史', icon: 'history' },
  { id: 'settings', label: '设置', icon: 'settings' },
  { id: 'conclusion', label: '指认', icon: 'ending' },
];

const iconPath = (name: string) => assetUrl(`assets/ui/penpot/pc/icon-${name}.svg`);

export function StatusPanel() {
  const gameStatus = useGameStore(state => state.game.gameStatus);
  const variables = useGameStore(state => state.tavern.variables);
  const cycleCount = Number(variables.cycleCount ?? 1);
  const currentLocation = getCurrentLocationPresentation(variables);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const setShowConclusion = useGameStore(state => state.actions.setShowConclusion);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  useEffect(() => {
    if (!archiveOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArchiveOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [archiveOpen]);

  const time = gameStatus.time.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const activateArchiveItem = (item: ArchiveItem) => {
    setArchiveOpen(false);
    if (item.id === 'archive') openSaveModal('manage');
    else if (item.id === 'conclusion') setShowConclusion(true);
    else toggleModal(item.id);
  };

  const archiveMenu = archiveOpen ? (
    <div className="archive-menu" role="menu" aria-label="档案菜单">
      <div className="archive-menu__title"><span>ARCHIVE</span><small>档案与系统</small></div>
      {ARCHIVE_ITEMS.map(item => (
        <button key={item.id} type="button" role="menuitem" className="archive-menu__item" onClick={() => activateArchiveItem(item)}>
          <GameIcon name={item.icon} size={20} /><span>{item.label}</span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <header className="pc-status-bar" role="banner" aria-label="游戏状态">
        <button type="button" className="pc-status-bar__menu" aria-label="档案菜单" aria-expanded={archiveOpen} onClick={() => setArchiveOpen(value => !value)}>
          <PixelFrameRails />
          <img src={iconPath('menu')} alt="" />
        </button>
        <div className="pc-status-bar__rail">
          <PixelFrameRails />
          <StatusCell icon="time" label="时间" value={time} />
          <StatusCell icon="location" label="地点" value={currentLocation.shortName} />
          <StatusCell icon="stamina" label="体力" value={`${Math.round(gameStatus.stamina)}/100`} />
          <StatusCell icon="sanity" label="理智" value={`${Math.round(gameStatus.sanity)}/100`} />
          <StatusCell icon="loop" label="循环" value={String(cycleCount)} compact />
        </div>
      </header>

      <aside className={`mobile-status-panel ${mobileExpanded ? 'is-expanded' : ''}`}>
        <div className="mobile-status-panel__buttons">
          <button type="button" aria-label={mobileExpanded ? '收起状态' : '展开状态'} onClick={() => setMobileExpanded(value => !value)}>
            <GameIcon name={mobileExpanded ? 'close' : 'info'} size={19} />
          </button>
          <button type="button" aria-label="移动端档案菜单" aria-expanded={archiveOpen} onClick={() => setArchiveOpen(value => !value)}>
            <img src={iconPath('menu')} alt="" />
          </button>
        </div>
        {mobileExpanded && (
          <div className="mobile-status-panel__readout">
            <span>{time}</span><span>{currentLocation.shortName}</span>
            <span>体力 {Math.round(gameStatus.stamina)}/100</span>
            <span>理智 {Math.round(gameStatus.sanity)}/100</span><span>循环 {cycleCount}</span>
          </div>
        )}
      </aside>
      {archiveMenu}
    </>
  );
}

function StatusCell({ icon, label, value, compact = false }: {
  icon: 'time' | 'location' | 'stamina' | 'sanity' | 'loop'; label: string; value: string; compact?: boolean;
}) {
  return (
    <div className={`pc-status-cell ${compact ? 'is-compact' : ''}`}>
      <img className="pc-status-cell__icon" src={iconPath(icon)} alt="" />
      <span className="pc-status-cell__label">{label}</span>
      <strong>{compact ? `${label} ${value}` : value}</strong>
    </div>
  );
}
