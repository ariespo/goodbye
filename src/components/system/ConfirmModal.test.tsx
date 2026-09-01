// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
  afterEach(() => {
    cleanup();
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
});
