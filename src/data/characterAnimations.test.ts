import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  FUMI_ANGRY_TALK_CLIP,
  FUMI_ANGRY_TALK_FRAMES,
  FUMI_ANGRY_TAIL_BLINK,
  FUMI_HAPPY_TALK_CLIP,
  FUMI_HAPPY_TALK_FRAMES,
  FUMI_HAPPY_TAIL_BLINK,
  FUMI_SAD_TALK_CLIP,
  FUMI_SAD_TALK_FRAMES,
  FUMI_SAD_TAIL_BLINK,
  TOUKO_ANGRY_TALK_CLIP,
  TOUKO_ANGRY_TALK_FRAMES,
  TOUKO_ANGRY_TAIL_BLINK,
  TOUKO_ANGRY_TAIL_BLINK_FRAMES,
  TOUKO_HAPPY_TALK_CLIP,
  TOUKO_HAPPY_TALK_FRAMES,
  TOUKO_HAPPY_TAIL_BLINK,
  TOUKO_HAPPY_TAIL_BLINK_FRAMES,
  TOUKO_INSANE_TALK_CLIP,
  TOUKO_INSANE_TALK_FRAMES,
  TOUKO_INSANE_TAIL_BLINK,
  TOUKO_INSANE_TAIL_BLINK_FRAMES,
  TOUKO_SAD_TALK_CLIP,
  TOUKO_SAD_TALK_FRAMES,
  TOUKO_SAD_TAIL_BLINK,
  TOUKO_SAD_TAIL_BLINK_FRAMES,
} from './characterAnimations';

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('Touko sad talk animation', () => {
  const framePaths = Array.from({ length: 12 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/talk-sad-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 12 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once and holds the supplied tail frame', () => {
    expect(TOUKO_SAD_TALK_FRAMES).toHaveLength(12);
    expect(TOUKO_SAD_TALK_CLIP).toMatchObject({
      src: TOUKO_SAD_TALK_FRAMES[0],
      sources: TOUKO_SAD_TALK_FRAMES,
      frames: 12,
      frameMs: Array.from({ length: 12 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 11,
    });
  });

  it('reuses the sad talk frames as the tail-blink sequence', () => {
    expect(TOUKO_SAD_TAIL_BLINK_FRAMES).toBe(TOUKO_SAD_TALK_FRAMES);
    expect(TOUKO_SAD_TAIL_BLINK).toMatchObject({
      src: TOUKO_SAD_TAIL_BLINK_FRAMES[0],
      sources: TOUKO_SAD_TAIL_BLINK_FRAMES,
      frames: 12,
      frameMs: Array.from({ length: 12 }, () => 55),
    });
  });
});

describe('Touko happy talk animation', () => {
  const framePaths = Array.from({ length: 14 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/talk-happy-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 14 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and reuses the same sequence for blinking', () => {
    expect(TOUKO_HAPPY_TALK_FRAMES).toHaveLength(14);
    expect(TOUKO_HAPPY_TALK_CLIP).toMatchObject({
      src: TOUKO_HAPPY_TALK_FRAMES[0],
      sources: TOUKO_HAPPY_TALK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 13,
    });
    expect(TOUKO_HAPPY_TAIL_BLINK_FRAMES).toBe(TOUKO_HAPPY_TALK_FRAMES);
    expect(TOUKO_HAPPY_TAIL_BLINK).toMatchObject({
      src: TOUKO_HAPPY_TALK_FRAMES[0],
      sources: TOUKO_HAPPY_TALK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 42),
    });
  });
});

describe('Touko angry talk animation', () => {
  const framePaths = Array.from({ length: 22 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/talk-angry-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 22 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and reuses the same sequence for blinking', () => {
    expect(TOUKO_ANGRY_TALK_FRAMES).toHaveLength(22);
    expect(TOUKO_ANGRY_TALK_CLIP).toMatchObject({
      src: TOUKO_ANGRY_TALK_FRAMES[0],
      sources: TOUKO_ANGRY_TALK_FRAMES,
      frames: 22,
      frameMs: Array.from({ length: 22 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 21,
    });
    expect(TOUKO_ANGRY_TAIL_BLINK_FRAMES).toBe(TOUKO_ANGRY_TALK_FRAMES);
    expect(TOUKO_ANGRY_TAIL_BLINK).toMatchObject({
      src: TOUKO_ANGRY_TALK_FRAMES[0],
      sources: TOUKO_ANGRY_TALK_FRAMES,
      frames: 22,
      frameMs: Array.from({ length: 22 }, () => 42),
    });
  });
});

describe('Touko insane talk animation', () => {
  const talkPaths = Array.from({ length: 10 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/talk-insane-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const blinkPaths = Array.from({ length: 14 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/tail-blink-insane-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(talkPaths.map(pngSize)).toEqual(
      Array.from({ length: 10 }, () => ({ width: 430, height: 606 })),
    );
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 14 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays the insane talk clip once and holds the last frame', () => {
    expect(TOUKO_INSANE_TALK_FRAMES).toHaveLength(10);
    expect(TOUKO_INSANE_TALK_CLIP).toMatchObject({
      src: TOUKO_INSANE_TALK_FRAMES[0],
      sources: TOUKO_INSANE_TALK_FRAMES,
      frames: 10,
      frameMs: Array.from({ length: 10 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 9,
    });
  });

  it('uses separate tail-blink frames for insane', () => {
    expect(TOUKO_INSANE_TAIL_BLINK_FRAMES).not.toBe(TOUKO_INSANE_TALK_FRAMES);
    expect(TOUKO_INSANE_TAIL_BLINK).toMatchObject({
      src: TOUKO_INSANE_TAIL_BLINK_FRAMES[0],
      sources: TOUKO_INSANE_TAIL_BLINK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 42),
    });
  });
});

describe('Fumi emotion talk animations', () => {
  const cases = [
    {
      name: 'happy',
      frames: 22,
      frameMs: 42,
      tailBlinkFrames: 7,
      talkClip: FUMI_HAPPY_TALK_CLIP,
      talkFrames: FUMI_HAPPY_TALK_FRAMES,
      tailBlink: FUMI_HAPPY_TAIL_BLINK,
      folder: 'talk-happy',
      firstIndex: 1,
    },
    {
      name: 'sad',
      frames: 12,
      frameMs: 55,
      tailBlinkFrames: 8,
      talkClip: FUMI_SAD_TALK_CLIP,
      talkFrames: FUMI_SAD_TALK_FRAMES,
      tailBlink: FUMI_SAD_TAIL_BLINK,
      folder: 'talk-sad',
      firstIndex: 0,
    },
    {
      name: 'angry',
      frames: 20,
      frameMs: 42,
      tailBlinkFrames: 10,
      talkClip: FUMI_ANGRY_TALK_CLIP,
      talkFrames: FUMI_ANGRY_TALK_FRAMES,
      tailBlink: FUMI_ANGRY_TAIL_BLINK,
      folder: 'talk-angry',
      firstIndex: 0,
    },
  ] as const;

  it.each(cases)(
    'installs $name frames on the standard canvas',
    ({ folder, frames, firstIndex }) => {
      const framePaths = Array.from({ length: frames }, (_, index) =>
        resolve(
          process.cwd(),
          `public/assets/characters/animated/fumi/${folder}/${String(index + firstIndex).padStart(2, '0')}.png`,
        ),
      );
      expect(framePaths.map(pngSize)).toEqual(
        Array.from({ length: frames }, () => ({ width: 430, height: 606 })),
      );
    },
  );

  it.each(cases)(
    'plays the $name talk clip once and holds the last frame',
    ({ talkClip, talkFrames, frames, frameMs }) => {
      expect(talkFrames).toHaveLength(frames);
      expect(talkClip).toMatchObject({
        src: talkFrames[0],
        sources: talkFrames,
        frames,
        frameMs: Array.from({ length: frames }, () => frameMs),
        loop: false,
        holdLastFrame: true,
        reducedMotionFrame: frames - 1,
      });
    },
  );

  it.each(cases)(
    'uses separate tail-blink frames for $name',
    ({ tailBlink, tailBlinkFrames }) => {
      expect(tailBlink.sources).toHaveLength(tailBlinkFrames);
      expect(tailBlink).toMatchObject({
        src: tailBlink.sources![0],
        frames: tailBlinkFrames,
        frameMs: Array.from({ length: tailBlinkFrames }, () => 42),
      });
    },
  );
});
