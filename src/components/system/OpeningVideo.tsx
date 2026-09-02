import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../../utils/assetUrl';
import { useGameStore } from '../../stores/gameStore';

interface OpeningVideoProps {
  onEnded: () => void;
}

export function OpeningVideo({ onEnded }: OpeningVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [needsInteraction, setNeedsInteraction] = useState(false);
  const setIntroPlayed = useGameStore(state => state.actions.setIntroPlayed);
  const setTitleRevealed = useGameStore(state => state.actions.setTitleRevealed);

  const finishPlayback = useCallback(() => {
    setIsDone(true);
    setIntroPlayed(true);
    setTitleRevealed(true);
    onEnded();
  }, [onEnded, setIntroPlayed, setTitleRevealed]);

  useEffect(() => {
    if (isDone) return;
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlayThrough = () => setCanPlay(true);
    const handleEnded = () => finishPlayback();

    video.addEventListener('canplaythrough', handleCanPlayThrough);
    video.addEventListener('ended', handleEnded);

    const attemptPlay = async () => {
      try {
        video.muted = false;
        await video.play();
      } catch {
        // 浏览器阻止有声自动播放，等待用户交互
        setNeedsInteraction(true);
      }
    };

    attemptPlay();

    return () => {
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
      video.removeEventListener('ended', handleEnded);
    };
  }, [finishPlayback, isDone]);

  const handleClick = () => {
    if (isDone) return;
    const video = videoRef.current;
    if (!video) return;

    if (needsInteraction) {
      // 首次交互：开始播放（有声）
      video.play().catch(() => {});
      setNeedsInteraction(false);
      return;
    }

    // 播放中：跳过视频
    video.pause();
    finishPlayback();
  };

  return (
    <div
      className="fixed inset-0 z-[1001] flex items-center justify-center overflow-hidden bg-black"
      onClick={handleClick}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={assetUrl('assets/video/opening-014.mp4')}
        playsInline
        autoPlay
        muted={false}
        controls={false}
      />
      <video
        aria-hidden="true"
        className="hidden"
        src={assetUrl('assets/video/title-loop-009.mp4')}
        preload="auto"
        muted
      />
      {canPlay && !needsInteraction && (
        <div className="absolute bottom-8 text-[10px] text-white/20 tracking-[0.3em] animate-pulse">
          点击跳过
        </div>
      )}
      {needsInteraction && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-sm tracking-[0.3em] text-white/60 animate-pulse">
            点击任意处开始
          </div>
        </div>
      )}
    </div>
  );
}
