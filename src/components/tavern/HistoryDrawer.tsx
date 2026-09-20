import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../stores/gameStore';
import { maintextToScene } from '../../engine/scene-parser';
import { resolvePlayerFacingSpeaker } from '../../data/playerKnowledge';
import { projectKnowledgeForPlayback } from '../../utils/knowledgePresentation';
import { resolveNpcPlayerKnowledge } from '../../data/npcPlayerKnowledge';
import { applyMacros } from '../game/dialogueText';
import { PixelModalShell, PixelModalHeader, PixelModalContent } from '../ui/PixelModal';
import '../game/dialogue-navigation.css';

export function HistoryDrawer() {
  const showHistory = useGameStore(state => state.ui.showHistory);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const scene = useGameStore(state => state.game.currentScene);
  const liveLineIndex = useGameStore(state => state.game.currentLineIndex);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const progress = useGameStore(state => state.game.dialogueProgress);
  const chats = useGameStore(state => state.tavern.chats);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const settings = useGameStore(state => state.tavern.settings);
  const variables = useGameStore(state => state.tavern.variables);
  const userName = settings?.userName || '玩家';
  const characterName = settings?.characterName || '少女';

  const entries = useMemo(() => {
    if (!showHistory) return [];
    const messages = chats.find(chat => chat.id === activeChatId)?.messages ?? [];
    const sourceIndex = scene?.sourceMessageId
      ? messages.findIndex(message => message.id === scene.sourceMessageId) : -1;
    // Legacy saves may lack a source ID. Never expose the latest assistant
    // message wholesale while its scene may still be playing.
    const lastAssistant = messages.map(message => message.role).lastIndexOf('assistant');
    const boundary = sourceIndex >= 0 ? sourceIndex : Math.max(0, lastAssistant);
    const publicVariables = projectKnowledgeForPlayback(variables, scene, liveLineIndex, sceneComplete);
    const playerIdentity = settings?.playerIdentityConfirmed
      && (settings.playerGender === 'male' || settings.playerGender === 'female')
      ? { name: userName, gender: settings.playerGender } : undefined;
    const macros = playerIdentity ? {
      'player.oldManAddress': resolveNpcPlayerKnowledge('old-man', playerIdentity, publicVariables).allowedAddress,
      'player.huihuiAddress': resolveNpcPlayerKnowledge('chen-huihui', playerIdentity, publicVariables).allowedAddress,
    } : {};
    const result: Array<{ id: string; title: string; lines: Array<{ speaker: string; text: string }> }> = [];
    for (const message of messages.slice(0, boundary)) {
      if (message.role === 'system') continue;
      if (message.role === 'user') {
        result.push({ id: message.id, title: '你的行动', lines: [{ speaker: userName, text: message.content }] });
        continue;
      }
      const maintext = message.parsed?.maintext
        || message.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1];
      if (!maintext) continue;
      const lines = maintextToScene(maintext).lines.map(line => ({
        speaker: applyMacros(resolvePlayerFacingSpeaker(line.speaker, line.character, publicVariables), userName, characterName, macros),
        text: applyMacros(line.text, userName, characterName, macros),
      }));
      if (lines.length) result.push({ id: message.id, title: '已读剧情', lines });
    }
    if (scene) {
      const visibleLines = scene.lines.flatMap((line, index) => {
        const fullyRead = sceneComplete || index < liveLineIndex;
        const text = fullyRead ? applyMacros(line.text, userName, characterName, macros)
          : progress?.sceneId === scene.id && progress.lineIndex === index ? progress.text : '';
        if (!text || (!fullyRead && index > liveLineIndex)) return [];
        return [{ speaker: applyMacros(resolvePlayerFacingSpeaker(line.speaker, line.character, publicVariables), userName, characterName, macros), text }];
      });
      if (visibleLines.length) result.push({ id: `scene:${scene.id}`, title: '当前剧情 · 已读部分', lines: visibleLines });
    }
    return result;
  }, [showHistory, chats, activeChatId, scene, liveLineIndex, sceneComplete, progress, variables, userName, characterName, settings]);

  const close = () => { if (useGameStore.getState().ui.showHistory) toggleModal('history'); };
  return createPortal(
    <PixelModalShell open={showHistory} onClose={close} labelledBy="dialogue-history-title" className="dialogue-history-shell">
      <PixelModalHeader titleId="dialogue-history-title" title="对话记录" meta="只记录已经读过的内容" onClose={close} closeLabel="关闭对话记录" />
      <PixelModalContent className="dialogue-history-content">
        {entries.length === 0 ? <p className="dialogue-history-empty">还没有读过的对话。</p> : entries.map(entry => (
          <article key={entry.id} className="dialogue-history-entry">
            <h3>{entry.title}</h3>
            {entry.lines.map((line, index) => (
              <dl key={index} className="dialogue-history-line"><dt>{line.speaker}</dt><dd>{line.text}</dd></dl>
            ))}
          </article>
        ))}
      </PixelModalContent>
    </PixelModalShell>,
    document.body,
  );
}
