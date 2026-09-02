// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { CharacterProfileModal } from './CharacterProfileModal';

describe('CharacterProfileModal', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    });
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('uses the shared monochrome double-rail shell and preserves profile selection', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showCharacters: true } }));
    render(<CharacterProfileModal />);

    const dialog = screen.getByRole('dialog', { name: '人物简介' });
    expect(dialog).toHaveClass('pixel-modal-shell', 'character-profile-shell');
    expect(dialog.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
    expect(dialog.querySelector('.clean-modal-frame-blue')).toBeNull();

    const profileButton = screen.getAllByRole('button', { name: /查看.+的人物简介/ })[0];
    fireEvent.click(profileButton);
    expect(profileButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '关闭人物简介' }));
    expect(useGameStore.getState().ui.showCharacters).toBe(false);
  });
});
