// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { PixelFrame } from './PixelFrame';

describe('PixelFrame stepped rails', () => {
  afterEach(cleanup);

  it('keeps dialogue content separate from two explicit decorative rails', () => {
    render(<PixelFrame variant="dialogue">对白内容</PixelFrame>);

    const frame = screen.getByText('对白内容').closest('.world-pixel-frame');
    expect(frame?.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
    expect(frame?.querySelector('[data-pixel-frame-rail="outer"]')).not.toBeNull();
    expect(frame?.querySelector('[data-pixel-frame-rail="inner"]')).not.toBeNull();
    expect(screen.getByText('对白内容').closest('[data-pixel-frame-content]')).not.toBeNull();
  });

  it('uses one explicit rail for a standard panel', () => {
    render(<PixelFrame variant="panel">面板内容</PixelFrame>);

    const frame = screen.getByText('面板内容').closest('.world-pixel-frame');
    expect(frame?.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(1);
  });

  it('uses two rails and an opaque fill for a modal', () => {
    render(<PixelFrame variant="modal">弹窗内容</PixelFrame>);

    const frame = screen.getByText('弹窗内容').closest('.world-pixel-frame');
    expect(frame?.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
    expect(frame).toHaveClass('world-pixel-frame-modal');
    expect(frame).toHaveStyle({ backgroundColor: '#050505' });
  });
});
