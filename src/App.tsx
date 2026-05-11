import { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import { initializeDatabase, getSettings, getLorebooks, getPresets, getChats } from './sillytavern/database';
import { GameCanvas } from './components/game/GameCanvas';
import { CustomCursor } from './components/system/CustomCursor';
import { IntroAnimation } from './components/system/IntroAnimation';
import { NotificationToast } from './components/system/NotificationToast';
import { SettingsModal } from './components/tavern/SettingsModal';
import { LorebookModal } from './components/tavern/LorebookModal';
import { PresetModal } from './components/tavern/PresetModal';
import { HistoryDrawer } from './components/tavern/HistoryDrawer';
import './styles/animations.css';
import './styles/themes.css';

function App() {
  const actions = useGameStore(state => state.actions);

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeDatabase();
        const [settings, lorebooks, presets, chats] = await Promise.all([
          getSettings(),
          getLorebooks(),
          getPresets(),
          getChats(),
        ]);

        if (settings) actions.setSettings(settings);
        actions.setLorebooks(lorebooks);
        actions.setPresets(presets);
        actions.setChats(chats);

        if (chats.length > 0 && !useGameStore.getState().tavern.activeChatId) {
          actions.setActiveChatId(chats[0].id);
        }

        actions.addNotification({
          type: 'success',
          message: '游戏数据加载完成',
          duration: 3000,
        });
      } catch (error) {
        actions.addNotification({
          type: 'error',
          message: '数据加载失败: ' + (error instanceof Error ? error.message : '未知错误'),
          duration: 5000,
        });
      }
    };

    loadData();
  }, [actions]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-bg-primary">
      <CustomCursor />
      <IntroAnimation />
      <NotificationToast />
      <GameCanvas />
      <SettingsModal />
      <LorebookModal />
      <PresetModal />
      <HistoryDrawer />
    </div>
  );
}

export default App