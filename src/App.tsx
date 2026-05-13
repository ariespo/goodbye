import { useEffect } from 'react';
import { useGameStore } from './stores/gameStore';
import { initializeDatabase, getSettings, getLorebooks, getPresets, getChats, saveChat, savePreset } from './sillytavern/database';
import { GameCanvas } from './components/game/GameCanvas';
import { CustomCursor } from './components/system/CustomCursor';
import { IntroAnimation } from './components/system/IntroAnimation';
import { TitleScreen } from './components/system/TitleScreen';
import { NotificationToast } from './components/system/NotificationToast';
import { ApiKeySetup } from './components/system/ApiKeySetup';
// import { ConfirmModal } from './components/system/ConfirmModal';
import { SettingsModal } from './components/tavern/SettingsModal';
import { LorebookModal } from './components/tavern/LorebookModal';
import { PresetModal } from './components/tavern/PresetModal';
import { HistoryDrawer } from './components/tavern/HistoryDrawer';
import type { ChatSession, ChatPreset, ChatMessage } from './sillytavern/types';
import { createDefaultPreset } from './sillytavern/types';
import { OPENING_STORYLINE } from './engine/opening-storyline';
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
              ...createDefaultPreset(),
              id: crypto.randomUUID(),
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

        // 如果没有聊天记录，创建默认会话 + 注入开局正文
        // 但不设置 currentScene，等用户在 TitleScreen 点击"开始游戏"后再进入
        if (chats.length === 0 && settings) {
          const openingMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穂的早晨</sum>\n<vars>{ "stamina": 100, "sanity": 80 }</vars>`,
            timestamp: Date.now(),
            variables: {},
          };
          const newChat: ChatSession = {
            id: crypto.randomUUID(),
            name: `${settings.characterName} - 新对话 1`,
            messages: [openingMsg],
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

  const showTitle = useGameStore(state => state.ui.showTitle);

  return (
    <div className="relative w-full h-full overflow-hidden bg-bg-primary">
      <CustomCursor />
      <IntroAnimation />
      <NotificationToast />
      {showTitle && <TitleScreen />}
      {!showTitle && <GameCanvas />}
      <ApiKeySetup />
      <SettingsModal />
      <LorebookModal />
      <PresetModal />
      <HistoryDrawer />
    </div>
  );
}

export default App
