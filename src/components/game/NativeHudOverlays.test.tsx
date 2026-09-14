// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { ActionPanel } from './ActionPanel';
import { ClueModal } from './ClueModal';
import { FreeActionDialog } from './FreeActionDialog';
import { HudViewport } from './HudViewport';
import { MapModal } from './MapModal';

vi.mock('../../hooks/useGameLoop', () => ({
  useGameLoop: () => ({ sendMessage: vi.fn(), performAction: vi.fn() }),
}));
vi.mock('../../sillytavern/database', () => ({ saveChat: vi.fn() }));

const initialState = useGameStore.getState();

function setViewport(initialWidth: number) {
  const queries: Array<{ maxWidth: number; listeners: Set<(event: MediaQueryListEvent) => void> }> = [];
  vi.stubGlobal('innerWidth', initialWidth);
  vi.stubGlobal('innerHeight', 900);
  // Evaluate the query requested by production code, rather than forcing every
  // breakpoint to match. A 700px query must remain false at 750px.
  vi.stubGlobal('matchMedia', (query: string) => {
    const maxWidth = query.match(/^\(max-width: (\d+)px\)$/);
    if (!maxWidth) throw new Error(`Unexpected media query: ${query}`);
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    queries.push({ maxWidth: Number(maxWidth[1]), listeners });
    return {
      media: query,
      get matches() { return window.innerWidth <= Number(maxWidth[1]); },
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    };
  });
  return (width: number) => act(() => {
    vi.stubGlobal('innerWidth', width);
    window.dispatchEvent(new Event('resize'));
    queries.forEach(({ maxWidth, listeners }) => listeners.forEach(listener =>
      listener({ matches: width <= maxWidth } as MediaQueryListEvent)));
  });
}

function renderOverlays() {
  useGameStore.setState(state => ({
    ui: { ...state.ui, showMap: true, showClues: true },
    game: {
      ...state.game,
      actionPanel: { visible: true, type: 'observe', content: '窗边有异常痕迹。', selectedIndex: null },
    },
    tavern: {
      ...state.tavern,
      variables: { ...state.tavern.variables, organizedClues: [
        { id: 'boundary-clue', title: '湿透的信', description: '信纸边缘有雨水痕迹。', source: '书桌', createdAt: 1 },
      ] },
    },
  }));
  return render(<div className="game-canvas"><HudViewport>
    <MapModal /><ActionPanel /><ClueModal /><FreeActionDialog open onClose={() => {}} />
  </HudViewport></div>);
}

function expectOverlayCoordinates(container: HTMLElement, width: number) {
  const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
  const gameCanvas = container.querySelector('.game-canvas');
  const native = width <= 800;
  expect(hud.style.width).toBe(`${native ? width : 1672}px`);
  if (native) expect(hud.style.transform).toBe('scale(1)');
  else expect(hud.style.transform).not.toBe('scale(1)');
  for (const name of ['地图', '观察', '线索']) {
    const dialogs = screen.getAllByRole('dialog', { name });
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].parentElement).toBe(native ? gameCanvas : hud);
    expect(hud.contains(dialogs[0])).toBe(!native);
  }
  // Free action intentionally stays in the HUD: its existing <=800px rules
  // use the same unscaled viewport coordinates and fluid panel width.
  expect(screen.getByRole('dialog', { name: '自由行动' }).parentElement).toBe(hud);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useGameStore.setState(initialState, true);
});

describe('native HUD overlay coordinates', () => {
  it.each([390, 700, 701, 750, 800, 801, 1280])('uses the correct coordinate space at %ipx', width => {
    setViewport(width);
    const { container } = renderOverlays();
    expectOverlayCoordinates(container, width);
  });

  it('preserves selections and free-action input while crossing the native HUD boundary', () => {
    const resize = setViewport(801);
    const { container } = renderOverlays();
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '选择线索：湿透的信' }));
    fireEvent.change(screen.getByRole('textbox', { name: '自由行动' }), { target: { value: '查看窗台' } });

    for (const width of [800, 750, 390, 801, 1280]) {
      resize(width);
      expectOverlayCoordinates(container, width);
      expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '取消选择线索：湿透的信' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('textbox', { name: '自由行动' })).toHaveValue('查看窗台');
    }
  });
});
