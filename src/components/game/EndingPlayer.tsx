import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { assetUrl } from '../../utils/assetUrl';
import { GameIcon } from '../ui/GameIcon';
import { maintextToScene } from '../../engine/scene-parser';
import type { Ending, Scene } from '../../sillytavern/types';
import { playSfx } from '../../utils/sfx';

const TEXT_MAIN = '#e8e4dc';
const GOLD = '#d4a853';

type Phase = 'idle' | 'transition' | 'play' | 'outro' | 'menu';

export function EndingPlayer() {
  const sceneComplete = useGameStore(state => state.game.sceneComplete);
  const endingPanel = useGameStore(state => state.game.endingPanel);
  const endings = useGameStore(state => state.game.endings);
  const {
    setEndingPanel,
    setPendingEnding,
    markEndingSeen,
    setAutoMode,
    setCurrentScene,
    setSceneComplete,
    setShowTitle,
  } = useGameStore(state => state.actions);
  const [phase, setPhase] = useState<Phase>('idle');
  const [endingSceneLoaded, setEndingSceneLoaded] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);

  const pendingEnding = useMemo(
    () => endings.find(ending => ending.id === endingPanel.pendingEndingId) ?? null,
    [endings, endingPanel.pendingEndingId]
  );

  const activeEnding = useMemo(
    () => endings.find(ending => ending.id === endingPanel.activeEndingId) ?? null,
    [endings, endingPanel.activeEndingId]
  );

  useEffect(() => {
    if (!sceneComplete || !pendingEnding || endingPanel.visible || phase !== 'idle' || transitionTimerRef.current) return;

    setAutoMode(false);
    playSfx('ending-signal');
    setPhase('transition');
    setEndingPanel({ isAnimating: true });
    const isPreview = endingPanel.isPreview;

    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      setEndingPanel({
        visible: true,
        activeEndingId: pendingEnding.id,
        pendingEndingId: null,
        isAnimating: false,
      });
      setPendingEnding(null);
      if (!isPreview) {
        markEndingSeen(pendingEnding.id);
      }
      setPhase('play');
    }, 2600);
  }, [
    sceneComplete,
    pendingEnding,
    endingPanel.visible,
    endingPanel.isPreview,
    phase,
    setAutoMode,
    setEndingPanel,
    setPendingEnding,
    markEndingSeen,
  ]);

  useEffect(() => () => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!endingPanel.visible || !activeEnding) return;

    let cancelled = false;

    fetch(assetUrl(`assets/endings/${activeEnding.id}.txt`))
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(text => {
        if (!cancelled) {
          setCurrentScene(endingTextToScene(text, activeEnding));
          setSceneComplete(false);
          setEndingSceneLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentScene(endingTextToScene(activeEnding.description || '这个结局还没有写入正文。', activeEnding));
          setSceneComplete(false);
          setEndingSceneLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endingPanel.visible, activeEnding, setCurrentScene, setSceneComplete]);

  useEffect(() => {
    if (phase !== 'play' || !endingSceneLoaded || !sceneComplete || transitionTimerRef.current) return;

    setAutoMode(false);
    playSfx('ending-signal', 0.8);
    setPhase('outro');
    setEndingPanel({ isAnimating: true });
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      setEndingPanel({ isAnimating: false });
      setPhase('menu');
    }, 2200);
  }, [phase, endingSceneLoaded, sceneComplete, setAutoMode, setEndingPanel]);

  const resetEnding = () => {
    setEndingPanel({ visible: false, activeEndingId: null, isAnimating: false, isPreview: false });
    setCurrentScene(null);
    setSceneComplete(false);
    setEndingSceneLoaded(false);
    setPhase('idle');
  };

  const returnToTitle = () => {
    resetEnding();
    setShowTitle(true);
  };

  const openLoadMenu = () => {
    resetEnding();
    window.dispatchEvent(new CustomEvent('farewell:open-save-modal'));
  };

  if (phase === 'transition' || phase === 'outro') {
    return (
      <div className="ending-transition fixed inset-0 z-[260] overflow-hidden bg-black">
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `url(${assetUrl('assets/ui/noise-film.png')}), url(${assetUrl('assets/ui/scanline.png')})`,
            backgroundSize: '180px 180px, 8px 8px',
            imageRendering: 'pixelated',
          }}
        />
        <div className="ending-transition-frame absolute inset-0" />
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <div
            className="mx-auto mb-5 h-px w-[64vw] max-w-[720px]"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(134,168,242,0.75), transparent)' }}
          />
          <div
            className="font-serif-cn text-[clamp(22px,4vw,42px)] tracking-[0.24em]"
            style={{ color: TEXT_MAIN, textShadow: '0 0 18px rgba(134,168,242,0.38)' }}
          >
            {phase === 'outro' ? '故事已抵达它的终点。' : '这一次，时间没有继续倒退。'}
          </div>
          <div
            className="mt-4 font-mono text-[11px] tracking-[0.34em]"
            style={{ color: GOLD }}
          >
            {phase === 'outro' ? 'END OF REEL / MEMORY ARCHIVED' : 'FILM REEL BREAK / ENDING SIGNAL CONFIRMED'}
          </div>
        </div>
      </div>
    );
  }

  if (!endingPanel.visible || !activeEnding) return null;

  if (phase === 'menu') {
    return (
      <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url(${assetUrl('assets/ui/noise-film.png')}), url(${assetUrl('assets/ui/scanline.png')})`,
            backgroundSize: '180px 180px, 8px 8px',
            imageRendering: 'pixelated',
          }}
        />
        <div className="relative flex w-[min(88vw,460px)] flex-col items-center px-8 py-12 text-center">
          <div className="font-mono text-[11px] tracking-[0.32em]" style={{ color: GOLD }}>ENDING RECORDED</div>
          <h2 className="mt-4 font-serif-cn text-[clamp(24px,5vw,40px)] tracking-[0.16em]" style={{ color: TEXT_MAIN }}>
            {activeEnding.name}
          </h2>
          <div className="my-8 h-px w-full bg-gradient-to-r from-transparent via-[#86a8f2]/60 to-transparent" />
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <button
              data-cursor="pointer"
              onClick={returnToTitle}
              className="flex h-[50px] flex-1 items-center justify-center gap-2 px-5 text-sm font-semibold text-[#f4ead2] transition-[color,filter] hover:text-white hover:brightness-125"
              style={{ backgroundImage: `url(${assetUrl('assets/ui/system-button-gold.png')})`, backgroundSize: '100% 100%', cursor: 'pointer', imageRendering: 'pixelated', textShadow: '0 1px 0 #000, 0 0 6px rgba(212,168,83,0.5)' }}
            >
              <GameIcon name="back" size={16} /> 回到标题
            </button>
            <button
              data-cursor="pointer"
              onClick={openLoadMenu}
              className="flex h-[50px] flex-1 items-center justify-center gap-2 px-5 text-sm font-semibold text-[#e8efff] transition-[color,filter] hover:text-white hover:brightness-125"
              style={{ backgroundImage: `url(${assetUrl('assets/ui/system-button-blue.png')})`, backgroundSize: '100% 100%', cursor: 'pointer', imageRendering: 'pixelated', textShadow: '0 1px 0 #000, 0 0 6px rgba(134,168,242,0.55)' }}
            >
              <GameIcon name="save" size={16} /> 读取存档
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    null
  );
}

function endingTextToScene(text: string, ending: Ending): Scene {
  const trimmed = text.trim();
  if (/\b(scene|bgm|music|dialog|dialogue)\s*[|]/i.test(trimmed)) {
    return maintextToScene(trimmed);
  }

  const background = ending.backgroundImage || 'black';
  const bgm = ending.bgm || defaultEndingBgm(ending);
  const lines = [
    `scene|${background}`,
    `bgm|${bgm}`,
    `dialog|旁白|calm|${ending.name}`,
    ...trimmed
      .split(/\n\s*\n/)
      .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map(paragraph => `dialog|旁白|calm|${paragraph}`),
  ];

  return maintextToScene(lines.join('\n'));
}

function defaultEndingBgm(ending: Ending): string {
  if (ending.tag === 'bad') return 'horror';
  if (ending.tag === 'good' || ending.tag === 'true') return 'peace';
  if (ending.tag === 'hidden') return 'silence';
  return 'suspense';
}
