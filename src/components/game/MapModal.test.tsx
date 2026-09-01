// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { HudViewport } from './HudViewport';
import { MapModal } from './MapModal';

describe('MapModal', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('uses the shared map dialog shell and explains that the current location cannot be traveled to', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    expect(screen.getByRole('dialog', { name: '地图' })).toHaveClass('pixel-modal-shell');
    expect(screen.getByText(/当前位置：/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已经抵达' })).toBeDisabled();
  });

  it('keeps the travel button tied to the existing travel availability predicates with explanatory labels', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    const travelButton = screen.getByRole('button', { name: '前往此处' });
    expect(travelButton).toBeEnabled();

    act(() => useGameStore.getState().actions.setIsWaitingForAI(true));
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsWaitingForAI(false);
      useGameStore.getState().actions.setIsTyping(true);
    });
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsTyping(false);
      useGameStore.getState().actions.setGameStatus({ stamina: 0 });
    });
    expect(screen.getByRole('button', { name: '体力不足' })).toBeDisabled();
  });

  it('explains when a rumored location still needs confirmation', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          knowledgeEvents: [...(state.tavern.variables.knowledgeEvents as string[]), 'find:water-tower-fragment'],
        },
      },
    }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '山中的旧设施？' }));
    expect(screen.getByRole('button', { name: '需要确认位置' })).toBeDisabled();
  });

  it('keeps map controls reachable inside the HUD canvas', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<HudViewport><MapModal /></HudViewport>);

    fireEvent.click(screen.getByRole('button', { name: '关闭地图' }));
    expect(useGameStore.getState().ui.showMap).toBe(false);
  });

  it('anchors the desktop board to the approved map geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*top:\s*122px;[^}]*left:\s*90px;[^}]*width:\s*1460px;[^}]*height:\s*738px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.map-modal-map\s*\{[^}]*width:\s*1354px;[^}]*height:\s*385px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\.pixel-modal-shell\s*\{[^}]*pointer-events:\s*auto;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-header\s*\{[^}]*gap:\s*20px;[^}]*padding:\s*28px 56px 28px 50px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-close\s*\{[^}]*top:\s*43px;[^}]*right:\s*56px;[^}]*width:\s*44px;[^}]*height:\s*44px;/);
    expect(styles).toMatch(/@media \(max-width: 800px\)[\s\S]*\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-frame\s*\{[^}]*position:\s*relative;[^}]*top:\s*auto;[^}]*left:\s*auto;[^}]*width:\s*100%/);
  });
});
