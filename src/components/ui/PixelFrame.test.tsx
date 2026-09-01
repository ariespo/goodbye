// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('uses the corrected nine-pixel stepped modal corners', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');
    const modalRule = styles.match(/\.world-pixel-frame-modal\s*>\s*\.pixel-frame-layers\s*>\s*\.pixel-frame-layer\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(modalRule).toContain('calc(100% - 4px) 9px');
    expect(modalRule).toContain('100% 9px');
    expect(modalRule).toContain('100% calc(100% - 9px)');
    expect(modalRule).toContain('0 calc(100% - 9px)');
  });

  it('keeps opaque modal content inside both visible rails on light and dark stages', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');
    const modalLayers = styles.match(/\.world-pixel-frame-modal\s*>\s*\.pixel-frame-layers\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const modalContent = styles.match(/\.world-pixel-frame-modal\s*>\s*\.pixel-modal-frame-content\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(modalLayers).toContain('z-index: 2');
    expect(modalLayers).toContain('overflow: visible');
    expect(modalContent).toContain('z-index: 3');
    expect(modalContent).toContain('clip-path: inset(12px)');
  });

  it('computes both modal rails without requiring a hud-design-canvas ancestor', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');
    const selectors = [
      '.world-pixel-frame-modal',
      '.world-pixel-frame-modal > .pixel-frame-layers',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--underlay',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--outer',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--gap',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--inner',
      '.world-pixel-frame-modal > .pixel-frame-layers > .pixel-frame-layer--fill',
    ];
    const escaped = (selector: string) => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const modalRules = selectors.map(selector => {
      const match = styles.match(new RegExp(`${escaped(selector)}\\s*\\{[^}]*\\}`));
      return match?.[0] ?? '';
    }).join('\n');
    const style = document.createElement('style');
    style.textContent = modalRules;
    document.head.append(style);

    render(<PixelFrame variant="modal">Portal modal</PixelFrame>);
    const frame = screen.getByText('Portal modal').closest('.world-pixel-frame') as HTMLElement;
    const outer = frame.querySelector('.pixel-frame-layer--outer') as HTMLElement;
    const inner = frame.querySelector('.pixel-frame-layer--inner') as HTMLElement;

    expect(getComputedStyle(frame).overflow).toBe('visible');
    expect(getComputedStyle(outer).position).toBe('absolute');
    expect(getComputedStyle(outer).inset).toBe('0');
    expect(getComputedStyle(outer).backgroundColor).toBe('rgb(244, 244, 240)');
    expect(getComputedStyle(inner).inset).toBe('8px');
    expect(getComputedStyle(inner).backgroundColor).toBe('rgb(244, 244, 240)');
    expect(getComputedStyle(inner).clipPath).toContain('polygon(');

    style.remove();
  });
});
