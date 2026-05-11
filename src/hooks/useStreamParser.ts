import { useState, useCallback } from 'react';
import { createParseState, parseChunk, isComplete } from '../sillytavern/stream-parser';
import type { ParseState } from '../sillytavern/stream-parser';

export function useStreamParser(requiredTags?: string[]) {
  const [state, setState] = useState<ParseState>(createParseState);
  const [isDone, setIsDone] = useState(false);

  const feed = useCallback((token: string) => {
    setState(prev => {
      const next = parseChunk({ ...prev }, token);
      if (isComplete(next, requiredTags)) {
        setIsDone(true);
      }
      return next;
    });
  }, [requiredTags]);

  const reset = useCallback(() => {
    setState(createParseState());
    setIsDone(false);
  }, []);

  return {
    parsed: state.parsed,
    isDone,
    feed,
    reset,
  };
}
