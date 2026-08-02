import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  clipDuration,
  frameAtElapsed,
  reducedMotionFrame,
  STANDARD_CHARACTER_CANVAS,
  type CharacterAnimationClip,
  type CharacterBlinkClip,
} from '../../engine/character-animation';

interface CharacterAnimationPlayerProps {
  clip: CharacterAnimationClip;
  fallbackSrc: string;
  className?: string;
  style?: CSSProperties;
  onComplete?: () => void;
  ariaHidden?: boolean;
  stopAfterCycle?: boolean;
  tailBlink?: CharacterBlinkClip;
}

export function CharacterAnimationPlayer({
  clip,
  fallbackSrc,
  className,
  style,
  onComplete,
  ariaHidden = true,
  stopAfterCycle = false,
  tailBlink,
}: CharacterAnimationPlayerProps) {
  const [frame, setFrame] = useState(0);
  const [sheetFailed, setSheetFailed] = useState(false);
  const [held, setHeld] = useState(false);
  const [tailBlinkClosed, setTailBlinkClosed] = useState(false);
  const [tailBlinkFrame, setTailBlinkFrame] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const startedAtRef = useRef(0);
  const stopAtElapsedRef = useRef<number | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    setSheetFailed(false);
    completedRef.current = false;
    setHeld(false);
    setTailBlinkClosed(false);
    setTailBlinkFrame(0);
    stopAtElapsedRef.current = null;

    if (reduceMotion) {
      const frame = reducedMotionFrame(clip);
      setFrame(frame);
      setHeld(true);
      if (!clip.loop) queueMicrotask(() => onCompleteRef.current?.());
      return;
    }

    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    let animationFrame = 0;
    const update = (now: number) => {
      const elapsed = now - startedAt;
      const stopAt = stopAtElapsedRef.current;
      if (stopAt !== null && elapsed >= stopAt) {
        const frame = clip.frames - 1;
        setFrame(frame);
        setHeld(true);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }

      const state = frameAtElapsed(clip, elapsed);
      setFrame(state.frame);
      if (state.complete) {
        setHeld(true);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }
      animationFrame = requestAnimationFrame(update);
    };
    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, [clip, reduceMotion]);

  useEffect(() => {
    if (!clip.loop || !stopAfterCycle || held || reduceMotion) return;
    const elapsed = Math.max(0, performance.now() - startedAtRef.current);
    const duration = clipDuration(clip);
    stopAtElapsedRef.current = (Math.floor(elapsed / duration) + 1) * duration;
  }, [clip, held, reduceMotion, stopAfterCycle]);

  useEffect(() => {
    if (!held || !tailBlink || reduceMotion) return;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let frameTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const scheduleBlink = (delay: number) => {
      closeTimer = setTimeout(() => {
        if (cancelled) return;
        setTailBlinkClosed(true);
        setTailBlinkFrame(0);

        const advance = (frameIndex: number) => {
          const duration = tailBlink.frameMs[frameIndex] ?? 60;
          frameTimer = setTimeout(() => {
            if (cancelled) return;
            const nextFrame = frameIndex + 1;
            if (nextFrame < tailBlink.frames) {
              setTailBlinkFrame(nextFrame);
              advance(nextFrame);
              return;
            }
            setTailBlinkClosed(false);
            setTailBlinkFrame(0);
            scheduleBlink(2600);
          }, duration);
        };

        advance(0);
      }, delay);
    };

    scheduleBlink(1450);
    return () => {
      cancelled = true;
      if (closeTimer) clearTimeout(closeTimer);
      if (frameTimer) clearTimeout(frameTimer);
    };
  }, [held, reduceMotion, tailBlink]);

  useEffect(() => {
    const sheet = new Image();
    const blinkImages = tailBlink
      ? (tailBlink.sources ?? [tailBlink.src]).map(source => {
          const image = new Image();
          image.src = source;
          return image;
        })
      : [];
    sheet.onload = () => setSheetFailed(false);
    sheet.onerror = () => setSheetFailed(true);
    sheet.src = clip.src;
    return () => {
      sheet.onload = null;
      sheet.onerror = null;
      blinkImages.forEach(image => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [clip.src, tailBlink]);

  const blinkUsesFrameFiles = Boolean(tailBlink?.sources?.length);
  // A direct frame sequence (currently Touko's approved matte set) supplies
  // its own canonical resting pose. Once the action has settled, keep that
  // first open-eye frame on screen instead of revealing an older action-sheet
  // tail frame between blinks.
  const restOnBlinkSource = held && !tailBlinkClosed && blinkUsesFrameFiles;
  const displayedTailFrame = tailBlinkClosed ? tailBlinkFrame : 0;
  const displayedBlinkHref = tailBlink?.sources?.[displayedTailFrame] ?? tailBlink?.src;
  const displaysFrameFile = (tailBlinkClosed || restOnBlinkSource) && blinkUsesFrameFiles;

  return (
    <div
      className={className}
      data-animation-frame={frame}
      data-animation-blink-frame={tailBlinkClosed ? tailBlinkFrame : undefined}
      data-animation-state={sheetFailed ? 'fallback' : tailBlinkClosed ? 'blink' : held ? 'held' : 'playing'}
      style={style}
      aria-hidden={ariaHidden}
    >
      <svg
        viewBox={`0 0 ${STANDARD_CHARACTER_CANVAS.width} ${STANDARD_CHARACTER_CANVAS.height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMax meet"
        style={{ display: 'block', overflow: 'hidden', imageRendering: 'pixelated' }}
      >
        <image
          href={sheetFailed
            ? fallbackSrc
            : (tailBlinkClosed || restOnBlinkSource) && tailBlink
              ? displayedBlinkHref
              : clip.src}
          x={sheetFailed
            ? 0
            : (tailBlinkClosed || restOnBlinkSource) && tailBlink
              ? blinkUsesFrameFiles ? 0 : -tailBlinkFrame * STANDARD_CHARACTER_CANVAS.width
              : -frame * STANDARD_CHARACTER_CANVAS.width}
          y={0}
          width={sheetFailed
            ? STANDARD_CHARACTER_CANVAS.width
            : (tailBlinkClosed || restOnBlinkSource) && tailBlink
              ? blinkUsesFrameFiles
                ? STANDARD_CHARACTER_CANVAS.width
                : tailBlink.frames * STANDARD_CHARACTER_CANVAS.width
              : clip.frames * STANDARD_CHARACTER_CANVAS.width}
          height={STANDARD_CHARACTER_CANVAS.height}
          preserveAspectRatio={displaysFrameFile ? 'xMidYMax meet' : 'xMinYMin meet'}
          style={{ imageRendering: 'pixelated' }}
        />
      </svg>
    </div>
  );
}
