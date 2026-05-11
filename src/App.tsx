import { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import { initializeDatabase, getSettings, getLorebooks, getPresets, getChats, saveChat, savePreset } from './sillytavern/database';
import { GameCanvas } from './components/game/GameCanvas';
import { CustomCursor } from './components/system/CustomCursor';
import { IntroAnimation } from './components/system/IntroAnimation';
import { NotificationToast } from './components/system/NotificationToast';
// import { ConfirmModal } from './components/system/ConfirmModal';
import { SettingsModal } from './components/tavern/SettingsModal';
import { LorebookModal } from './components/tavern/LorebookModal';
import { PresetModal } from './components/tavern/PresetModal';
import { HistoryDrawer } from './components/tavern/HistoryDrawer';
import type { ChatSession, ChatPreset } from './sillytavern/types';
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

        if (settings) {
          actions.setSettings(settings);

          // 如果没有预设，创建默认预设
          if (presets.length === 0) {
            const defaultPreset: ChatPreset = {
              id: crypto.randomUUID(),
              name: '默认预设',
              settings: {
                temp_openai: 0.8,
                openai_max_tokens: 2048,
                top_p_openai: 1,
                freq_pen_openai: 0,
                pres_pen_openai: 0,
                openai_model: 'gpt-4',
                stream_openai: true,
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await savePreset(defaultPreset);
            presets.push(defaultPreset);
            actions.setPresets(presets);

            const updatedSettings = { ...settings, activePresetId: defaultPreset.id };
            await import('./sillytavern/database').then(m => m.saveSettings(updatedSettings));
            actions.setSettings(updatedSettings);
          } else {
            actions.setPresets(presets);
          }
        }

        actions.setLorebooks(lorebooks);

        // 如果没有聊天记录，创建默认会话
        if (chats.length === 0 && settings) {
          const newChat: ChatSession = {
            id: crypto.randomUUID(),
            name: `${settings.characterName} - 新对话 1`,
            messages: [],
            characterName: settings.characterName,
            userName: settings.userName,
            presetId: settings.activePresetId || presets[0]?.id || null,
            lorebookIds: [...settings.activeLorebookIds],
            variables: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await saveChat(newChat);
          chats.push(newChat);
          actions.setActiveChatId(newChat.id);
        }

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
