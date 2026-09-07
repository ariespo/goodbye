// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterAnimationPlayer } from './CharacterAnimationPlayer';

const mocks = vi.hoisted(() => ({ preloadImages: vi.fn() }));

vi.mock('../../utils/assetManager', () => ({
  preloadImages: mocks.preloadImages,
}));

describe('CharacterAnimationPlayer fallback alignment', () => {
  beforeEach(() => {
    mocks.preloadImages.mockReset();
    mocks.preloadImages.mockImplementation(() => new Promise(() => undefined));
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  afterEach(cleanup);

  it('centers the fallback frame before the animation asset is ready', () => {
    const { container } = render(
      <CharacterAnimationPlayer
        clip={{
          src: '/sheet.png',
          frames: 2,
          frameMs: [100, 100],
          loop: true,
          holdLastFrame: false,
        }}
        fallbackSrc="/fallback.png"
      />,
    );

    expect(container.querySelector('image')?.getAttribute('preserveAspectRatio'))
      .toBe('xMidYMax meet');
  });

  it('keeps the fallback centered when animation assets fail to load', async () => {
    mocks.preloadImages.mockResolvedValueOnce({ completed: 1, total: 1, failed: 1 });
    const { container } = render(
      <CharacterAnimationPlayer
        clip={{
          src: '/sheet.png',
          frames: 2,
          frameMs: [100, 100],
          loop: true,
          holdLastFrame: false,
        }}
        fallbackSrc="/fallback.png"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-animation-state]')?.getAttribute('data-animation-state'))
        .toBe('fallback');
    });
    expect(container.querySelector('image')?.getAttribute('preserveAspectRatio'))
      .toBe('xMidYMax meet');
  });
});
