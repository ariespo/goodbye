// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ActionPanel } from './ActionPanel';
import { HudViewport } from './HudViewport';

const loopMocks = vi.hoisted(() => ({ performAction: vi.fn(), sendMessage: vi.fn() }));

vi.mock('../../hooks/useGameLoop', () => ({
  useGameLoop: () => loopMocks,
}));

const scene: Scene = {
  id: 'action-panel-test',
  lines: [{ speaker: '旁白', text: '测试场景' }],
  observe: '窗边有异常痕迹。',
  investigateItems: [{
    desc: '检查窗台',
    suspect: '未知',
    style: '现实',
    time: '10分钟',
    stamina: 1,
    sanity: 0,
  }],
  actionItems: [{
    desc: '推开窗户',
    style: '现实',
    time: '5分钟',
    stamina: 1,
    sanity: 0,
  }],
};

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
    change(matches: boolean) {
      (query as { matches: boolean }).matches = matches;
      act(() => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent)));
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    },
  };
}

describe('ActionPanel', () => {
  const initialState = useGameStore.getState();
  let media: ReturnType<typeof mockMatchMedia> | null = null;

  afterEach(() => {
    cleanup();
    media?.restore();
    media = null;
    loopMocks.performAction.mockReset();
    loopMocks.sendMessage.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('renders investigate actions in the compact pixel dialog and executes the selected item', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'investigate', content: '', selectedIndex: null },
      },
    }));

    render(<ActionPanel />);

    const dialog = screen.getByRole('dialog', { name: '调查' });
    expect(dialog).toHaveClass('pixel-modal-shell', 'is-compact');
    expect(screen.getByText('AVAILABLE INTERACTIONS / 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /检查窗台/ }));
    expect(loopMocks.performAction).toHaveBeenCalledWith('investigate', 0);
  });

  it('closes through the shared dialog header without changing other game state', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'investigate', content: '', selectedIndex: null },
      },
    }));

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: '关闭调查' }));

    expect(useGameStore.getState().game.actionPanel.visible).toBe(false);
    expect(useGameStore.getState().game.currentScene).toEqual(scene);
  });

  it('keeps observation clue organization available in the compact panel', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        actionPanel: {
          visible: true,
          type: 'observe',
          content: '[线索] 窗台上有一枚不属于你的湿鞋印。',
          selectedIndex: null,
        },
      },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: [] } },
    }));

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /整理线索/ }));

    expect(useGameStore.getState().tavern.variables.organizedClues).toEqual([
      expect.objectContaining({
        title: '窗台上有一枚不属于你的湿鞋印。',
        description: '窗台上有一枚不属于你的湿鞋印。',
        source: '观察',
      }),
    ]);
  });

  it('executes action routes with an action-specific accessible label', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'act', content: '', selectedIndex: null },
      },
    }));

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: '执行行动 推开窗户' }));

    expect(loopMocks.performAction).toHaveBeenCalledWith('actions', 0);
  });

  it('retains the final visible investigation payload for the full 220ms close phase', () => {
    vi.useFakeTimers();
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'investigate', content: '', selectedIndex: null },
      },
    }));

    render(<ActionPanel />);
    const timeoutSpy = vi.spyOn(window, 'setTimeout');
    act(() => useGameStore.getState().actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null }));

    expect(timeoutSpy.mock.calls.filter(([, delay]) => delay === 220)).toHaveLength(1);

    act(() => vi.advanceTimersByTime(219));
    expect(screen.getByRole('dialog', { name: '调查' })).toHaveClass('is-closing');
    expect(screen.getByText('检查窗台')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('dialog', { name: '调查' })).toBeNull();
    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('portals one action dialog outside the scaled HUD on narrow screens without resetting item view state', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'investigate', content: '', selectedIndex: null },
      },
    }));

    const { container } = render(<div className="game-canvas"><HudViewport><ActionPanel /></HudViewport></div>);
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: '查看文穗的纸条' }));
    expect(screen.getByText('文穗的纸条')).toBeInTheDocument();
    expect(within(hud).getByRole('dialog', { name: '调查' })).toBeInTheDocument();

    media.change(true);
    const dialog = screen.getByRole('dialog', { name: '调查' });
    expect(dialog.parentElement).toHaveClass('game-canvas');
    expect(hud).not.toContainElement(dialog);
    expect(screen.getAllByRole('dialog', { name: '调查' })).toHaveLength(1);
    expect(screen.getByText('文穗的纸条')).toBeInTheDocument();

    media.change(false);
    expect(within(hud).getByRole('dialog', { name: '调查' })).toBeInTheDocument();
    expect(screen.getByText('文穗的纸条')).toBeInTheDocument();
  });

  it('closes an open item viewer when the action panel is externally hidden', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        actionPanel: { visible: true, type: 'investigate', content: '', selectedIndex: null },
      },
    }));

    render(<ActionPanel />);
    fireEvent.click(screen.getByRole('button', { name: '查看文穗的纸条' }));
    expect(screen.getByText('文穗的纸条')).toBeInTheDocument();

    act(() => useGameStore.getState().actions.setActionPanel({ visible: false, type: null, content: '', selectedIndex: null }));
    expect(screen.queryByText('文穗的纸条')).toBeNull();
  });

  it('keeps the desktop content list scrollable at its exact BOARD_ACTIONS geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-header\s*\{[^}]*height:\s*135px;[^}]*gap:\s*28px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-content\.action-panel-content\.pixel-scroll-blue\s*\{[^}]*overflow-y:\s*auto !important;[^}]*padding:\s*30px 36px 32px 58px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-close\s*\{[^}]*top:\s*45px;[^}]*right:\s*36px;[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-header::after\s*\{[^}]*right:\s*36px;[^}]*left:\s*58px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-title\s*\{[^}]*font-size:\s*32px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.action-panel\s+\.pixel-modal-meta\s*\{[^}]*font-size:\s*16px;/);
  });
});
