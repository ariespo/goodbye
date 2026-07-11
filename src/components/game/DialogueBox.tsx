import { useEffect, useRef, useCallback, useState } from 'react';

import { useGameStore } from '../../stores/gameStore';
import { playSfx } from '../../utils/sfx';

import { useTypewriter } from '../../hooks/useTypewriter';

import { OPENING_STORYLINE } from '../../engine/opening-storyline';

import { maintextToScene } from '../../engine/scene-parser';

import { GameIcon } from '../ui/GameIcon';

import { PixelFrame } from '../ui/PixelFrame';
import { assetUrl } from '../../utils/assetUrl';
import { resolveCharacterSprite } from '../../utils/characterAssets';



/* ── 像素风对话框 ── */






const TEXT_MAIN = '#d8d4cc';

const TEXT_DIM = '#7a756e';

const ACCENT = '#6b8fc4';



export function DialogueBox() {

  const currentScene = useGameStore(state => state.game.currentScene);

  const currentLineIndex = useGameStore(state => state.game.currentLineIndex);

  const autoMode = useGameStore(state => state.game.autoMode);

  const sceneComplete = useGameStore(state => state.game.sceneComplete);

  const settings = useGameStore(state => state.tavern.settings);

  const isWaitingForAI = useGameStore(state => state.game.isWaitingForAI);
  const activeCharacter = useGameStore(state => state.game.currentState.character);



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

  const displaySpeaker = applyMacros(currentLine?.speaker || '', userName, characterName);

  const displayText = applyMacros(currentLine?.text || '', userName, characterName);



  const { displayedText, isComplete, skip } = useTypewriter(displayText, typingSpeed, true);



  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  /* ── 自动模式推进 ── */

  useEffect(() => {

    if (autoMode && isComplete && currentLine && !isLastLine) {

      autoTimerRef.current = setTimeout(() => handleAdvance(), autoIntervalMs);

    }

    return () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); };

  }, [autoMode, isComplete, currentLineIndex, currentScene, autoIntervalMs]);



  /* ── 场景完成检测 ── */

  useEffect(() => {

    if (isComplete && isLastLine && currentScene) {

      setSceneComplete(true);

    }

  }, [isComplete, isLastLine, currentScene, setSceneComplete]);



  const handleAdvance = useCallback(() => {

    if (!currentScene) return;

    if (!isComplete) { skip(); return; }

    if (currentLineIndex < currentScene.lines.length - 1) {

      setCurrentLineIndex(currentLineIndex + 1);

    }

  }, [currentScene, currentLineIndex, isComplete, skip, setCurrentLineIndex]);



  const handleStartOrAdvance = useCallback(() => {

    if (!currentScene) {

      const state = useGameStore.getState();

      const chat = state.tavern.chats.find(c => c.id === state.tavern.activeChatId);

      if (chat) {

        const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant');

        if (lastAssistant) {

          const maintext = lastAssistant.content.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1]?.trim() || '';

          if (maintext) {

            const scene = maintextToScene(maintext);

            // 只有提取的 scene 有交互数据时才使用它

            if (scene.lines.length > 0 && (scene.observe || scene.investigateItems?.length || scene.actionItems?.length)) {

              setCurrentScene(scene);

              return;

            }

          }

        }

      }

      setCurrentScene(maintextToScene(OPENING_STORYLINE));

      return;

    }

    handleAdvance();

  }, [currentScene, handleAdvance, setCurrentScene]);

  const handleDialogueClick = useCallback(() => {
    playSfx('dialogue-advance');
    handleStartOrAdvance();
  }, [handleStartOrAdvance]);



  /* ── 快进：跳到最后一行 ── */

  const handleFastForward = useCallback(() => {

    if (!currentScene) return;

    // 如果还没到最后一句，直接跳到最后一句

    if (currentLineIndex < currentScene.lines.length - 1) {

      setCurrentLineIndex(currentScene.lines.length - 1);

    } else if (!isComplete) {

      // 已经在最后一句但打字未完成，跳过打字

      skip();

    }

  }, [currentScene, currentLineIndex, isComplete, skip, setCurrentLineIndex]);



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

    });

  }, [currentScene, setCurrentLineIndex, setSceneComplete, setCurrentState]);



  /* ── 切换自动/手动模式 ── */

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

    });

    setIsTyping(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [currentLineIndex, currentScene]);



  useEffect(() => { if (isComplete) setIsTyping(false); }, [isComplete, setIsTyping]);



  /* ── 键盘推进 ── */

  useEffect(() => {

    function onKey(e: KeyboardEvent) {

      if (e.code === 'Space' || e.code === 'Enter') {

        e.preventDefault();

        handleStartOrAdvance();

      }

    }

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);

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
      topLeft={speakerTag}
      portrait={showSpeaker ? activeCharacter : null}
      onClick={handleDialogueClick}
      controls={
        <>
          {/* 自动/手动 */}
          <PixelIconBtn
            active={autoMode}
            onClick={(e) => { e.stopPropagation(); handleToggleAuto(); }}
            icon={autoMode ? <GameIcon name="play" size={21} /> : <GameIcon name="pause" size={21} />}
            label={autoMode ? '自动' : '手动'}
          />
          {/* 快进 */}
          <PixelIconBtn
            onClick={(e) => { e.stopPropagation(); handleFastForward(); }}
            icon={<GameIcon name="fastForward" size={21} />}
            label="快进"
          />
          {/* 重头回看 — 只在场景播放完毕后显示 */}
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


    </PixelPanel>

  );

}



/* ── 像素风面板外壳 ── */



function PixelPanel({
  children,
  topLeft,
  portrait,
  controls,
  onClick,
}: {
  children: React.ReactNode;
  topLeft?: React.ReactNode;
  portrait?: string | null;
  controls?: React.ReactNode;
  onClick?: () => void;
}) {

  return (
    <div
      className="dialogue-panel absolute bottom-[5%] left-1/2 z-20 flex w-[var(--dialogue-panel-width,min(88vw,980px))] -translate-x-1/2 select-none flex-col"
      onClick={onClick}
    >
      {/* 左上角外部标签 */}
      {topLeft && (
        <div className="dialogue-speaker-wrap" style={{ position: 'absolute', top: -44, left: 0, zIndex: 3 }}>
          {topLeft}
        </div>
      )}

      {/* 文本框主体：立绘底部与此层底边贴合；高度限制只作用在文本区 */}
      <div
        className="dialogue-panel-main relative min-h-0 w-full"
        style={{
          minHeight: 'var(--dialogue-panel-min-height, 120px)',
          maxHeight: 'var(--dialogue-panel-max-height, 420px)',
        }}
      >
        <PixelFrame
          variant="dialogue"
          className="h-full w-full"
          contentClassName={`dialogue-frame-content pixel-scroll-blue h-full w-full overflow-y-auto ${portrait ? 'has-dialogue-portrait' : ''}`}
          contentStyle={{ padding: 'var(--dialogue-panel-padding, 20px 28px 18px 28px)' }}
        >
          {children}
        </PixelFrame>
        {portrait && <DialoguePortrait character={portrait} />}
      </div>

      {/* 控制按钮单独一行，不与正文重叠 */}
      {controls && (
        <div
          className="dialogue-controls dialogue-controls-row relative z-[5] mt-2 flex shrink-0 gap-2"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          {controls}
        </div>
      )}
    </div>
  );
}

function DialoguePortrait({ character }: { character: string }) {
  const sprite = resolveCharacterSprite(character);
  const src = sprite.startsWith('http') ? sprite : assetUrl(`assets/characters/${sprite}`);

  return (
    <div className="dialogue-portrait" aria-hidden="true">
      <img className="dialogue-portrait-image" src={src} alt="" />
      <div className="dialogue-portrait-halftone" />
    </div>
  );
}



/* ── 像素风 Speaker 标签（实色背景） ── */



function PixelTag({ text }: { text: string }) {

  return (

    <div

      className="dialogue-speaker-tag inline-flex items-center px-3 py-1"

      style={{

        background: '#1a2d42',

        border: `2px solid rgba(107, 143, 196, 0.5)`,

        color: ACCENT,

        fontSize: '20px',

        fontFamily: '"MuzaiPixel", "LXGW WenKai", serif',

        letterSpacing: '0.15em',

        boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.08), 2px 2px 0 rgba(0,0,0,0.3)',

      }}

    >

      {text}

    </div>

  );

}



/* ── 像素风图标按钮 ── */



function PixelIconBtn({

  icon, label, active, onClick,

}: {

  icon: React.ReactNode; label: string; active?: boolean; onClick: (e: React.MouseEvent) => void;

}) {

  const [hovered, setHovered] = useState(false);



  const state = active ? 'active' : hovered ? 'hover' : 'normal';
  const color = active ? ACCENT : hovered ? ACCENT : TEXT_DIM;



  return (

    <button
      data-cursor="pointer"
      data-active={active ? 'true' : 'false'}
      className="dialogue-control-button flex min-h-[42px] items-center gap-1.5 select-none px-3 transition-[filter,transform] duration-100"
      style={{
        backgroundImage: `url(${assetUrl(`assets/ui/dialogue-control-${state}.png`)})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        color,
        fontSize: '16px',
        fontFamily: '"MuzaiPixel", monospace',
        letterSpacing: '0.08em',
        imageRendering: 'pixelated',
        filter: hovered || active ? 'drop-shadow(0 0 9px rgba(107,143,196,0.28))' : 'drop-shadow(2px 2px 0 rgba(0,0,0,0.35))',
        transform: hovered ? 'translate(1px, 0)' : 'translate(0, 0)',
      }}

      onMouseEnter={() => setHovered(true)}

      onMouseLeave={() => setHovered(false)}

      onClick={onClick}

    >

      {icon}

      {label}

    </button>

  );

}



/* ── 辅助函数 ── */



function emotionLabel(m: string): string {

  const map: Record<string, string> = {

    calm: '平静', horror: '恐惧', insane: '疯狂',

    sad: '悲伤', angry: '愤怒', happy: '开心',

  };

  return map[m] || m;

}



function emotionTextClass(emotion: string | undefined): string {

  switch (emotion) {

    case 'horror': return 'animate-[textHorror_2.5s_infinite]';

    case 'insane': return 'animate-[textInsane_1.5s_infinite]';

    case 'sad': return 'animate-[textSad_3s_infinite_ease-in-out]';

    case 'angry': return 'animate-[textAngry_1.2s_infinite]';

    case 'happy': return 'animate-[textHappy_2s_infinite_ease-in-out]';

    default: return '';

  }

}



function emotionTextStyle(emotion: string | undefined): React.CSSProperties {
  switch (emotion) {
    case 'horror': return { color: '#e8b4b0' };
    case 'insane': return { color: '#c9a0e0' };
    case 'sad': return { color: '#8eb4d8' };
    case 'angry': return { color: '#ef9a8f' };
    case 'happy': return { color: '#e8d08a' };
    default: return { color: '#efefe9' };
  }
}



function applyMacros(s: string, user: string, char: string): string {

  if (!s) return s;

  return s.replace(/\{\{user\}\}/g, user).replace(/\{\{char\}\}/g, char);

}
