import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  FUMI_ANGRY_TALK_CLIP,
  FUMI_ANGRY_TALK_FRAMES,
  FUMI_ANGRY_TAIL_BLINK,
  FUMI_ANGRY_TAIL_BLINK_FRAMES,
  FUMI_HAPPY_TAIL_BLINK,
  FUMI_HAPPY_TAIL_BLINK_FRAMES,
  FUMI_HAPPY_TALK_CLIP,
  FUMI_HAPPY_TALK_FRAMES,
  FUMI_SAD_TALK_CLIP,
  FUMI_SAD_TALK_FRAMES,
  FUMI_SAD_TAIL_BLINK,
  FUMI_SAD_TAIL_BLINK_FRAMES,
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

describe('Fumi happy talk animation', () => {
  const framePaths = Array.from({ length: 22 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/talk-happy/${String(index + 1).padStart(2, '0')}.png`,
    ),
  );
  const blinkPaths = Array.from({ length: 7 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/tail-blink-happy/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 22 }, () => ({ width: 800, height: 1136 })),
    );
  });

  it('plays once and holds the supplied tail frame for the pending blink loop', () => {
    expect(FUMI_HAPPY_TALK_FRAMES).toHaveLength(22);
    expect(FUMI_HAPPY_TALK_CLIP).toMatchObject({
      sources: FUMI_HAPPY_TALK_FRAMES,
      frames: 22,
      frameMs: Array.from({ length: 22 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 21,
    });
    expect(FUMI_HAPPY_TALK_CLIP.src).toBe(FUMI_HAPPY_TALK_FRAMES[0]);
    expect(readFileSync(framePaths[0]).equals(readFileSync(framePaths[21]))).toBe(false);
  });

  it('uses every supplied happy blink frame', () => {
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 7 }, () => ({ width: 800, height: 1136 })),
    );
    expect(FUMI_HAPPY_TAIL_BLINK_FRAMES).toHaveLength(7);
    expect(FUMI_HAPPY_TAIL_BLINK).toMatchObject({
      src: FUMI_HAPPY_TAIL_BLINK_FRAMES[0],
      sources: FUMI_HAPPY_TAIL_BLINK_FRAMES,
      frames: 7,
      frameMs: Array.from({ length: 7 }, () => 42),
    });
  });
});

describe('Fumi angry talk animation', () => {
  const framePaths = Array.from({ length: 20 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/talk-angry/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const angryAnchor = resolve(process.cwd(), 'public/assets/characters/fumi-angry-normalized.png');
  const blinkPaths = Array.from({ length: 10 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/tail-blink-angry/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 20 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once and settles on the approved angry anchor', () => {
    expect(readFileSync(framePaths[0]).equals(readFileSync(angryAnchor))).toBe(true);
    expect(readFileSync(framePaths[19]).equals(readFileSync(angryAnchor))).toBe(true);
    expect(FUMI_ANGRY_TALK_FRAMES).toHaveLength(20);
    expect(FUMI_ANGRY_TALK_CLIP).toMatchObject({
      src: FUMI_ANGRY_TALK_FRAMES[0],
      sources: FUMI_ANGRY_TALK_FRAMES,
      frames: 20,
      frameMs: Array.from({ length: 20 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 19,
    });
  });

  it('uses the angry action tail as the stable frame around its blink loop', () => {
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 10 }, () => ({ width: 430, height: 606 })),
    );
    expect(readFileSync(blinkPaths[0]).equals(readFileSync(framePaths[19]))).toBe(true);
    expect(readFileSync(blinkPaths[9]).equals(readFileSync(framePaths[19]))).toBe(true);
    expect(FUMI_ANGRY_TAIL_BLINK_FRAMES).toHaveLength(10);
    expect(FUMI_ANGRY_TAIL_BLINK).toMatchObject({
      src: FUMI_ANGRY_TAIL_BLINK_FRAMES[0],
      sources: FUMI_ANGRY_TAIL_BLINK_FRAMES,
      frames: 10,
      frameMs: Array.from({ length: 10 }, () => 42),
    });
  });
});

describe('Fumi sad talk animation', () => {
  const framePaths = Array.from({ length: 12 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/talk-sad/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const sadAnchor = resolve(process.cwd(), 'public/assets/characters/fumi-sad-normalized.png');
  const blinkPaths = Array.from({ length: 8 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/fumi/tail-blink-sad/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 12 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('starts and settles on the approved sad anchor', () => {
    expect(readFileSync(framePaths[0]).equals(readFileSync(sadAnchor))).toBe(true);
    expect(readFileSync(framePaths[11]).equals(readFileSync(sadAnchor))).toBe(true);
    expect(FUMI_SAD_TALK_FRAMES).toHaveLength(12);
    expect(FUMI_SAD_TALK_CLIP).toMatchObject({
      src: FUMI_SAD_TALK_FRAMES[0],
      sources: FUMI_SAD_TALK_FRAMES,
      frames: 12,
      frameMs: Array.from({ length: 12 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 11,
    });
  });

  it('uses the sad action tail as the stable frame around its blink loop', () => {
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 8 }, () => ({ width: 800, height: 1136 })),
    );
    expect(readFileSync(blinkPaths[0]).equals(readFileSync(blinkPaths[7]))).toBe(true);
    expect(FUMI_SAD_TAIL_BLINK_FRAMES).toHaveLength(8);
    expect(FUMI_SAD_TAIL_BLINK).toMatchObject({
      src: FUMI_SAD_TAIL_BLINK_FRAMES[0],
      sources: FUMI_SAD_TAIL_BLINK_FRAMES,
      frames: 8,
      frameMs: Array.from({ length: 8 }, () => 42),
    });
  });
});

describe('Touko sad talk animation', () => {
  const framePaths = Array.from({ length: 12 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/touko/talk-sad/${String(index).padStart(2, '0')}.png`,
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
