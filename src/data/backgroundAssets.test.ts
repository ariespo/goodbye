import { describe, expect, it } from 'vitest';
import { getBackgroundById, getBackgroundPromptCatalog } from './backgroundAssets';

describe('backgroundAssets time variants', () => {
  it('keeps legacy IDs mapped to the day assets', () => {
    expect(getBackgroundById('bedroom1')?.file).toBe('bedroom1.png');
    expect(getBackgroundById('home')?.file).toBe('home.png');
    expect(getBackgroundById('school')?.file).toBe('school.png');
    expect(getBackgroundById('supermarket')?.file).toBe('supermarket.png');
    expect(getBackgroundById('street')?.file).toBe('street-redraw-v2.png');
    expect(getBackgroundById('street-night')?.file).toBe('street-night-redraw-v1.png');
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

  it('registers the first ending CG batch', () => {
    expect(getBackgroundById('ending-c-1')?.file).toBe('ending-c-1.png');
    expect(getBackgroundById('ending-f-1')?.file).toBe('ending-f-1.png');
    expect(getBackgroundById('ending-loop')?.file).toBe('ending-loop.png');
    expect(getBackgroundById('ending-stay')?.file).toBe('ending-stay.png');
    expect(getBackgroundById('ending-true')?.file).toBe('ending-true-retro-v5.png');
  });

  it('keeps ending-only CGs out of the AI scene catalog', () => {
    const catalog = getBackgroundPromptCatalog();
    expect(catalog).not.toContain('ending-true');
    expect(catalog).not.toContain('结局：九点零一分');
  });
});
