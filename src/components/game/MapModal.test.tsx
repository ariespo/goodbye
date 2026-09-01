// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { MapModal } from './MapModal';

describe('MapModal', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('uses the shared map dialog shell and disables travel at the current location', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    expect(screen.getByRole('dialog', { name: '地图' })).toHaveClass('pixel-modal-shell');
    expect(screen.getByText(/当前位置：/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往此处' })).toBeDisabled();
  });

  it('keeps the travel button tied to the existing travel availability predicates', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    const travelButton = screen.getByRole('button', { name: '前往此处' });
    expect(travelButton).toBeEnabled();

    act(() => useGameStore.getState().actions.setIsWaitingForAI(true));
    expect(screen.getByRole('button', { name: '前往此处' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsWaitingForAI(false);
      useGameStore.getState().actions.setIsTyping(true);
    });
    expect(screen.getByRole('button', { name: '前往此处' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsTyping(false);
      useGameStore.getState().actions.setGameStatus({ stamina: 0 });
    });
    expect(screen.getByRole('button', { name: '前往此处' })).toBeDisabled();
  });

  it('anchors the desktop board to the approved map geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*top:\s*122px;[^}]*left:\s*90px;[^}]*width:\s*1460px;[^}]*height:\s*738px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.map-modal-map\s*\{[^}]*width:\s*1354px;[^}]*height:\s*385px;/);
  });
});
