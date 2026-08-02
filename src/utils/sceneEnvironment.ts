import { getBackgroundById, type SceneEnvironment } from '../data/backgroundAssets';

export const DEFAULT_SCENE_ENVIRONMENT: SceneEnvironment = 'indoor-audible-rain';

export function resolveSceneEnvironment(background?: string | null): SceneEnvironment {
  if (!background) return 'none';
  if (/^https?:\/\//i.test(background)) return DEFAULT_SCENE_ENVIRONMENT;
  return getBackgroundById(background)?.environment ?? DEFAULT_SCENE_ENVIRONMENT;
}

export function hasRainOverlay(environment: SceneEnvironment): boolean {
  return environment === 'outdoor-light-rain' || environment === 'outdoor-heavy-rain';
}

export function getRainOverlayOpacity(environment: SceneEnvironment): number {
  if (environment === 'outdoor-heavy-rain') return 0.18;
  if (environment === 'outdoor-light-rain') return 0.1;
  return 0;
}

export function getRainAudioVolumeScale(environment: SceneEnvironment): number {
  switch (environment) {
    case 'outdoor-heavy-rain':
      return 0.3;
    case 'outdoor-light-rain':
      return 0.22;
    case 'indoor-audible-rain':
      return 0.12;
    case 'indoor-muted-rain':
      return 0.06;
    case 'none':
    default:
      return 0;
  }
}
