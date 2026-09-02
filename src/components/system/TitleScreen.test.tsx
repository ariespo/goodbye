// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TitleScreen } from './TitleScreen';

const mocks = vi.hoisted(() => ({
  startNewGame: vi.fn(),
  toggleModal: vi.fn(),
  addNotification: vi.fn(),
  openSaveModal: vi.fn(),
}));

vi.mock('../../stores/gameStore', () => ({
  useGameStore: (selector: (state: unknown) => unknown) => selector({
    ui: { showTitle: true },
    actions: {
      toggleModal: mocks.toggleModal,
      addNotification: mocks.addNotification,
    },
  }),
}));

vi.mock('../../utils/gameSession', () => ({ startNewGame: mocks.startNewGame }));
vi.mock('./saveModalEvents', () => ({ openSaveModal: mocks.openSaveModal }));
vi.mock('./FilmStrip', () => ({
  FilmStrip: ({ position }: { position: string }) => <div data-testid={`film-strip-${position}`} />,
}));
vi.mock('./FullScreenGrain', () => ({ FullScreenGrain: () => <div data-testid="grain" /> }));

describe('TitleScreen surveillance layout', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startNewGame.mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('plays the silent title loop while keeping the film strips and title artwork', () => {
    const { container } = render(<TitleScreen />);
    const background = container.querySelector<HTMLVideoElement>('video');

    expect(background?.getAttribute('src')).toBe('/assets/video/title-loop-009.mp4');
    expect(background?.autoplay).toBe(true);
    expect(background?.muted).toBe(true);
    expect(background?.loop).toBe(true);
    expect(background?.hasAttribute('playsinline')).toBe(true);
    expect(background?.classList.contains('object-cover')).toBe(true);
    expect(background?.getAttribute('poster')).toBe('/assets/title/title-bg-v2.png');
    expect(screen.getByTestId('film-strip-top')).toBeTruthy();
    expect(screen.getByTestId('film-strip-bottom')).toBeTruthy();
    expect(container.querySelector('.title-surveillance-canvas')).not.toBeNull();
    expect(container.querySelector('img[src*="title-lockup-surveillance-clean.png"]')).not.toBeNull();
    expect(container.querySelector('img[src*="title-monitor-status-story-time.png"]')).not.toBeNull();
    expect(container.querySelectorAll('.title-viewfinder-corner')).toHaveLength(4);
    expect(screen.getByText('REC，CAM 03，2024-09-09 08:00，LOOP')).toBeTruthy();
    expect(screen.queryByText(/2024-06-02|LOOP 01\/08/)).toBeNull();
  });

  it('keeps all three title actions interactive in the new horizontal menu', () => {
    const { container } = render(<TitleScreen />);

    const start = screen.getByRole('button', { name: '开始游戏' });
    const settings = screen.getByRole('button', { name: '设置' });
    const load = screen.getByRole('button', { name: '进入轮回' });

    expect(container.querySelector('.title-surveillance-menu')).not.toBeNull();
    fireEvent.click(start);
    fireEvent.click(settings);
    fireEvent.click(load);

    expect(mocks.startNewGame).toHaveBeenCalledTimes(1);
    expect(mocks.toggleModal).toHaveBeenCalledWith('settings');
    expect(mocks.openSaveModal).toHaveBeenCalledWith('load');
  });

  it('centers the 1672×941 canvas with a numeric scale in a 1469×1268 viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1469 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1268 });

    const { container } = render(<TitleScreen />);
    const canvas = container.querySelector<HTMLElement>('.title-surveillance-canvas');

    expect(canvas?.style.width).toBe('1672px');
    expect(canvas?.style.height).toBe('941px');
    expect(canvas?.style.left).toBe('0px');
    expect(Number.parseFloat(canvas?.style.top || '')).toBeCloseTo((1268 - 941 * (1469 / 1672)) / 2, 8);
    expect(canvas?.style.transform).toBe(`scale(${1469 / 1672})`);
  });
});
