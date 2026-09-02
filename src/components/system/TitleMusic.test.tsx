// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '../../stores/gameStore';
import { TitleMusic } from './TitleMusic';

describe('TitleMusic autoplay recovery', () => {
  const initialState = useGameStore.getState();
  const play = vi.fn<() => Promise<void>>();
  const pause = vi.fn();

  beforeEach(() => {
    play.mockReset();
    pause.mockReset();
    class AudioDouble {
      loop = false;
      volume = 0;
      play = play;
      pause = pause;
    }
    vi.stubGlobal('Audio', AudioDouble);
    useGameStore.setState(state => ({
      ui: { ...state.ui, titleRevealed: true },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useGameStore.setState(initialState, true);
  });

  it('retries title music on the next user interaction after autoplay is blocked', async () => {
    play
      .mockRejectedValueOnce(new Error('autoplay blocked'))
      .mockResolvedValueOnce(undefined);

    render(<TitleMusic />);

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 0));
    });
    fireEvent.click(document);

    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });
});
