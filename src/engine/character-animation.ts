export const STANDARD_CHARACTER_CANVAS = Object.freeze({ width: 430, height: 606 });

export interface CharacterAnimationClip {
  src: string;
  frames: number;
  frameMs: number[];
  loop: boolean;
  holdLastFrame: boolean;
  reducedMotionFrame?: number;
}

export interface CharacterBlinkClip {
  src: string;
  /** Optional complete frame files. When present, they are played directly in array order. */
  sources?: string[];
  frames: number;
  frameMs: number[];
}

export interface CharacterAnimationManifest {
  character: string;
  frameWidth: number;
  frameHeight: number;
  clips: Record<string, CharacterAnimationClip>;
}

export interface AnimationFrameState {
  frame: number;
  complete: boolean;
}

export function clipDuration(clip: CharacterAnimationClip): number {
  return clip.frameMs.slice(0, clip.frames).reduce((sum, duration) => sum + duration, 0);
}

export function validateCharacterAnimationManifest(manifest: CharacterAnimationManifest): string[] {
  const errors: string[] = [];

  if (
    manifest.frameWidth !== STANDARD_CHARACTER_CANVAS.width
    || manifest.frameHeight !== STANDARD_CHARACTER_CANVAS.height
  ) {
    errors.push(
      `Character canvas must be ${STANDARD_CHARACTER_CANVAS.width}x${STANDARD_CHARACTER_CANVAS.height}.`,
    );
  }

  for (const [clipId, clip] of Object.entries(manifest.clips)) {
    if (!clip.src.trim()) errors.push(`${clipId}: src is required.`);
    if (!Number.isInteger(clip.frames) || clip.frames < 1) {
      errors.push(`${clipId}: frames must be a positive integer.`);
      continue;
    }
    if (clip.frameMs.length !== clip.frames) {
      errors.push(`${clipId}: frameMs must contain one duration per frame.`);
    }
    if (clip.frameMs.some(duration => !Number.isFinite(duration) || duration <= 0)) {
      errors.push(`${clipId}: every frame duration must be greater than zero.`);
    }
    if (
      clip.reducedMotionFrame !== undefined
      && (clip.reducedMotionFrame < 0 || clip.reducedMotionFrame >= clip.frames)
    ) {
      errors.push(`${clipId}: reducedMotionFrame is outside the clip.`);
    }
  }

  return errors;
}

export function frameAtElapsed(clip: CharacterAnimationClip, elapsedMs: number): AnimationFrameState {
  const durations = clip.frameMs.slice(0, clip.frames);
  const totalMs = durations.reduce((sum, duration) => sum + duration, 0);
  if (totalMs <= 0 || clip.frames <= 1) return { frame: 0, complete: !clip.loop };

  const safeElapsed = Math.max(0, elapsedMs);
  if (!clip.loop && safeElapsed >= totalMs) {
    return {
      frame: clip.holdLastFrame ? clip.frames - 1 : 0,
      complete: true,
    };
  }

  const localElapsed = clip.loop ? safeElapsed % totalMs : safeElapsed;
  let cursor = 0;
  for (let frame = 0; frame < durations.length; frame += 1) {
    cursor += durations[frame];
    if (localElapsed < cursor) return { frame, complete: false };
  }

  return { frame: clip.frames - 1, complete: false };
}

export function reducedMotionFrame(clip: CharacterAnimationClip): number {
  return Math.min(
    clip.frames - 1,
    Math.max(0, clip.reducedMotionFrame ?? (clip.holdLastFrame ? clip.frames - 1 : 0)),
  );
}
