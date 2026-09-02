// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '../../stores/gameStore';
import { OpeningVideo } from './OpeningVideo';

describe('OpeningVideo handoff', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    useGameStore.setState(state => ({
      ui: { ...state.ui, introPlayed: false, titleRevealed: false },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useGameStore.setState(initialState, true);
  });

  it('finishes opening 014 once and reveals the title when playback ends', () => {
    const onEnded = vi.fn();
    const { container } = render(<OpeningVideo onEnded={onEnded} />);
    const opening = container.querySelector<HTMLVideoElement>('video:not([aria-hidden="true"])');

    expect(opening?.getAttribute('src')).toBe('/assets/video/opening-014.mp4');
    expect(opening?.classList.contains('object-cover')).toBe(true);

    fireEvent.ended(opening!);
    fireEvent.ended(opening!);

    expect(useGameStore.getState().ui.introPlayed).toBe(true);
    expect(useGameStore.getState().ui.titleRevealed).toBe(true);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('uses the same completion path when the player skips', () => {
    const onEnded = vi.fn();
    const { container } = render(<OpeningVideo onEnded={onEnded} />);
    const overlay = container.firstElementChild as HTMLElement;
    const opening = container.querySelector<HTMLVideoElement>('video:not([aria-hidden="true"])');

    fireEvent.click(overlay);
    fireEvent.ended(opening!);

    expect(useGameStore.getState().ui.introPlayed).toBe(true);
    expect(useGameStore.getState().ui.titleRevealed).toBe(true);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('preloads the silent title loop while opening 014 is playing', () => {
    const { container } = render(<OpeningVideo onEnded={() => undefined} />);
    const preload = container.querySelector<HTMLVideoElement>('video[aria-hidden="true"]');

    expect(preload?.getAttribute('src')).toBe('/assets/video/title-loop-009.mp4');
    expect(preload?.preload).toBe('auto');
    expect(preload?.muted).toBe(true);
  });
});
