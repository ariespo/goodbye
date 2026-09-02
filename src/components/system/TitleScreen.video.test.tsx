// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '../../stores/gameStore';
import { TitleScreen } from './TitleScreen';

describe('TitleScreen video background', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    useGameStore.setState(state => ({
      ui: { ...state.ui, showTitle: true },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useGameStore.setState(initialState, true);
  });

  it('plays title animation 009 silently in a loop', () => {
    const { container } = render(<TitleScreen />);
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('/assets/video/title-loop-009.mp4');
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
  });
});
