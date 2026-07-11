import { useEffect, useState } from 'react';
import { useGameStore } from './stores/gameStore';
import { initializeDatabase, getSettings, getLorebooks, getPresets, getChats, saveChat, savePreset, saveSettings } from './sillytavern/database';
import { GameCanvas } from './components/game/GameCanvas';
import { CustomCursor } from './components/system/CustomCursor';
import { IntroAnimation } from './components/system/IntroAnimation';
import { OpeningVideo } from './components/system/OpeningVideo';
import { TitleScreen } from './components/system/TitleScreen';
import { TitleMusic } from './components/system/TitleMusic';
import { AudioSystem } from './components/system/AudioSystem';
import { NotificationToast } from './components/system/NotificationToast';
import { ApiKeySetup } from './components/system/ApiKeySetup';
import { SaveModal } from './components/system/SaveModal';
import { SettingsModal } from './components/tavern/SettingsModal';
import { LorebookModal } from './components/tavern/LorebookModal';
import { PresetModal } from './components/tavern/PresetModal';
import { HistoryDrawer } from './components/tavern/HistoryDrawer';
import { PromptInspector } from './components/system/PromptInspector';
import type { ChatSession, ChatPreset, ChatMessage } from './sillytavern/types';
import { createDefaultPreset } from './sillytavern/types';
import { OPENING_STORYLINE } from './engine/opening-storyline';
import { createDefaultVariables } from './sillytavern/vars-merger';
import './styles/animations.css';
import './styles/themes.css';
import { applyFontFamily } from './utils/fonts';

function App() {
  const actions = useGameStore(state => state.actions);
  const fontFamily = useGameStore(state => state.tavern.settings?.fontFamily);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

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
            await saveSettings(updatedSettings);
            actions.setSettings(updatedSettings);
          } else {
            actions.setPresets(presets);
          }
        }

        actions.setLorebooks(lorebooks);

        // 如果没有聊天记录，创建默认会话 + 注入开局正文
        // 但不设置 currentScene，等用户在 TitleScreen 点击"开始游戏"后再进入
        if (chats.length === 0 && settings) {
          const openingVariables = createDefaultVariables();
          const openingMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穂的早晨</sum>\n<vars>{ "stamina": 100, "sanity": 80 }</vars>`,
            timestamp: Date.now(),
            variables: openingVariables,
          };
          const newChat: ChatSession = {
            id: crypto.randomUUID(),
            name: `${settings.characterName} - 新对话 1`,
            messages: [openingMsg],
            characterName: settings.characterName,
            userName: settings.userName,
            presetId: settings.activePresetId || presets[0]?.id || null,
            lorebookIds: [...settings.activeLorebookIds],
            variables: openingVariables,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await saveChat(newChat);
          chats.push(newChat);
          actions.setActiveChatId(newChat.id);
        }

        actions.setChats(chats);

        if (chats.length > 0) {
          const activeId = useGameStore.getState().tavern.activeChatId || chats[0].id;
          actions.setActiveChatId(activeId);
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
  const [openingVideoEnded, setOpeningVideoEnded] = useState(false);

  if (!openingVideoEnded) {
    return (
      <div className="relative w-full h-full overflow-hidden bg-bg-primary">
        <CustomCursor />
        <AudioSystem />
        <OpeningVideo onEnded={() => setOpeningVideoEnded(true)} />
        <NotificationToast />
        <ApiKeySetup />
        <SaveModal />
        <SettingsModal />
        <LorebookModal />
        <PresetModal />
        <HistoryDrawer />
        <PromptInspector />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden bg-bg-primary ${showTitle ? '' : 'world-horror-theme'}`}>
      <CustomCursor />
      <AudioSystem />
      <IntroAnimation />
      <NotificationToast />
      {showTitle && <TitleMusic />}
      {showTitle && <TitleScreen />}
      {!showTitle && <GameCanvas />}
      <ApiKeySetup />
      <SaveModal />
      <SettingsModal />
      <LorebookModal />
      <PresetModal />
      <HistoryDrawer />
      <PromptInspector />
    </div>
  );
}

export default App
