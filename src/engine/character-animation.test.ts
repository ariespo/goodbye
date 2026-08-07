import { describe, expect, it } from 'vitest';
import {
  frameAtElapsed,
  reducedMotionFrame,
  validateCharacterAnimationManifest,
  type CharacterAnimationClip,
} from './character-animation';

const loopClip: CharacterAnimationClip = {
  src: 'idle.sheet.png',
  frames: 4,
  frameMs: [900, 120, 120, 1200],
  loop: true,
  holdLastFrame: false,
};

describe('character animation timing', () => {
  it('honours variable frame durations and loops', () => {
    expect(frameAtElapsed(loopClip, 899).frame).toBe(0);
    expect(frameAtElapsed(loopClip, 900).frame).toBe(1);
    expect(frameAtElapsed(loopClip, 1020).frame).toBe(2);
    expect(frameAtElapsed(loopClip, 1140).frame).toBe(3);
    expect(frameAtElapsed(loopClip, 2340).frame).toBe(0);
  });

  it('holds a non-looping clip on its final frame', () => {
    const clip = { ...loopClip, loop: false, holdLastFrame: true };
    expect(frameAtElapsed(clip, 3000)).toEqual({ frame: 3, complete: true });
    expect(reducedMotionFrame(clip)).toBe(3);
  });

  it('rejects character-specific canvas sizes', () => {
    const errors = validateCharacterAnimationManifest({
      character: 'fumi',
      frameWidth: 412,
      frameHeight: 606,
      clips: { 'idle.calm': loopClip },
    });
    expect(errors).toContain('Character canvas must be 430x606.');
  });

  it('rejects incomplete direct frame sequences', () => {
    const errors = validateCharacterAnimationManifest({
      character: 'fumi',
      frameWidth: 430,
      frameHeight: 606,
      clips: {
        'talk.happy': {
          ...loopClip,
          sources: ['00.png', '01.png'],
        },
      },
    });
    expect(errors).toContain('talk.happy: sources must contain one file per frame.');
  });
});
