import { useState, useEffect, useCallback, useRef } from 'react';

export function useTypewriter(text: string, speed: number = 35, enabled: boolean = true) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const start = useCallback(() => {
    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);
  }, []);

  const skip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setDisplayedText(text);
    setIsComplete(true);
  }, [text]);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    indexRef.current = 0;
    setDisplayedText('');
    setIsComplete(false);

    const typeNext = () => {
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
  }, [text, speed, enabled]);

  return { displayedText, isComplete, start, skip };
}
