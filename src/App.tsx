import { lazy, Suspense, useEffect, useState } from 'react';
import { useGameStore } from './stores/gameStore';
import { initializeDatabase, getSettings, getLorebooks, getPresets, getChats, saveChat, savePreset, saveSettings } from './sillytavern/database';
import { GameCanvas } from './components/game/GameCanvas';
import { CustomCursor } from './components/system/CustomCursor';
import { OpeningVideo } from './components/system/OpeningVideo';
import { TitleScreen } from './components/system/TitleScreen';
import { TitleMusic } from './components/system/TitleMusic';
import { AudioSystem } from './components/system/AudioSystem';
import { NotificationToast } from './components/system/NotificationToast';
import { TurnRecoveryBar } from './components/system/TurnRecoveryBar';
import { ApiKeySetup } from './components/system/ApiKeySetup';
import { SaveModal } from './components/system/SaveModal';
import { SettingsModal } from './components/tavern/SettingsModal';
import { LorebookModal } from './components/tavern/LorebookModal';
import { PresetModal } from './components/tavern/PresetModal';
import { HistoryDrawer } from './components/tavern/HistoryDrawer';
import type { ChatSession, ChatPreset, ChatMessage } from './sillytavern/types';
import { createDefaultPreset } from './sillytavern/types';
import { OPENING_STORYLINE } from './engine/opening-storyline';
import { createDefaultVariables } from './sillytavern/vars-merger';
import { INITIAL_PLAYER_RESOURCES } from './data/gameDefaults';
import './styles/animations.css';
import './styles/themes.css';
import { applyFontFamily } from './utils/fonts';
import { recoverNarrativeKnowledge } from './utils/knowledgeRecovery';

const CharacterPoseLab = lazy(() => import('./components/dev/CharacterPoseLab')
  .then(module => ({ default: module.CharacterPoseLab })));
const PromptInspector = lazy(() => import('./components/system/PromptInspector')
  .then(module => ({ default: module.PromptInspector })));
const OrchestrationLogPanel = lazy(() => import('./components/system/OrchestrationLogPanel')
  .then(module => ({ default: module.OrchestrationLogPanel })));

function App() {
  const actions = useGameStore(state => state.actions);
  const fontFamily = useGameStore(state => state.tavern.settings?.fontFamily);

  useEffect(() => {
    applyFontFamily(fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const dbReady = await initializeDatabase();
        const [settings, lorebooks, presets, chats] = await Promise.all([
          getSettings(),
          getLorebooks(),
          getPresets(),
          getChats(),
        ]);

        if (!dbReady) {
          actions.addNotification({
            type: 'warning',
            message: '浏览器存储不可用，已切换至临时内存模式（刷新后数据会丢失）',
            duration: 6000,
          });
        }

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

        // 旧版本可能已在正文完成确定性人物揭示，却因漏掉机器指令没有写入档案。
        // 加载时只依据完整的既有演出补回该事件，不从单独提及或立绘猜测身份。
        for (let index = 0; index < chats.length; index += 1) {
          const recovered = recoverNarrativeKnowledge(chats[index]);
          if (recovered === chats[index]) continue;
          chats[index] = recovered;
          await saveChat(recovered);
        }

        // 如果没有聊天记录，创建默认会话 + 注入开局正文
        // 但不设置 currentScene，等用户在 TitleScreen 点击"开始游戏"后再进入
        if (chats.length === 0 && settings) {
          const openingVariables = createDefaultVariables();
          const openingMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `<maintext>\n${OPENING_STORYLINE}\n</maintext>\n<sum>开局:回到与文穗的早晨</sum>\n<vars>{ "stamina": ${INITIAL_PLAYER_RESOURCES.stamina}, "sanity": ${INITIAL_PLAYER_RESOURCES.sanity} }</vars>`,
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
  const showPromptInspector = useGameStore(state => state.ui.showPromptInspector);
  const showOrchestrationLog = useGameStore(state => state.ui.showOrchestrationLog);
  const [openingVideoEnded, setOpeningVideoEnded] = useState(false);
  const showCharacterPoseLab = new URLSearchParams(window.location.search).get('characterLab') === '1';

  if (showCharacterPoseLab) {
    return <Suspense fallback={null}><CharacterPoseLab /></Suspense>;
  }

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
        {showPromptInspector && <Suspense fallback={null}><PromptInspector /></Suspense>}
        {showOrchestrationLog && <Suspense fallback={null}><OrchestrationLogPanel /></Suspense>}
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden bg-bg-primary ${showTitle ? '' : 'world-horror-theme'}`}>
      <CustomCursor />
      <AudioSystem />
      <NotificationToast />
      <TurnRecoveryBar />
      {showTitle && <TitleMusic />}
      {showTitle && <TitleScreen />}
      {!showTitle && <GameCanvas />}
      <ApiKeySetup />
      <SaveModal />
      <SettingsModal />
      <LorebookModal />
      <PresetModal />
      <HistoryDrawer />
      {showPromptInspector && <Suspense fallback={null}><PromptInspector /></Suspense>}
      {showOrchestrationLog && <Suspense fallback={null}><OrchestrationLogPanel /></Suspense>}
    </div>
  );
}

export default App
