// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizedClue } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ClueModal } from './ClueModal';

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

function renderCluesInGameCanvas() {
  return render(
    <div className="game-canvas">
      <div className="hud-design-canvas"><ClueModal /></div>
    </div>,
  );
}

const loopMocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('../../hooks/useGameLoop', () => ({
  useGameLoop: () => loopMocks,
}));

const clues: OrganizedClue[] = [
  { id: 'clue-1', title: '湿透的信', source: '书桌', description: '信纸边缘有雨水痕迹。', createdAt: 1 },
  { id: 'clue-2', title: '停摆的钟', source: '客厅', description: '时针停在九点。', createdAt: 2 },
];

describe('ClueModal', () => {
  const initialState = useGameStore.getState();
  let media: ReturnType<typeof mockMatchMedia> | null = null;

  afterEach(() => {
    cleanup();
    media?.restore();
    media = null;
    loopMocks.sendMessage.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('renders the empty clue index in the shared pixel dialog shell', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showClues: true },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: [] } },
    }));

    render(<ClueModal />);

    expect(screen.getByRole('dialog', { name: '线索' })).toHaveClass('pixel-modal-shell');
    expect(screen.getByText('ORGANIZED CLUE INDEX 0/6')).toBeInTheDocument();
    expect(screen.getByText('暂无整理线索')).toBeInTheDocument();
  });

  it('sends a deduction prompt and closes after selecting two clues', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showClues: true },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: clues } },
    }));

    render(<ClueModal />);

    fireEvent.click(screen.getByRole('button', { name: '选择线索：湿透的信' }));
    fireEvent.click(screen.getByRole('button', { name: '选择线索：停摆的钟' }));
    fireEvent.click(screen.getByRole('button', { name: '使用已选中的2条线索尝试推理' }));

    expect(loopMocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().ui.showClues).toBe(false);
  });

  it('keeps the parent clue dialog open when clicking inside the deletion confirmation', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showClues: true },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: clues } },
    }));

    render(<ClueModal />);

    fireEvent.click(screen.getAllByRole('button', { name: '删除线索' })[0]);
    fireEvent.click(screen.getByText('确定要删除这条整理过的线索吗？此操作会从当前线索界面中移除它。'));

    expect(screen.getByRole('dialog', { name: '线索' })).toBeInTheDocument();
    expect(useGameStore.getState().ui.showClues).toBe(true);
  });

  it('portals the single clue dialog outside the scaled HUD canvas at the narrow breakpoint', () => {
    media = mockMatchMedia(true);
    useGameStore.setState(state => ({
      ui: { ...state.ui, showClues: true },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: clues } },
    }));

    const { container } = renderCluesInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: '线索' });

    expect(dialog.parentElement).toHaveClass('game-canvas');
    expect(hud).not.toContainElement(dialog);
    expect(screen.getAllByRole('dialog', { name: '线索' })).toHaveLength(1);
  });

  it('preserves selected clues across narrow and desktop portal transitions', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({
      ui: { ...state.ui, showClues: true },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, organizedClues: clues } },
    }));

    const { container } = renderCluesInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: '选择线索：湿透的信' }));
    expect(screen.getByRole('button', { name: '取消选择线索：湿透的信' })).toBeInTheDocument();
    expect(within(hud).getByRole('dialog', { name: '线索' })).toBeInTheDocument();

    media.change(true);
    expect(hud).not.toContainElement(screen.getByRole('dialog', { name: '线索' }));
    expect(screen.getByRole('dialog', { name: '线索' }).parentElement).toHaveClass('game-canvas');
    expect(screen.getByRole('button', { name: '取消选择线索：湿透的信' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog', { name: '线索' })).toHaveLength(1);

    media.change(false);
    expect(within(hud).getByRole('dialog', { name: '线索' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消选择线索：湿透的信' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog', { name: '线索' })).toHaveLength(1);
  });

  it('removes its media-query listener when unmounted', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({ ui: { ...state.ui, showClues: true } }));

    const { unmount } = renderCluesInGameCanvas();

    expect(media.query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('anchors the PC clue board to the approved 1420 by 700 HUD geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*width:\s*1420px;[^}]*height:\s*700px;/);
  });

  it('keeps the approved PC clue index as a full-width single-column composition', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-shell\s+\.pixel-modal-header\s*\{[^}]*height:\s*135px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-shell\s+\.pixel-modal-content\.clue-modal-content\s*\{[^}]*padding:\s*30px 42px 30px 50px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-auto-rows:\s*minmax\(106px, auto\);[^}]*gap:\s*16px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-card\s*\{[^}]*min-height:\s*106px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-shell\s+\.pixel-modal-footer\.clue-modal-footer\s*\{[^}]*height:\s*155px;[^}]*padding:\s*21px 42px 0 50px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.pixel-modal-action\.clue-infer-button\s*\{[^}]*width:\s*298px;[^}]*height:\s*76px;/);
  });
});
