// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { HudViewport } from './HudViewport';
import { MapModal } from './MapModal';

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const originalMatchMedia = window.matchMedia;
  const query = {
    matches: initialMatches,
    media: '(max-width: 700px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => query) });

  return {
    query,
    change(matches: boolean) {
      (query as { matches: boolean }).matches = matches;
      act(() => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent)));
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    },
  };
}

function renderMapInGameCanvas() {
  return render(
    <div className="game-canvas">
      <HudViewport><MapModal /></HudViewport>
    </div>,
  );
}

describe('MapModal', () => {
  const initialState = useGameStore.getState();
  let media: ReturnType<typeof mockMatchMedia> | null = null;

  afterEach(() => {
    cleanup();
    media?.restore();
    media = null;
    useGameStore.setState(initialState, true);
  });

  it('uses the shared map dialog shell and explains that the current location cannot be traveled to', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    expect(screen.getByRole('dialog', { name: '地图' })).toHaveClass('pixel-modal-shell');
    expect(screen.getByText(/当前位置：/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已经抵达' })).toBeDisabled();
  });

  it('keeps the travel button tied to the existing travel availability predicates with explanatory labels', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    const travelButton = screen.getByRole('button', { name: '前往此处' });
    expect(travelButton).toBeEnabled();

    act(() => useGameStore.getState().actions.setIsWaitingForAI(true));
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsWaitingForAI(false);
      useGameStore.getState().actions.setIsTyping(true);
    });
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsTyping(false);
      useGameStore.getState().actions.setGameStatus({ stamina: 0 });
    });
    expect(screen.getByRole('button', { name: '体力不足' })).toBeDisabled();
  });

  it('explains when a rumored location still needs confirmation', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          knowledgeEvents: [...(state.tavern.variables.knowledgeEvents as string[]), 'find:water-tower-fragment'],
        },
      },
    }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '山中的旧设施？' }));
    expect(screen.getByRole('button', { name: '需要确认位置' })).toBeDisabled();
  });

  it('keeps map controls reachable inside the HUD canvas', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<HudViewport><MapModal /></HudViewport>);

    fireEvent.click(screen.getByRole('button', { name: '关闭地图' }));
    expect(useGameStore.getState().ui.showMap).toBe(false);
  });

  it('portals the single map dialog outside the scaled HUD canvas at the narrow breakpoint', () => {
    media = mockMatchMedia(true);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { container } = renderMapInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: '地图' });

    expect(dialog.parentElement).toHaveClass('game-canvas');
    expect(hud).not.toContainElement(dialog);
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);
  });

  it('moves the same selected destination across narrow and desktop portal transitions', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { container } = renderMapInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(within(hud).getByRole('dialog', { name: '地图' })).toBeInTheDocument();

    media.change(true);
    expect(hud).not.toContainElement(screen.getByRole('dialog', { name: '地图' }));
    expect(screen.getByRole('dialog', { name: '地图' }).parentElement).toHaveClass('game-canvas');
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);

    media.change(false);
    expect(within(hud).getByRole('dialog', { name: '地图' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);
  });

  it('removes its media-query listener when unmounted', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { unmount } = renderMapInGameCanvas();

    expect(media.query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('anchors the desktop board to the approved map geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*top:\s*122px;[^}]*left:\s*90px;[^}]*width:\s*1460px;[^}]*height:\s*738px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.map-modal-map\s*\{[^}]*width:\s*1354px;[^}]*height:\s*385px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\.pixel-modal-shell\s*\{[^}]*pointer-events:\s*auto;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-header\s*\{[^}]*gap:\s*20px;[^}]*padding:\s*28px 56px 28px 50px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-close\s*\{[^}]*top:\s*43px;[^}]*right:\s*56px;[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*\.map-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;[^}]*left:\s*auto;[^}]*width:\s*100%/);
  });
});
