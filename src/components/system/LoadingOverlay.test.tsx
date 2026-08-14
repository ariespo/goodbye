// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { LoadingOverlay } from './LoadingOverlay';

describe('LoadingOverlay', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('uses the world simulation copy and a six-frame pixel hourglass while waiting', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, isWaitingForAI: true },
      api: { ...state.api, isStreaming: true },
    }));

    const { container } = render(<LoadingOverlay />);
    const html = container.innerHTML;

    expect(html).toContain('世界推演中');
    expect(html).not.toContain('天道');
    expect(html).toContain('data-frame-count="6"');
    expect(html).toContain('aria-label="世界推演中，沙漏运转"');
  });
});
