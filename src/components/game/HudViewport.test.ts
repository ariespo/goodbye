import { describe, expect, it } from 'vitest';
import { calculateHudLayout } from './hudLayout';

describe('calculateHudLayout', () => {
  it('uses the 1672×941 reference coordinates without scaling at the design viewport', () => {
    expect(calculateHudLayout(1672, 941)).toEqual({
      scale: 1,
      virtualWidth: 1672,
      virtualHeight: 941,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('keeps one fixed design canvas and centers it inside the 1469×1268 safe area', () => {
    const layout = calculateHudLayout(1469, 1268);

    expect(layout.scale).toBeCloseTo(1469 / 1672, 8);
    expect(layout.virtualWidth).toBe(1672);
    expect(layout.virtualHeight).toBe(941);
    expect(layout.offsetX).toBeCloseTo(0, 8);
    expect(layout.offsetY).toBeCloseTo((1268 - 941 * (1469 / 1672)) / 2, 8);
  });

  it('keeps one fixed design canvas and centers it inside a wide safe area', () => {
    const layout = calculateHudLayout(1920, 800);

    expect(layout.scale).toBeCloseTo(800 / 941, 8);
    expect(layout.virtualWidth).toBe(1672);
    expect(layout.virtualHeight).toBe(941);
    expect(layout.offsetX).toBeCloseTo((1920 - 1672 * (800 / 941)) / 2, 8);
    expect(layout.offsetY).toBeCloseTo(0, 8);
  });
});
