import { useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { BackgroundLayer } from './BackgroundLayer';
import { CharacterSprite } from './CharacterSprite';
import { DialogueBox } from './DialogueBox';
import { ChoiceMenu } from './ChoiceMenu';
import { StatusPanel } from './StatusPanel';
import { ActionBar } from './ActionBar';
import { MoodOverlay } from './MoodOverlay';
import { MapModal } from './MapModal';
import { UserInput } from './UserInput';
import { ActionPanel } from './ActionPanel';
import { SaveModal } from '../system/SaveModal';
import { AudioSystem } from '../system/AudioSystem';
import { maintextToScene } from '../../engine/scene-parser';
import { OPENING_STORYLINE } from '../../engine/opening-storyline';

/** 从 assistant message 的 content 里提取 <maintext>...*/
function extractMaintext(content: string): string {
  const m = content.match(/<maintext>([\s\S]*?)<\/maintext>/);
  return m ? m[1].trim() : '';
}

export function GameCanvas() {
  const mood = useGameStore(state => state.game.currentState.mood);
  const currentScene = useGameStore(state => state.game.currentScene);
  const activeChat = useGameStore(state => {
    const chats = state.tavern.chats;
    return chats.find(c => c.id === state.tavern.activeChatId) || null;
  });
  const actions = useGameStore(state => state.actions);

  // Fallback: 如果 currentScene 为 null 但 activeChat 有 assistant 消息,
  // 自动从最后一条 assistant message 重建 scene(解决刷新页面后 scene 丢失)
  useEffect(() => {
    if (currentScene) return;
    if (activeChat && activeChat.messages.length > 0) {
      const lastAssistant = [...activeChat.messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        const maintext = extractMaintext(lastAssistant.content);
        if (maintext) {
          const scene = maintextToScene(maintext);
          // 只有提取的 scene 有交互数据时才使用它
          if (scene.lines.length > 0 && (scene.observe || scene.investigateItems?.length || scene.actionItems?.length)) {
            actions.setCurrentScene(scene);
            return;
          }
        }
      }
    }
    // 最终后备: 直接使用开场剧情确保用户永远能开始游戏
    actions.setCurrentScene(maintextToScene(OPENING_STORYLINE));
  }, [currentScene, activeChat, actions]);

  return (
    <div className="relative w-full h-full overflow-hidden" data-mood={mood}>
      <AudioSystem />
      <BackgroundLayer />
      <MoodOverlay />

      {/* Noise texture */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVfJ/WAAAACHRSTlMzMzMzMzMzM85JBgUAAAABYktHRAH/Ai3eAAAACXBIWXMAAAsTAAALEwEAmpwYAAAARklEQVQ4y2NgQAX8DKhgGSPD/3///v1Dw0JbWYAEEWLI+F8QHrEg4n8IVvj/H0mBEgOyQgYGhv//GR4hK/iPqlARi1gAo+4qhZYuYqsAAAAASUVORK5CYII=")`,
        }}
      />

      <SaveModal />
      <CharacterSprite />
      <DialogueBox />
      <ChoiceMenu />
      <UserInput />
      <ActionPanel />
      <StatusPanel />
      <ActionBar />
      <MapModal />
    </div>
  );
}
