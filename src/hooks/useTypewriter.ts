import { useState, useEffect, useCallback, useRef } from 'react';

export function useTypewriter(text: string, speed: number = 35, enabled: boolean = true, playbackKey: string = text, paused: boolean = false) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [source, setSource] = useState({ text, playbackKey });
  const indexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const start = useCallback(() => {
    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);
  }, []);

  const skip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setSource({ text, playbackKey });
    setDisplayedText(text);
    setIsComplete(true);
  }, [text, playbackKey]);

  useEffect(() => {
    setSource({ text, playbackKey });
    if (!enabled) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);

    const typeNext = () => {
      if (pausedRef.current) {
        timeoutRef.current = setTimeout(typeNext, Math.max(50, speed));
        return;
      }
      if (indexRef.current < text.length) {
        indexRef.current++;
        setDisplayedText(text.slice(0, indexRef.current));
        timeoutRef.current = setTimeout(typeNext, speed);
      } else {
        setIsComplete(true);
      }
    };

    timeoutRef.current = setTimeout(typeNext, speed);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, speed, enabled, playbackKey]);

  // A new line must never inherit the previous line's completed state during
  // the render before this effect resets the typewriter.
  const current = source.text === text && source.playbackKey === playbackKey;
  return {
    displayedText: !enabled ? text : current ? displayedText : '',
    isComplete: !enabled || (current && isComplete),
    start,
    skip,
  };
}
