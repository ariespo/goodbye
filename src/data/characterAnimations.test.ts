import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
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
