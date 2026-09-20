// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTypewriter } from './useTypewriter';

describe('useTypewriter source boundaries', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  it('does not carry completion into a new line with identical text', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ key }) => useTypewriter('相同的台词', 1, true, key), { initialProps: { key: 'line-1' } });
    act(() => vi.advanceTimersByTime(20));
    expect(result.current.isComplete).toBe(true);
    rerender({ key: 'line-2' });
    expect(result.current.displayedText).toBe('');
    expect(result.current.isComplete).toBe(false);
  });
});
