// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { SaveModal } from './SaveModal';

vi.mock('../../sillytavern/database', () => ({
  getSaves: vi.fn().mockResolvedValue([]),
  saveSlot: vi.fn(),
  deleteSave: vi.fn(),
}));

describe('SaveModal in-game entry point', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('does not render the old floating save button because archive owns the entry point', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showTitle: false } }));

    render(<SaveModal />);

    expect(screen.queryByRole('button', { name: '存档' })).toBeNull();
  });

  it('opens archive management in the shared monochrome double-rail modal', async () => {
    render(<SaveModal />);
    act(() => window.dispatchEvent(new CustomEvent('farewell:open-save-modal', { detail: { mode: 'manage' } })));

    const dialog = await screen.findByRole('dialog', { name: '存档管理' });
    expect(dialog).toHaveClass('pixel-modal-shell', 'save-modal-shell');
    expect(dialog.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
    expect(dialog.querySelector('.clean-modal-frame-blue')).toBeNull();

    await waitFor(() => expect(screen.getByText('暂无存档')).not.toBeNull());
  });
});
