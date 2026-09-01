// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { StatusPanel } from './StatusPanel';

describe('StatusPanel PC top bar', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('presents the approved current/max resources in one top status bar', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        gameStatus: {
          ...state.game.gameStatus,
          time: new Date(2024, 8, 9, 8, 0),
          stamina: 83,
          sanity: 47,
        },
      },
      tavern: {
        ...state.tavern,
        variables: { ...state.tavern.variables, location: 'apartment', cycleCount: 3 },
      },
    }));

    render(<StatusPanel />);

    const bar = screen.getByRole('banner', { name: '游戏状态' });
    expect(bar.classList.contains('pc-status-bar')).toBe(true);
    expect(screen.getByText('83/100')).not.toBeNull();
    expect(screen.getByText('47/100')).not.toBeNull();
    expect(screen.getByText('循环 3')).not.toBeNull();
    expect(screen.getByText('08:00')).not.toBeNull();
  });

  it('opens the archive menu and routes the archive item through the real save event', () => {
    const onOpenSave = vi.fn();
    window.addEventListener('farewell:open-save-modal', onOpenSave);

    render(<StatusPanel />);
    fireEvent.click(screen.getByRole('button', { name: '档案菜单' }));

    expect(screen.getByRole('menu', { name: '档案菜单' })).not.toBeNull();
    for (const label of ['档案', '人物', '历史', '设置', '指认']) {
      expect(screen.getByRole('menuitem', { name: label })).not.toBeNull();
    }

    fireEvent.click(screen.getByRole('menuitem', { name: '档案' }));
    expect(onOpenSave).toHaveBeenCalledTimes(1);
    expect((onOpenSave.mock.calls[0][0] as CustomEvent).detail).toEqual({ mode: 'manage' });

    window.removeEventListener('farewell:open-save-modal', onOpenSave);
  });
});
