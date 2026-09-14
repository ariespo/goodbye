// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { FreeActionDialog } from './FreeActionDialog';

const loopMocks = vi.hoisted(() => ({ sendMessage: vi.fn() }));

vi.mock('../../hooks/useGameLoop', () => ({
  useGameLoop: () => loopMocks,
}));

describe('FreeActionDialog', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    loopMocks.sendMessage.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('discloses scope ranges and that travel is added', () => {
    render(<FreeActionDialog open onClose={vi.fn()} />);

    expect(screen.getByText(/简短询问 20–30 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/一般调查 45–60 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/深入调查 90–120 分钟/)).toBeInTheDocument();
    expect(screen.getByText(/路程另计/)).toBeInTheDocument();
  });

  it('submits one attempted action directly without another approval dialog', () => {
    const onClose = vi.fn();
    render(<FreeActionDialog open onClose={onClose} />);

    fireEvent.change(screen.getByRole('textbox', { name: '自由行动' }), {
      target: { value: '去学校询问门卫' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认自由行动' }));

    expect(loopMocks.sendMessage).toHaveBeenCalledOnce();
    expect(loopMocks.sendMessage).toHaveBeenCalledWith('去学校询问门卫');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
