// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '../../stores/gameStore';
import { OpeningVideo } from './OpeningVideo';

describe('OpeningVideo', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    useGameStore.setState(state => ({
      ui: { ...state.ui, introPlayed: false, titleRevealed: false },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useGameStore.setState(initialState, true);
  });

  it('reveals the title and its music when opening 014 finishes', () => {
    const { container } = render(<OpeningVideo onEnded={() => {}} />);
    const video = container.querySelector('video');

    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toBe('/assets/video/opening-014.mp4');

    fireEvent.ended(video!);

    expect(useGameStore.getState().ui.titleRevealed).toBe(true);
  });

  it('marks the removed intro stage complete when opening 014 finishes', () => {
    const { container } = render(<OpeningVideo onEnded={() => {}} />);

    fireEvent.ended(container.querySelector('video')!);

    expect(useGameStore.getState().ui.introPlayed).toBe(true);
  });

  it('uses the same edge-to-edge crop as the title background', () => {
    const { container } = render(<OpeningVideo onEnded={() => {}} />);
    const openingVideo = container.querySelector('video:not([aria-hidden="true"])');

    expect(openingVideo?.classList.contains('object-cover')).toBe(true);
  });
});
