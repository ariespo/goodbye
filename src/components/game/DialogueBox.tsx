import { useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react';
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
import { PlayerIdentityPrompt } from './PlayerIdentityPrompt';
import { resolveNpcPlayerKnowledge } from '../../data/npcPlayerKnowledge';
import { projectKnowledgeForPlayback } from '../../utils/knowledgePresentation';
import { getBackgroundById, resolveBackgroundForTime } from '../../data/backgroundAssets';
import { resolveCharacterSprite } from '../../utils/characterAssets';
import { assetUrl } from '../../utils/assetUrl';
import { prefetchImages } from '../../utils/assetManager';
import { paginateDialogueText, resolveDialogueAdvance } from './dialoguePagination';
const PREFETCH_LOOKAHEAD = 2;

function hasOpenDialogueOverlay() {
  const { ui, game } = useGameStore.getState();
  if (Object.entries(ui).some(([key, value]) => key.startsWith('show') && value === true)
    || game.actionPanel.visible || game.endingPanel.isAnimating
    || (game.endingPanel.visible && game.sceneComplete)) return true;
  return Boolean(document.querySelector('[role="dialog"]:not([aria-hidden="true"]), .save-modal-shell, .player-identity-prompt'));
}

function collectLineVisualAssetUrls(
  line: { background?: string | null; character?: string | null; },
  gameTime: Date,
): string[] {
  const urls: string[] = [];
  if (line.background) {
    const resolved = resolveBackgroundForTime(line.background, gameTime);
    const background = getBackgroundById(resolved)?.file ?? resolved;
    urls.push(background.startsWith('http')
      ? background
      : assetUrl(`assets/backgrounds/${background}${background.includes('.') ? '' : '.png'}`));
  }

  if (line.character) {
    const portrait = resolveCharacterSprite(line.character);
    urls.push(portrait.startsWith('http')
      ? portrait
      : assetUrl(`assets/characters/${portrait}`));
  }

  return urls;
}

/* ── 像素风对话框 ── */

export function DialogueBox() {
  const storedScene = useGameStore(state => state.game.currentScene);
  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);
  const autoMode = useGameStore(state => state.game.autoMode);
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const gameTime = useGameStore(state => state.game.gameStatus.time);
  const settings = useGameStore(state => state.tavern.settings);
  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const variables = useGameStore(state => state.tavern.variables);
  const activeChatId = useGameStore(state => state.tavern.activeChatId);
  const dialogueProgress = useGameStore(state => state.game.dialogueProgress);
  const ui = useGameStore(state => state.ui);
  const actionPanelVisible = useGameStore(state => state.game.actionPanel.visible);
  const endingPanel = useGameStore(state => state.game.endingPanel);
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
  const markDialogueSeen = useGameStore(state => state.actions.markDialogueSeen);
  const toggleModal = useGameStore(state => state.actions.toggleModal);
  const [reviewCursor, setReviewCursor] = useState<{
    sceneId: string; lineIndex: number; chatId: string | null; sourceMessageId?: string;
  } | null>(null);
  const isReviewing = reviewCursor !== null && reviewCursor.sceneId === currentScene?.id
    && reviewCursor.chatId === activeChatId && reviewCursor.sourceMessageId === currentScene?.sourceMessageId;
  const viewLineIndex = isReviewing ? Math.min(reviewCursor.lineIndex, currentLineIndex) : currentLineIndex;
  const requestedPageRef = useRef<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(hasOpenDialogueOverlay);

  useEffect(() => {
    const update = () => setOverlayOpen(hasOpenDialogueOverlay());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
    return () => observer.disconnect();
  }, [ui, actionPanelVisible, endingPanel, sceneComplete]);

  const autoIntervalMs = settings?.autoIntervalMs ?? 1500;
  const typingSpeed = settings?.typingSpeed || 35;

  const currentLine = currentScene?.lines[viewLineIndex];
  const liveLine = currentScene?.lines[currentLineIndex];
  const isLastLine = viewLineIndex >= (currentScene?.lines.length ?? 0) - 1;
  const presentationVariables = useMemo(() => projectKnowledgeForPlayback(
    variables,
    currentScene,
    currentLineIndex,
    sceneComplete,
  ), [variables, currentScene, currentLineIndex, sceneComplete]);

  const userName = settings?.userName || '玩家';
  const characterName = settings?.characterName || '少女';
  const playerIdentity = settings?.playerIdentityConfirmed
    && (settings.playerGender === 'male' || settings.playerGender === 'female')
    ? { name: userName, gender: settings.playerGender }
    : undefined;
  const dialogueMacros = playerIdentity ? {
    'player.oldManAddress': resolveNpcPlayerKnowledge('old-man', playerIdentity, presentationVariables).allowedAddress,
    'player.huihuiAddress': resolveNpcPlayerKnowledge('chen-huihui', playerIdentity, presentationVariables).allowedAddress,
  } : {};
  const playerFacingSpeaker = resolvePlayerFacingSpeaker(
    currentLine?.speaker || '',
    currentLine?.character,
    presentationVariables,
  );
  const displaySpeaker = applyMacros(playerFacingSpeaker, userName, characterName, dialogueMacros);
  const fullDisplayText = applyMacros(currentLine?.text || '', userName, characterName, dialogueMacros);
  const displayText = isReviewing && viewLineIndex === currentLineIndex && !sceneComplete
    ? (dialogueProgress?.sceneId === currentScene?.id && dialogueProgress?.lineIndex === currentLineIndex
      ? dialogueProgress.text : '')
    : fullDisplayText;

  const measureRef = useRef<HTMLDivElement>(null);
  const scenePlaybackKey = `${activeChatId}:${currentScene?.sourceMessageId}:${currentScene?.id}`;
  const pageSource = `${scenePlaybackKey}:${viewLineIndex}:${isReviewing}`;
  const [pagination, setPagination] = useState({ text: displayText, source: pageSource, pages: [displayText] });
  const measuredPaginationRef = useRef(pagination);
  const paginationSceneRef = useRef(scenePlaybackKey);
  const dialoguePages = useMemo(() => pagination.text === displayText && pagination.source === pageSource
    ? pagination.pages : [displayText], [pagination, displayText, pageSource]);
  const [dialoguePageIndex, setDialoguePageIndex] = useState(0);
  const activePageIndex = Math.min(dialoguePageIndex, Math.max(0, dialoguePages.length - 1));
  const activePageText = dialoguePages[activePageIndex] ?? displayText;
  const hasNextPage = activePageIndex < dialoguePages.length - 1;
  const { displayedText, isComplete, skip } = useTypewriter(activePageText, typingSpeed, !isReviewing, `${pageSource}:${activePageIndex}`, overlayOpen);

  useLayoutEffect(() => {
    if (paginationSceneRef.current !== scenePlaybackKey) {
      requestedPageRef.current = null;
      paginationSceneRef.current = scenePlaybackKey;
    }
    const measureNode = measureRef.current;
    const frame = measureNode?.parentElement;
    if (!measureNode || !frame) return;

    let active = true;
    const repaginate = () => {
      if (!active) return;
      const style = window.getComputedStyle(frame);
      const availableWidth = frame.clientWidth
        - Number.parseFloat(style.paddingLeft || '0')
        - Number.parseFloat(style.paddingRight || '0');
      const availableHeight = frame.clientHeight
        - Number.parseFloat(style.paddingTop || '0')
        - Number.parseFloat(style.paddingBottom || '0');
      measureNode.style.width = `${availableWidth}px`;
      const nextPages = availableWidth <= 0 || availableHeight <= 0 ? [displayText] : paginateDialogueText(displayText, candidate => {
        measureNode.textContent = candidate || ' ';
        return measureNode.scrollHeight <= availableHeight + 1;
      });
      measureNode.textContent = '';
      const previous = measuredPaginationRef.current;
      const changed = previous.text !== displayText || previous.source !== pageSource
        || previous.pages.length !== nextPages.length || previous.pages.some((page, index) => page !== nextPages[index]);
      const nextPagination = changed ? { text: displayText, source: pageSource, pages: nextPages } : previous;
      measuredPaginationRef.current = nextPagination;
      setPagination(nextPagination);
      const requested = requestedPageRef.current;
      requestedPageRef.current = null;
      // Page numbers are not stable across scenes, fonts or viewport widths.
      // Restart at the first page on reflow; never treat skipped text as read.
      setDialoguePageIndex(previousIndex => requested === -1 ? nextPages.length - 1
        : Math.min(requested ?? (changed ? 0 : previousIndex), nextPages.length - 1));
    };

    repaginate();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(repaginate);
    observer?.observe(frame);
    void document.fonts?.ready.then(repaginate);
    return () => { active = false; observer?.disconnect(); };
  }, [displayText, pageSource, scenePlaybackKey]);

  useEffect(() => {
    if (!isReviewing && displayedText) {
      markDialogueSeen(currentLineIndex, dialoguePages.slice(0, activePageIndex).join('') + displayedText);
    }
  }, [isReviewing, displayedText, currentLineIndex, dialoguePages, activePageIndex, markDialogueSeen]);

  useEffect(() => {
    if (!currentScene) return;
    const urls: string[] = [];
    for (let offset = 1; offset <= PREFETCH_LOOKAHEAD; offset += 1) {
      const line = currentScene.lines[currentLineIndex + offset];
      if (!line) break;
      urls.push(...collectLineVisualAssetUrls(line, gameTime));
    }
    if (urls.length) prefetchImages(urls);
  }, [currentLineIndex, currentScene, gameTime]);

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committedKnowledgeRef = useRef(new Set<string>());
  const [minimumHoldReady, setMinimumHoldReady] = useState(true);
  const [identityPromptOpen, setIdentityPromptOpen] = useState(false);
  const [advanceHintDone, setAdvanceHintDone] = useState(
    () => window.localStorage.getItem('farewell.advance-hint.done') === 'true',
  );
  const requiresIdentityConfirmation = Boolean(
    currentLine?.playerIdentityPrompt && !settings?.playerIdentityConfirmed,
  );

  useEffect(() => {
    const minimumDisplayMs = liveLine?.minimumDisplayMs ?? 0;
    if (minimumDisplayMs <= 0) {
      setMinimumHoldReady(true);
      return;
    }
    setMinimumHoldReady(false);
    const timer = window.setTimeout(() => setMinimumHoldReady(true), minimumDisplayMs);
    return () => window.clearTimeout(timer);
  }, [liveLine?.minimumDisplayMs, currentLineIndex, currentScene?.id]);

  /* ── 场景完成检测 ── */
  useEffect(() => {
    if (!isReviewing && isComplete && !hasNextPage && isLastLine && currentScene && !sceneComplete) {
      setSceneComplete(true);
    }
  }, [isReviewing, isComplete, hasNextPage, isLastLine, currentScene, sceneComplete, setSceneComplete]);

  /* ── 台词知识事件提交 ── */
  useEffect(() => {
    if (isReviewing || !isComplete || hasNextPage || !currentLine?.knowledgeEvents?.length || !currentScene
      || currentScene.knowledgeAlreadyCommitted) return;
    commitKnowledgeEvents(currentLine.knowledgeEvents, `${scenePlaybackKey}:${currentLineIndex}`, committedKnowledgeRef.current);
  }, [isReviewing, currentLine, currentLineIndex, currentScene, isComplete, hasNextPage, scenePlaybackKey]);

  const handleReturnToCurrent = useCallback(() => {
    // The viewport may have changed during review. A saved page number can now
    // point past unread text, so resume at the current sentence's first page.
    requestedPageRef.current = 0;
    setDialoguePageIndex(0);
    setReviewCursor(null);
  }, []);

  const handlePrevious = useCallback(() => {
    if (!currentScene || hasOpenDialogueOverlay() || (viewLineIndex === 0 && activePageIndex === 0)) return;
    setAutoMode(false);
    const previousLine = activePageIndex === 0 ? viewLineIndex - 1 : viewLineIndex;
    requestedPageRef.current = activePageIndex === 0 ? -1 : isReviewing ? null : activePageIndex - 1;
    setDialoguePageIndex(Math.max(0, activePageIndex - 1));
    setReviewCursor({ sceneId: currentScene.id, lineIndex: previousLine, chatId: activeChatId, sourceMessageId: currentScene.sourceMessageId });
  }, [currentScene, viewLineIndex, activePageIndex, isReviewing, setAutoMode, activeChatId]);

  const handleAdvance = useCallback(() => {
    if (!currentScene || hasOpenDialogueOverlay()) return;
    if (isReviewing) {
      if (hasNextPage) setDialoguePageIndex(activePageIndex + 1);
      else if (viewLineIndex + 1 < currentLineIndex) {
        requestedPageRef.current = 0;
        setDialoguePageIndex(0);
        setReviewCursor({ sceneId: currentScene.id, lineIndex: viewLineIndex + 1, chatId: activeChatId, sourceMessageId: currentScene.sourceMessageId });
      } else handleReturnToCurrent();
      return;
    }
    const advance = resolveDialogueAdvance({
      pageComplete: isComplete,
      hasNextPage,
      hasNextLine: currentLineIndex < currentScene.lines.length - 1,
    });
    if (advance === 'finish-page') { skip(); return; }
    if (advance === 'next-page') {
      setDialoguePageIndex(activePageIndex + 1);
      return;
    }
    if (!minimumHoldReady) return;
    if (requiresIdentityConfirmation) {
      setIdentityPromptOpen(true);
      return;
    }
    if (advance === 'next-line') {
      requestedPageRef.current = 0;
      setDialoguePageIndex(0);
      setCurrentLineIndex(currentLineIndex + 1);
    }
  }, [activePageIndex, currentScene, currentLineIndex, hasNextPage, isComplete, minimumHoldReady, requiresIdentityConfirmation, skip, setCurrentLineIndex, isReviewing, viewLineIndex, handleReturnToCurrent, activeChatId]);

  /* ── 自动模式推进 ── */
  useEffect(() => {
    const canAutoAdvance = hasNextPage || !isLastLine;
    if (autoMode && !isReviewing && !overlayOpen && isComplete && minimumHoldReady && currentLine && canAutoAdvance && !requiresIdentityConfirmation) {
      autoTimerRef.current = setTimeout(() => handleAdvance(), autoIntervalMs);
    }
    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };
  }, [autoMode, isReviewing, overlayOpen, isComplete, minimumHoldReady, currentLine, hasNextPage, isLastLine, handleAdvance, autoIntervalMs, requiresIdentityConfirmation]);

  const handleStartOrAdvance = useCallback(() => {
    if (hasOpenDialogueOverlay()) return;
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
    if (!currentScene || hasOpenDialogueOverlay()) return;
    if (isReviewing) { handleReturnToCurrent(); return; }
    if (!settings?.playerIdentityConfirmed) {
      const identityLineIndex = currentScene.lines.findIndex((line, index) => (
        index >= currentLineIndex && line.playerIdentityPrompt
      ));
      if (identityLineIndex >= 0) {
        if (identityLineIndex === currentLineIndex && isComplete) setIdentityPromptOpen(true);
        else {
          requestedPageRef.current = 0;
          setDialoguePageIndex(0);
          setCurrentLineIndex(identityLineIndex);
        }
        return;
      }
    }
    if (!minimumHoldReady) {
      if (!isComplete) skip();
      return;
    }
    if (currentLineIndex < currentScene.lines.length - 1) {
      currentScene.lines.slice(currentLineIndex, -1).forEach((line, offset) => {
        if (!currentScene.knowledgeAlreadyCommitted && line.knowledgeEvents?.length) {
          commitKnowledgeEvents(line.knowledgeEvents, `${scenePlaybackKey}:${currentLineIndex + offset}`, committedKnowledgeRef.current);
        }
      });
      requestedPageRef.current = 0;
      setDialoguePageIndex(0);
      setCurrentLineIndex(currentScene.lines.length - 1);
    } else if (!isComplete) {
      skip();
    } else if (hasNextPage) {
      setDialoguePageIndex(activePageIndex + 1);
    }
  }, [activePageIndex, currentScene, currentLineIndex, hasNextPage, isComplete, minimumHoldReady, settings?.playerIdentityConfirmed, skip, setCurrentLineIndex, isReviewing, handleReturnToCurrent, scenePlaybackKey]);

  /* ── 重头回看：回到第一句，恢复首帧状态 ── */
  const handleRestart = useCallback(() => {
    if (!currentScene || currentScene.lines.length === 0 || hasOpenDialogueOverlay()) return;
    requestedPageRef.current = 0;
    setAutoMode(false);
    setDialoguePageIndex(0);
    setReviewCursor({ sceneId: currentScene.id, lineIndex: 0, chatId: activeChatId, sourceMessageId: currentScene.sourceMessageId });
  }, [currentScene, setAutoMode, activeChatId]);

  const handleToggleAuto = useCallback(() => {
    if (hasOpenDialogueOverlay()) return;
    if (isReviewing) handleReturnToCurrent();
    setAutoMode(!autoMode);
  }, [autoMode, setAutoMode, isReviewing, handleReturnToCurrent]);

  /* ── 同步当前行状态 ── */
  useEffect(() => {
    if (!liveLine) return;
    setCurrentState({
      background: liveLine.background || null,
      bgm: liveLine.bgm || null,
      character: liveLine.character ?? null,
      mood: liveLine.emotion || 'calm',
      effect: liveLine.effect || null,
      environment: resolveSceneEnvironment(liveLine.background),
      item: liveLine.item || null,
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
      return hasOpenDialogueOverlay();
    }
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (e.target instanceof Element && e.target.closest(
          'button, a[href], input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="button"]',
        )) return;
        if (isAdvanceBlocked()) return;
        e.preventDefault();
        if (e.code === 'ArrowLeft') handlePrevious();
        else handleStartOrAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStartOrAdvance, handlePrevious]);

  /* ── 舞台点击推进（GameCanvas 派发） ── */
  useEffect(() => {
    const onStageAdvance = () => {
      if (hasOpenDialogueOverlay()) return;
      playSfx('dialogue-advance');
      handleStartOrAdvance();
    };
    window.addEventListener('farewell:advance-dialogue', onStageAdvance);
    return () => window.removeEventListener('farewell:advance-dialogue', onStageAdvance);
  }, [handleStartOrAdvance]);

  const showNextArrow = isComplete && (hasNextPage || !isLastLine);
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
      <PixelTag text={isReviewing ? `${displaySpeaker} · 回看` : displaySpeaker} />
      {currentLine.emotion && currentLine.emotion !== 'calm' && (
        <span
          className="ml-2"
          style={{ fontSize: '17px', color: TEXT_DIM, fontFamily: '"MuzaiPixel", monospace', letterSpacing: '0.15em' }}
        >
          [{emotionLabel(currentLine.emotion)}]
        </span>
      )}
    </>
  ) : isReviewing ? <PixelTag text="回看 · 已读对话" /> : undefined;

  return (
    <>
    <PixelPanel
      complete={sceneComplete}
      topLeft={speakerTag}
      onClick={handleDialogueClick}
      controls={
        <>
          <PixelIconBtn
            disabled={viewLineIndex === 0 && activePageIndex === 0}
            onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
            icon={<GameIcon name="back" size={21} />}
            label={activePageIndex > 0 ? '上一页' : '上一句'}
          />
          <PixelIconBtn
            disabled={!isReviewing && sceneComplete && isLastLine && !hasNextPage && isComplete}
            onClick={(e) => { e.stopPropagation(); handleStartOrAdvance(); }}
            icon={<GameIcon name="back" size={21} style={{ transform: 'rotate(180deg)' }} />}
            label={!isComplete ? '显示全文' : hasNextPage ? '下一页' : '下一句'}
          />
          <PixelIconBtn
            onClick={(e) => { e.stopPropagation(); toggleModal('history'); }}
            icon={<GameIcon name="history" size={21} />}
            label="对话记录"
          />
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
          {isReviewing ? (
            <PixelIconBtn
              onClick={(e) => { e.stopPropagation(); handleReturnToCurrent(); }}
              icon={<GameIcon name="play" size={21} />}
              label="返回当前"
            />
          ) : sceneComplete && (
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
      <div
        ref={measureRef}
        className={`dialogue-text dialogue-text-measurer whitespace-pre-wrap ${emotionTextClass(currentLine.emotion)}`}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          top: 0,
          left: 0,
          height: 'auto',
          maxHeight: 'none',
          overflow: 'visible',
          fontSize: '33px',
          lineHeight: 1.8,
          fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',
          ...emotionTextStyle(currentLine.emotion),
        }}
      />
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
    {identityPromptOpen && requiresIdentityConfirmation && (
      <div className="player-identity-prompt">
        <PlayerIdentityPrompt
        open
        onConfirmed={() => {
          setIdentityPromptOpen(false);
          if (currentScene && currentLineIndex < currentScene.lines.length - 1) {
            setCurrentLineIndex(currentLineIndex + 1);
          }
        }}
        />
      </div>
    )}
    </>
  );
}
