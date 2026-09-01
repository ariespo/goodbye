// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
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
});
