// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizedClue } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ClueModal } from './ClueModal';

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

  afterEach(() => {
    cleanup();
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

  it('anchors the PC clue board to the approved 1420 by 700 HUD geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.clue-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*width:\s*1420px;[^}]*height:\s*700px;/);
  });
});
