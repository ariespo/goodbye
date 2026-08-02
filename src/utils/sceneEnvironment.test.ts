import { describe, expect, it } from 'vitest';
import {
  getRainAudioVolumeScale,
  hasRainOverlay,
  resolveSceneEnvironment,
} from './sceneEnvironment';

describe('sceneEnvironment', () => {
  it('keeps indoor rain audible without rendering the rain overlay', () => {
    const environment = resolveSceneEnvironment('bedroom1-night');

    expect(environment).toBe('indoor-audible-rain');
    expect(hasRainOverlay(environment)).toBe(false);
    expect(getRainAudioVolumeScale(environment)).toBeGreaterThan(0);
  });

  it('uses outdoor rain for both school time states', () => {
    expect(resolveSceneEnvironment('school-day')).toBe('outdoor-heavy-rain');
    expect(resolveSceneEnvironment('school-night.png')).toBe('outdoor-heavy-rain');
    expect(hasRainOverlay(resolveSceneEnvironment('school-night'))).toBe(true);
  });

  it('keeps indoor rain muted for convenience-store time states', () => {
    expect(resolveSceneEnvironment('supermarket-day')).toBe('indoor-muted-rain');
    expect(resolveSceneEnvironment('supermarket-night')).toBe('indoor-muted-rain');
    expect(hasRainOverlay(resolveSceneEnvironment('supermarket-night'))).toBe(false);
  });

  it('renders rain overlay for outdoor rainy scenes', () => {
    const environment = resolveSceneEnvironment('mountain-trail.png');

    expect(environment).toBe('outdoor-heavy-rain');
    expect(hasRainOverlay(environment)).toBe(true);
    expect(getRainAudioVolumeScale(environment)).toBeGreaterThan(getRainAudioVolumeScale('indoor-audible-rain'));
  });

  it('disables rain for transition scenes', () => {
    const environment = resolveSceneEnvironment('black');

    expect(environment).toBe('none');
    expect(hasRainOverlay(environment)).toBe(false);
    expect(getRainAudioVolumeScale(environment)).toBe(0);
  });

  it('allows the opening black screen to be a one-off rain scene', () => {
    const environment = resolveSceneEnvironment('opening-rain-black');

    expect(environment).toBe('outdoor-heavy-rain');
    expect(hasRainOverlay(environment)).toBe(true);
  });
});
