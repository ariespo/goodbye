import { describe, expect, it } from 'vitest';
import { getBackgroundById } from './backgroundAssets';

describe('backgroundAssets time variants', () => {
  it('keeps legacy IDs mapped to the day assets', () => {
    expect(getBackgroundById('bedroom1')?.file).toBe('bedroom1.png');
    expect(getBackgroundById('home')?.file).toBe('home.png');
    expect(getBackgroundById('school')?.file).toBe('school.png');
    expect(getBackgroundById('supermarket')?.file).toBe('supermarket.png');
  });

  it('maps explicit day and night IDs to the intended files', () => {
    expect(getBackgroundById('bedroom1-day')?.file).toBe('bedroom1.png');
    expect(getBackgroundById('bedroom1-night.png')?.file).toBe('bedroom1-night.png');
    expect(getBackgroundById('home-night')?.file).toBe('home-night.png');
    expect(getBackgroundById('school-night')?.file).toBe('school-night.png');
    expect(getBackgroundById('supermarket-night')?.file).toBe('supermarket-night.png');
  });

  it('does not expose the retired bedroom2 scene', () => {
    expect(getBackgroundById('bedroom2')).toBeUndefined();
  });
});
