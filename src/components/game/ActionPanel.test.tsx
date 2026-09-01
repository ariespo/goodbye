// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ActionPanel } from './ActionPanel';

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
};

describe('ActionPanel', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
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
});
