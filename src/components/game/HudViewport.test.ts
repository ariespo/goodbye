import { describe, expect, it } from 'vitest';
import { calculateHudLayout } from './hudLayout';

describe('calculateHudLayout', () => {
  it('uses the 1672×941 reference coordinates without scaling at the design viewport', () => {
    expect(calculateHudLayout(1672, 941)).toEqual({
      scale: 1,
      virtualWidth: 1672,
      virtualHeight: 941,
    });
  });

  it('uses one width-limited scale and expands only the virtual safe height at 1469×1268', () => {
    const layout = calculateHudLayout(1469, 1268);

    expect(layout.scale).toBeCloseTo(1469 / 1672, 8);
    expect(layout.virtualWidth).toBeCloseTo(1672, 8);
    expect(layout.virtualHeight).toBeCloseTo(1268 / (1469 / 1672), 8);
  });

  it('uses one height-limited scale and expands only the virtual safe width in a wide viewport', () => {
    const layout = calculateHudLayout(1920, 800);

    expect(layout.scale).toBeCloseTo(800 / 941, 8);
    expect(layout.virtualWidth).toBeCloseTo(1920 / (800 / 941), 8);
    expect(layout.virtualHeight).toBeCloseTo(941, 8);
  });
});
