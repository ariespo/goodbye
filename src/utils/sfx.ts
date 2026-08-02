import { assetUrl } from './assetUrl';

export type SfxName =
  | 'ui-hover'
  | 'ui-click'
  | 'ui-confirm'
  | 'ui-cancel'
  | 'dialogue-advance'
  | 'choice-open'
  | 'clue-add'
  | 'deduction-start'
  | 'warning'
  | 'success'
  | 'sanity-drop'
  | 'ending-signal'
  | 'emotion-calm'
  | 'emotion-happy'
  | 'emotion-sad'
  | 'emotion-angry'
  | 'emotion-horror'
  | 'emotion-insane'
  | 'rain-loop'
  | 'rain-heavy'
  | 'thunder-distant'
  | 'phone-vibrate'
  | 'phone-ring'
  | 'clock-tick'
  | 'loop-reset'
  | 'flashback-whoosh'
  | 'investigate-paper'
  | 'investigate-object'
  | 'door-open'
  | 'footstep-rain';

let soundVolume = 0.65;
const pools = new Map<SfxName, HTMLAudioElement[]>();
const poolIndex = new Map<SfxName, number>();

export function setSfxVolume(volume: number) {
  soundVolume = Math.max(0, Math.min(1, volume));
}

export function playSfx(name: SfxName, volumeScale = 1) {
  if (soundVolume <= 0) return;
  const pool = getPool(name);
  const index = poolIndex.get(name) ?? 0;
  const audio = pool[index];
  poolIndex.set(name, (index + 1) % pool.length);
  audio.pause();
  audio.currentTime = 0;
  audio.volume = Math.max(0, Math.min(1, soundVolume * volumeScale));
  void audio.play().catch(() => {});
}

function getPool(name: SfxName) {
  const existing = pools.get(name);
  if (existing) return existing;
  const pool = Array.from({ length: 4 }, () => {
    const audio = new Audio(assetUrl(`assets/audio/sfx/${name}.wav`));
    audio.preload = 'auto';
    return audio;
  });
  pools.set(name, pool);
  return pool;
}
