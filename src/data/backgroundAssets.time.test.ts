import { describe, expect, it } from 'vitest';
import { getCanonicalBackgroundId, resolveBackgroundForTime } from './backgroundAssets';

describe('timed background resolution', () => {
  it('strips legacy day and night suffixes to a scene name', () => {
    expect(getCanonicalBackgroundId('bedroom1-day')).toBe('bedroom1');
    expect(getCanonicalBackgroundId('home-night.png')).toBe('home');
  });

  it('uses day from 08:00 through 18:30 inclusive', () => {
    expect(resolveBackgroundForTime('bedroom1', new Date(2024, 8, 9, 8, 0))).toBe('bedroom1-day');
    expect(resolveBackgroundForTime('home-night', new Date(2024, 8, 9, 18, 30))).toBe('home-day');
  });

  it('uses night at 18:31 and through midnight', () => {
    expect(resolveBackgroundForTime('bedroom1-day', new Date(2024, 8, 9, 18, 31))).toBe('bedroom1-night');
    expect(resolveBackgroundForTime('home', new Date(2024, 8, 10, 0, 0))).toBe('home-night');
    expect(resolveBackgroundForTime('street', new Date(2024, 8, 9, 20, 0))).toBe('street-night');
  });

  it('keeps scenes without timed variants unchanged', () => {
    expect(resolveBackgroundForTime('black', new Date(2024, 8, 9, 20, 0))).toBe('black');
  });
});
