// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { ConclusionModal } from '../game/ConclusionModal';
import { ConfirmModal } from './ConfirmModal';

const conclusionFlowMocks = vi.hoisted(() => ({
  commitProgramConclusion: vi.fn(),
  lockProgramConclusion: vi.fn(),
  selectProgramConclusionOverlay: vi.fn(),
}));

vi.mock('../../utils/conclusionFlow', () => conclusionFlowMocks);

function renderPendingConclusion() {
  useGameStore.setState(state => ({
    ui: { ...state.ui, showConclusion: true },
    game: { ...state.game, sceneComplete: true },
    tavern: {
      ...state.tavern,
      variables: {
        ...state.tavern.variables,
        lockedRoute: 'A',
        overlay: null,
        finalChoice: null,
        mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' },
      },
    },
  }));
  conclusionFlowMocks.commitProgramConclusion.mockResolvedValue({
    accepted: false,
    value: useGameStore.getState().tavern.variables,
    reason: '结论尚未可以提交。',
  });

  render(<ConclusionModal />);
  fireEvent.click(screen.getByRole('button', { name: /公开指认/ }));
}

describe('ConfirmModal', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    conclusionFlowMocks.commitProgramConclusion.mockReset();
    conclusionFlowMocks.lockProgramConclusion.mockReset();
    conclusionFlowMocks.selectProgramConclusionOverlay.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('keeps content clicks inside the shared dialog while confirming exactly once', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmModal
        isOpen
        title="删除线索"
        message="确定删除？"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('dialog', { name: '删除线索' })).toHaveClass('pixel-modal-shell');
    fireEvent.click(screen.getByText('确定删除？'));
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels once when Escape is pressed', () => {
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        isOpen
        title="删除线索"
        message="确定删除？"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the parent conclusion open when interacting with a pending confirmation', async () => {
    renderPendingConclusion();

    expect(screen.getByRole('dialog', { name: '作出最终选择' })).toBeInTheDocument();
    fireEvent.click(screen.getByText(/确定选择“公开指认”吗/));
    expect(useGameStore.getState().ui.showConclusion).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(useGameStore.getState().ui.showConclusion).toBe(true);

    cleanup();
    renderPendingConclusion();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(conclusionFlowMocks.commitProgramConclusion).toHaveBeenCalledTimes(1);
    });
    expect(useGameStore.getState().ui.showConclusion).toBe(true);
  });

  it('lets Escape cancel only the pending confirmation, not its conclusion parent', () => {
    renderPendingConclusion();

    fireEvent.keyDown(window, { key: 'Escape' });

    const closingConfirmation = document.querySelector('.confirm-modal-shell.is-closing');
    expect(closingConfirmation).toHaveAttribute('aria-hidden', 'true');
    expect(closingConfirmation).toHaveAttribute('inert');
    expect(useGameStore.getState().ui.showConclusion).toBe(true);
  });

  it('reserves compact header space for the close control at the mobile breakpoint', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*\.confirm-modal-shell\s+\.pixel-modal-header\s*\{[^}]*height:\s*76px;[^}]*padding:\s*0 18px 0 22px;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*\.confirm-modal-shell\s+\.pixel-modal-title\s*\{[^}]*font-size:\s*18px;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*\.confirm-modal-shell\s+\.pixel-modal-meta\s*\{[^}]*display:\s*none;/);
    expect(styles).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*\.confirm-modal-shell\s+\.pixel-modal-close\s*\{[^}]*right:\s*18px;[^}]*width:\s*32px;[^}]*height:\s*32px;/);
  });

  it('leaves the closed confirmation wrapper out of hit testing while its open shell remains interactive', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.confirm-modal-isolation\s*\{[^}]*pointer-events:\s*none;/);
    expect(styles).toMatch(/\.confirm-modal-isolation\s+\.confirm-modal-shell\.pixel-modal-shell\s*\{[^}]*pointer-events:\s*auto;/);
  });
});
