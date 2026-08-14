import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { playSfx } from '../../utils/sfx';
import { useTypewriter } from '../../hooks/useTypewriter';
import { parseOpeningStoryline } from '../../engine/opening-storyline';
import { GameIcon } from '../ui/GameIcon';
import { resolveSceneEnvironment } from '../../utils/sceneEnvironment';
import { rebuildSceneFromChat } from '../../utils/sceneFromChat';
import { commitKnowledgeEvents } from '../../utils/knowledgeCommit';
import { resolvePlayerFacingSpeaker } from '../../data/playerKnowledge';
import {
  PixelPanel,
  PixelTag,
  PixelIconBtn,
  DIALOGUE_TEXT_MAIN as TEXT_MAIN,
  DIALOGUE_TEXT_DIM as TEXT_DIM,
  DIALOGUE_ACCENT as ACCENT,
} from './DialogueBoxParts';
import { applyMacros, emotionLabel, emotionTextClass, emotionTextStyle } from './dialogueText';
import { applyCharacterEmotionPolicies } from '../../engine/character-emotion-policy';

/* ── 像素风对话框 ── */

export function DialogueBox() {
  const storedScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const autoMode = useGameStore(state => state.game.autoMode);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const settings = useGameStore(state => state.tavern.settings);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const variables = useGameStore(state => state.tavern.variables);
  const currentScene = useMemo(
    () => storedScene ? applyCharacterEmotionPolicies(storedScene, variables) : null,
    [storedScene, variables],
  );

  const setCurrentLineIndex = useGameStore(state => state.actions.setCurrentLineIndex);
  const setCurrentState = useGameStore(state => state.actions.setCurrentState);
  const setIsTyping = useGameStore(state => state.actions.setIsTyping);
  const setCurrentScene = useGameStore(state => state.actions.setCurrentScene);
  const setAutoMode = useGameStore(state => state.actions.setAutoMode);
  const setSceneComplete = useGameStore(state => state.actions.setSceneComplete);

  const autoIntervalMs = settings?.autoIntervalMs ?? 1500;
  const typingSpeed = settings?.typingSpeed || 35;

  const currentLine = currentScene?.lines[currentLineIndex];
  const isLastLine = currentLineIndex >= (currentScene?.lines.length ?? 0) - 1;

  const userName = settings?.userName || '玩家';
  const characterName = settings?.characterName || '少女';
  const playerFacingSpeaker = resolvePlayerFacingSpeaker(
    currentLine?.speaker || '',
    currentLine?.character,
    variables,
  );
  const displaySpeaker = applyMacros(playerFacingSpeaker, userName, characterName);
  const displayText = applyMacros(currentLine?.text || '', userName, characterName);

  const { displayedText, isComplete, skip } = useTypewriter(displayText, typingSpeed, true);

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedKnowledgeRef = useRef(new Set<string>());
  const [minimumHoldReady, setMinimumHoldReady] = useState(true);
  const [advanceHintDone, setAdvanceHintDone] = useState(
    () => window.localStorage.getItem('farewell.advance-hint.done') === 'true',
  );

  useEffect(() => {
    const minimumDisplayMs = currentLine?.minimumDisplayMs ?? 0;
    if (minimumDisplayMs <= 0) {
      setMinimumHoldReady(true);
      return;
    }
    setMinimumHoldReady(false);
    const timer = window.setTimeout(() => setMinimumHoldReady(true), minimumDisplayMs);
    return () => window.clearTimeout(timer);
  }, [currentLine?.minimumDisplayMs, currentLineIndex, currentScene?.id]);

  /* ── 自动模式推进 ── */
  useEffect(() => {
    if (autoMode && isComplete && minimumHoldReady && currentLine && !isLastLine) {
      autoTimerRef.current = setTimeout(() => handleAdvance(), autoIntervalMs);
    }
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [autoMode, isComplete, minimumHoldReady, currentLineIndex, currentScene, autoIntervalMs]);

  /* ── 场景完成检测 ── */
  useEffect(() => {
    if (isComplete && isLastLine && currentScene) {
      setSceneComplete(true);
    }
  }, [isComplete, isLastLine, currentScene, setSceneComplete]);

  /* ── 台词知识事件提交 ── */
  useEffect(() => {
    if (!isComplete || !currentLine?.knowledgeEvents?.length || !currentScene) return;
    commitKnowledgeEvents(currentLine.knowledgeEvents, `${currentScene.id}:${currentLineIndex}`, committedKnowledgeRef.current);
  }, [currentLine, currentLineIndex, currentScene, isComplete]);

  const handleAdvance = useCallback(() => {
    if (!currentScene) return;
    if (!isComplete) { skip(); return; }
    if (!minimumHoldReady) return;
    if (currentLineIndex < currentScene.lines.length - 1) {
      setCurrentLineIndex(currentLineIndex + 1);
    }
  }, [currentScene, currentLineIndex, isComplete, minimumHoldReady, skip, setCurrentLineIndex]);

  const handleStartOrAdvance = useCallback(() => {
    if (!advanceHintDone) {
      window.localStorage.setItem('farewell.advance-hint.done', 'true');
      setAdvanceHintDone(true);
    }
    if (!currentScene) {
      const state = useGameStore.getState();
      const chat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);
      setCurrentScene(rebuildSceneFromChat(chat) ?? parseOpeningStoryline());
      return;
    }
    handleAdvance();
  }, [currentScene, handleAdvance, setCurrentScene, advanceHintDone]);

  const handleDialogueClick = useCallback(() => {
    playSfx('dialogue-advance');
    handleStartOrAdvance();
  }, [handleStartOrAdvance]);

  /* ── 快进：跳到最后一行，途中台词的知识事件照常提交 ── */
  const handleFastForward = useCallback(() => {
    if (!currentScene) return;
    if (!minimumHoldReady) {
      if (!isComplete) skip();
      return;
    }
    if (currentLineIndex < currentScene.lines.length - 1) {
      currentScene.lines.slice(currentLineIndex, -1).forEach((line, offset) => {
        if (line.knowledgeEvents?.length) {
          commitKnowledgeEvents(line.knowledgeEvents, `${currentScene.id}:${currentLineIndex + offset}`, committedKnowledgeRef.current);
        }
      });
      setCurrentLineIndex(currentScene.lines.length - 1);
    } else if (!isComplete) {
      skip();
    }
  }, [currentScene, currentLineIndex, isComplete, minimumHoldReady, skip, setCurrentLineIndex]);

  /* ── 重头回看：回到第一句，恢复首帧状态 ── */
  const handleRestart = useCallback(() => {
    if (!currentScene || currentScene.lines.length === 0) return;
    setCurrentLineIndex(0);
    setSceneComplete(false);
    const firstLine = currentScene.lines[0];
    setCurrentState({
      background: firstLine.background || null,
      bgm: firstLine.bgm || null,
      character: firstLine.character ?? null,
      mood: firstLine.emotion || 'calm',
      effect: firstLine.effect || null,
      environment: resolveSceneEnvironment(firstLine.background),
      item: firstLine.item || null,
    });
  }, [currentScene, setCurrentLineIndex, setSceneComplete, setCurrentState]);

  const handleToggleAuto = useCallback(() => {
    setAutoMode(!autoMode);
  }, [autoMode, setAutoMode]);

  /* ── 同步当前行状态 ── */
  useEffect(() => {
    if (!currentLine) return;
    setCurrentState({
      background: currentLine.background || null,
      bgm: currentLine.bgm || null,
      character: currentLine.character ?? null,
      mood: currentLine.emotion || 'calm',
      effect: currentLine.effect || null,
      environment: resolveSceneEnvironment(currentLine.background),
      item: currentLine.item || null,
    });
    setIsTyping(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIndex, currentScene]);

  useEffect(() => { if (isComplete) setIsTyping(false); }, [isComplete, setIsTyping]);

  /* ── 键盘推进（输入框聚焦或有弹窗时不响应，避免误推进） ── */
  useEffect(() => {
    function isAdvanceBlocked() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return true;
      const { ui, game } = useGameStore.getState();
      if (ui.showSettings || ui.showLorebook || ui.showPreset || ui.showHistory || ui.showMap
        || ui.showClues || ui.showCharacters || ui.showConclusion || ui.showEndingEditor || ui.showApiGuide
        || ui.showTitle || ui.showPromptInspector || ui.showOrchestrationLog) return true;
      if (game.actionPanel.visible || game.endingPanel.visible) return true;
      // SaveModal 状态在组件内部，只能从 DOM 判断
      return !!document.querySelector('.save-modal-shell');
    }
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (isAdvanceBlocked()) return;
        e.preventDefault();
        handleStartOrAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStartOrAdvance]);

  /* ── 舞台点击推进（GameCanvas 派发） ── */
  useEffect(() => {
    const onStageAdvance = () => {
      playSfx('dialogue-advance');
      handleStartOrAdvance();
    };
    window.addEventListener('farewell:advance-dialogue', onStageAdvance);
    return () => window.removeEventListener('farewell:advance-dialogue', onStageAdvance);
  }, [handleStartOrAdvance]);

  const showNextArrow = isComplete && !isLastLine;
  const isNarrator = currentLine?.speaker === '旁白';
  const showSpeaker = !isNarrator && displaySpeaker;

  /* 初始状态（无场景） */
  if (!currentScene || !currentLine) {
    return (
      <PixelPanel onClick={handleDialogueClick}>
        <div className="text-center cursor-pointer" style={{ color: TEXT_DIM, fontSize: '27px', fontFamily: '"MuzaiPixel", "LXGW WenKai", serif' }}>
          {isWaitingForAI ? '等待AI回应…' : '点击开始游戏'}
        </div>
      </PixelPanel>
    );
  }

  const speakerTag = showSpeaker ? (
    <>
      <PixelTag text={displaySpeaker} />
      {currentLine.emotion && currentLine.emotion !== 'calm' && (
        <span
          className="ml-2"
          style={{ fontSize: '17px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.15em' }}
        >
          [{emotionLabel(currentLine.emotion)}]
        </span>
      )}
    </>
  ) : undefined;

  return (
    <PixelPanel
      complete={sceneComplete}
      topLeft={speakerTag}
      onClick={handleDialogueClick}
      controls={
        <>
          <PixelIconBtn
            active={autoMode}
            onClick={(e) => { e.stopPropagation(); handleToggleAuto(); }}
            icon={autoMode ? <GameIcon name="play" size={21} /> : <GameIcon name="pause" size={21} />}
            label={autoMode ? '自动' : '手动'}
          />
          <PixelIconBtn
            onClick={(e) => { e.stopPropagation(); handleFastForward(); }}
            icon={<GameIcon name="fastForward" size={21} />}
            label="快进"
          />
          {sceneComplete && (
            <PixelIconBtn
              onClick={(e) => { e.stopPropagation(); handleRestart(); }}
              icon={<GameIcon name="restart" size={21} />}
              label="重头回看"
            />
          )}
        </>
      }
    >
      {/* 主文本 */}
      <div
        className={`dialogue-text whitespace-pre-wrap select-none ${emotionTextClass(currentLine.emotion)}`}
        style={{
          fontSize: '33px',
          lineHeight: 1.8,
          color: TEXT_MAIN,
          fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
          ...emotionTextStyle(currentLine.emotion),
        }}
      >
        {displayedText}
        {!isComplete && (
          <span
            className="inline-block align-middle"
            style={{
              width: '4px',
              height: '1.1em',
              background: ACCENT,
              marginLeft: '6px',
              animation: 'cursorBlink 0.75s infinite',
            }}
          />
        )}
        {showNextArrow && (
          <span className="inline-block ml-2" style={{ color: ACCENT, animation: 'pulse 0.8s infinite' }}>
            <GameIcon name="back" size={27} style={{ transform: 'rotate(-90deg)' }} />
          </span>
        )}
      </div>
      {!advanceHintDone && isComplete && (
        <span
          className="pointer-events-none absolute bottom-2 right-3 select-none"
          style={{
            fontSize: '17px',
            color: TEXT_DIM,
            fontFamily: '"MuzaiPixel", monospace',
            letterSpacing: '0.12em',
            animation: 'pulse 1.6s infinite',
          }}
        >
          点击或按空格继续
        </span>
      )}
    </PixelPanel>
  );
}
