// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PixelModalAction,
  PixelModalContent,
  PixelModalFooter,
  PixelModalHeader,
  PixelModalListItem,
  PixelModalShell,
  PixelModalStatus,
} from './PixelModal';

function Harness({ open, onClose, closeBlocked = false, onAction }: {
  open: boolean;
  onClose: () => void;
  closeBlocked?: boolean;
  onAction?: () => void;
}) {
  return (
    <>
      <button type="button">打开</button>
      <PixelModalShell open={open} onClose={onClose} labelledBy="modal-title" closeBlocked={closeBlocked}>
        <PixelModalHeader titleId="modal-title" title="标题" meta="META" onClose={onClose} closeLabel="关闭" />
        <PixelModalContent>
          正文
          {onAction && <PixelModalAction onClick={onAction}>执行</PixelModalAction>}
        </PixelModalContent>
        <PixelModalFooter>底部</PixelModalFooter>
      </PixelModalShell>
    </>
  );
}

describe('PixelModal', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('closes from Escape and restores focus to the trigger', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: '打开' });
    trigger.focus();

    rerender(<Harness open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} onClose={onClose} />);
    act(() => vi.advanceTimersByTime(220));
    expect(trigger).toHaveFocus();
  });

  it('only closes from the backdrop itself', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    fireEvent.click(screen.getByText('正文'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('pixel-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the shell mounted for the stepped close animation', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Harness open onClose={vi.fn()} />);

    rerender(<Harness open={false} onClose={vi.fn()} />);
    expect(screen.getByTestId('pixel-modal-backdrop')).toHaveClass('is-closing');

    act(() => vi.advanceTimersByTime(220));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('makes the closing paint inert immediately and removes it only after 220ms', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const onAction = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} onAction={onAction} />);
    const trigger = screen.getByRole('button', { name: '打开' });
    trigger.focus();
    rerender(<Harness open onClose={onClose} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Harness open={false} onClose={onClose} onAction={onAction} />);

    const closingShell = screen.getByTestId('pixel-modal-backdrop');
    expect(closingShell).toHaveClass('is-closing');
    expect(closingShell).toHaveAttribute('aria-hidden', 'true');
    expect(closingShell).toHaveAttribute('inert');
    expect(trigger).toHaveFocus();

    fireEvent.click(closingShell);
    fireEvent.click(closingShell.querySelector('.pixel-modal-close') as HTMLElement);
    fireEvent.click(closingShell.querySelector('.pixel-modal-action') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(219));
    expect(screen.getByTestId('pixel-modal-backdrop')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId('pixel-modal-backdrop')).toBeNull();
  });

  it('declares closing shells and frames non-interactive in the shared CSS layer', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.pixel-modal-shell\.is-closing\s*\{[^}]*pointer-events:\s*none/);
    expect(styles).toMatch(/\.pixel-modal-shell\.is-closing\s+\.pixel-modal-frame\s*\{[^}]*pointer-events:\s*none/);
  });

  it('does not close when a nested confirmation blocks the shell', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} closeBlocked />);

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('pixel-modal-backdrop'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('blocks the header close control when a nested confirmation blocks the shell', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} closeBlocked />);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus into the dialog and contains Tab navigation', () => {
    render(
      <>
        <button type="button">外部操作</button>
        <PixelModalShell open onClose={vi.fn()} labelledBy="focus-title">
          <PixelModalHeader titleId="focus-title" title="焦点" onClose={vi.fn()} closeLabel="关闭" />
          <PixelModalContent>
            <button type="button">内部操作</button>
          </PixelModalContent>
        </PixelModalShell>
      </>,
    );

    const closeButton = screen.getByRole('button', { name: '关闭' });
    const insideButton = screen.getByRole('button', { name: '内部操作' });
    expect(closeButton).toHaveFocus();

    insideButton.focus();
    fireEvent.keyDown(insideButton, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(insideButton).toHaveFocus();
  });

  it('uses the independent close SVG instead of text content', () => {
    render(<Harness open onClose={vi.fn()} />);

    const closeButton = screen.getByRole('button', { name: '关闭' });
    const closeIcon = closeButton.querySelector('img');
    expect(closeButton.textContent).toBe('');
    expect(closeIcon).toHaveAttribute('src', expect.stringContaining('assets/ui/penpot/pc/icon-modal-close.svg'));
  });

  it('inverts the external close SVG against the light hover and active backgrounds', () => {
    render(<Harness open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: '关闭' }).querySelector('.pixel-modal-close-icon')).not.toBeNull();

    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');
    expect(styles).toMatch(/\.pixel-modal-close:hover,\s*\.pixel-modal-close:active\s*\{[^}]*background:\s*#f2f2f0/);
    expect(styles).toMatch(/\.pixel-modal-close:hover\s+\.pixel-modal-close-icon,\s*\.pixel-modal-close:active\s+\.pixel-modal-close-icon\s*\{[^}]*filter:\s*invert\(1\)/);
  });

  it('exposes active action and list item states as presentation-only data attributes', () => {
    render(
      <>
        <PixelModalAction active icon={<svg aria-label="行动图标" />}>执行</PixelModalAction>
        <PixelModalStatus>可用</PixelModalStatus>
        <PixelModalListItem selected>选中</PixelModalListItem>
        <PixelModalListItem disabled>禁用</PixelModalListItem>
      </>,
    );

    expect(screen.getByRole('button', { name: /执行/ })).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('可用')).toHaveClass('pixel-modal-status');
    expect(screen.getByText('选中')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByText('禁用')).toHaveAttribute('data-disabled', 'true');
  });
});
