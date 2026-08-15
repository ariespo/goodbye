import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CHEN_HUIHUI_ANGRY_TALK_CLIP,
  CHEN_HUIHUI_ANGRY_TALK_FRAMES,
  CHEN_HUIHUI_ANGRY_TAIL_BLINK,
  CHEN_HUIHUI_ANGRY_TAIL_BLINK_FRAMES,
  CHEN_HUIHUI_CALM_TALK_CLIP,
  CHEN_HUIHUI_CALM_TALK_FRAMES,
  CHEN_HUIHUI_CALM_PROFILE_CLIP,
  CHEN_HUIHUI_CALM_TAIL_BLINK,
  CHEN_HUIHUI_CALM_TAIL_BLINK_FRAMES,
  CHEN_HUIHUI_HAPPY_TALK_CLIP,
  CHEN_HUIHUI_HAPPY_TALK_FRAMES,
  CHEN_HUIHUI_HAPPY_TAIL_BLINK,
  CHEN_HUIHUI_HAPPY_TAIL_BLINK_FRAMES,
  CHEN_HUIHUI_SAD_TALK_CLIP,
  CHEN_HUIHUI_SAD_TALK_FRAMES,
  CHEN_HUIHUI_SAD_TAIL_BLINK,
  CHEN_HUIHUI_SAD_TAIL_BLINK_FRAMES,
  FUMI_ANGRY_TALK_CLIP,
  FUMI_ANGRY_TALK_FRAMES,
  FUMI_ANGRY_TAIL_BLINK,
  FUMI_HAPPY_TALK_CLIP,
  FUMI_HAPPY_TALK_FRAMES,
  FUMI_HAPPY_TAIL_BLINK,
  FUMI_SAD_TALK_CLIP,
  FUMI_SAD_TALK_FRAMES,
  FUMI_SAD_TAIL_BLINK,
  LIN_JING_CALM_PROFILE_CLIP,
  LIN_JING_CALM_TALK_CLIP,
  LIN_JING_CALM_TALK_FRAMES,
  LIN_JING_CALM_TAIL_BLINK,
  LIN_JING_CALM_TAIL_BLINK_FRAMES,
  OLD_MAN_ANGRY_TALK_CLIP,
  OLD_MAN_ANGRY_TALK_FRAMES,
  OLD_MAN_ANGRY_TAIL_BLINK,
  OLD_MAN_ANGRY_TAIL_BLINK_FRAMES,
  OLD_MAN_CALM_TALK_CLIP,
  OLD_MAN_CALM_TALK_FRAMES,
  OLD_MAN_CALM_TAIL_BLINK,
  OLD_MAN_CALM_TAIL_BLINK_FRAMES,
  OLD_MAN_HAPPY_TALK_CLIP,
  OLD_MAN_HAPPY_TALK_FRAMES,
  OLD_MAN_HAPPY_TAIL_BLINK,
  OLD_MAN_HAPPY_TAIL_BLINK_FRAMES,
  OLD_MAN_INSANE_TALK_CLIP,
  OLD_MAN_INSANE_TALK_FRAMES,
  OLD_MAN_INSANE_TAIL_BLINK,
  OLD_MAN_INSANE_TAIL_BLINK_FRAMES,
  OLD_MAN_SAD_TALK_CLIP,
  OLD_MAN_SAD_TALK_FRAMES,
  OLD_MAN_SAD_TAIL_BLINK,
  OLD_MAN_SAD_TAIL_BLINK_FRAMES,
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
  ZHAO_GANG_CALM_PROFILE_CLIP,
  ZHAO_GANG_CALM_TALK_CLIP,
  ZHAO_GANG_CALM_TALK_FRAMES,
  ZHAO_GANG_CALM_TAIL_BLINK,
  ZHAO_GANG_CALM_TAIL_BLINK_FRAMES,
} from './characterAnimations';

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('Chen Huihui calm/default animation', () => {
  const framePaths = Array.from({ length: 25 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/chen-huihui/talk-calm-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const blinkPaths = Array.from({ length: 9 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/chen-huihui/tail-blink-calm-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 25 }, () => ({ width: 430, height: 606 })),
    );
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 9 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the final calm pose, and uses the supplied blink clip', () => {
    expect(CHEN_HUIHUI_CALM_TALK_FRAMES).toHaveLength(25);
    expect(CHEN_HUIHUI_CALM_TALK_CLIP).toMatchObject({
      src: CHEN_HUIHUI_CALM_TALK_FRAMES[0],
      sources: CHEN_HUIHUI_CALM_TALK_FRAMES,
      frames: 25,
      frameMs: Array.from({ length: 25 }, () => 60),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 24,
    });
    expect(CHEN_HUIHUI_CALM_TAIL_BLINK).toMatchObject({
      src: CHEN_HUIHUI_CALM_TAIL_BLINK_FRAMES[0],
      sources: CHEN_HUIHUI_CALM_TAIL_BLINK_FRAMES,
      frames: 9,
      frameMs: Array.from({ length: 9 }, () => 79),
    });
  });

  it('uses the blink resting frame directly in the character profile', () => {
    expect(CHEN_HUIHUI_CALM_PROFILE_CLIP).toMatchObject({
      src: CHEN_HUIHUI_CALM_TAIL_BLINK_FRAMES[0],
      sources: [CHEN_HUIHUI_CALM_TAIL_BLINK_FRAMES[0]],
      frames: 1,
      frameMs: [1],
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 0,
    });
  });
});

describe('Lin Jing calm/default animation', () => {
  const framePaths = Array.from({ length: 5 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/detective-b/talk-calm-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs all five supplied frames on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 5 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('reuses the calm sequence for scene blink and character profile animation', () => {
    expect(LIN_JING_CALM_TALK_CLIP).toMatchObject({
      src: LIN_JING_CALM_TALK_FRAMES[0],
      sources: LIN_JING_CALM_TALK_FRAMES,
      frames: 5,
      frameMs: Array.from({ length: 5 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 4,
    });
    expect(LIN_JING_CALM_TAIL_BLINK_FRAMES).toBe(LIN_JING_CALM_TALK_FRAMES);
    expect(LIN_JING_CALM_TAIL_BLINK).toMatchObject({
      sources: LIN_JING_CALM_TALK_FRAMES,
      frames: 5,
      frameMs: Array.from({ length: 5 }, () => 55),
    });
    expect(LIN_JING_CALM_PROFILE_CLIP).toBe(LIN_JING_CALM_TALK_CLIP);
  });
});

describe('Zhao Gang calm/default animation', () => {
  const framePaths = Array.from({ length: 9 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/detective-a/talk-calm-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs all nine supplied frames on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 9 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('reuses the calm sequence for scene blink and character profile animation', () => {
    expect(ZHAO_GANG_CALM_TALK_CLIP).toMatchObject({
      src: ZHAO_GANG_CALM_TALK_FRAMES[0],
      sources: ZHAO_GANG_CALM_TALK_FRAMES,
      frames: 9,
      frameMs: Array.from({ length: 9 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 8,
    });
    expect(ZHAO_GANG_CALM_TAIL_BLINK_FRAMES).toBe(ZHAO_GANG_CALM_TALK_FRAMES);
    expect(ZHAO_GANG_CALM_TAIL_BLINK).toMatchObject({
      sources: ZHAO_GANG_CALM_TALK_FRAMES,
      frames: 9,
      frameMs: Array.from({ length: 9 }, () => 55),
    });
    expect(ZHAO_GANG_CALM_PROFILE_CLIP).toBe(ZHAO_GANG_CALM_TALK_CLIP);
  });
});

describe('Chen Huihui happy animation', () => {
  const framePaths = Array.from({ length: 14 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/chen-huihui/talk-happy-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 14 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the final frame, and reuses the sequence for blinking', () => {
    expect(CHEN_HUIHUI_HAPPY_TALK_CLIP).toMatchObject({
      src: CHEN_HUIHUI_HAPPY_TALK_FRAMES[0],
      sources: CHEN_HUIHUI_HAPPY_TALK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 60),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 13,
    });
    expect(CHEN_HUIHUI_HAPPY_TAIL_BLINK_FRAMES).toBe(CHEN_HUIHUI_HAPPY_TALK_FRAMES);
    expect(CHEN_HUIHUI_HAPPY_TAIL_BLINK).toMatchObject({
      src: CHEN_HUIHUI_HAPPY_TALK_FRAMES[0],
      sources: CHEN_HUIHUI_HAPPY_TALK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 60),
    });
  });
});

describe('Chen Huihui angry animation', () => {
  const framePaths = Array.from({ length: 25 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/chen-huihui/talk-angry-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 25 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the final frame, and reuses the sequence for blinking', () => {
    expect(CHEN_HUIHUI_ANGRY_TALK_CLIP).toMatchObject({
      src: CHEN_HUIHUI_ANGRY_TALK_FRAMES[0],
      sources: CHEN_HUIHUI_ANGRY_TALK_FRAMES,
      frames: 25,
      frameMs: Array.from({ length: 25 }, () => 60),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 24,
    });
    expect(CHEN_HUIHUI_ANGRY_TAIL_BLINK_FRAMES).toBe(CHEN_HUIHUI_ANGRY_TALK_FRAMES);
    expect(CHEN_HUIHUI_ANGRY_TAIL_BLINK).toMatchObject({
      sources: CHEN_HUIHUI_ANGRY_TALK_FRAMES,
      frames: 25,
      frameMs: Array.from({ length: 25 }, () => 60),
    });
  });
});

describe('Chen Huihui sad animation', () => {
  const framePaths = Array.from({ length: 25 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/chen-huihui/talk-sad-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 25 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the final frame, and reuses the sequence for blinking', () => {
    expect(CHEN_HUIHUI_SAD_TALK_CLIP).toMatchObject({
      src: CHEN_HUIHUI_SAD_TALK_FRAMES[0],
      sources: CHEN_HUIHUI_SAD_TALK_FRAMES,
      frames: 25,
      frameMs: Array.from({ length: 25 }, () => 60),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 24,
    });
    expect(CHEN_HUIHUI_SAD_TAIL_BLINK_FRAMES).toBe(CHEN_HUIHUI_SAD_TALK_FRAMES);
    expect(CHEN_HUIHUI_SAD_TAIL_BLINK).toMatchObject({
      sources: CHEN_HUIHUI_SAD_TALK_FRAMES,
      frames: 25,
      frameMs: Array.from({ length: 25 }, () => 60),
    });
  });
});

describe('Zhou Deming calm/default animation', () => {
  const framePaths = Array.from({ length: 8 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/talk-calm-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 8 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and reuses the same sequence for blinking', () => {
    expect(OLD_MAN_CALM_TALK_FRAMES).toHaveLength(8);
    expect(OLD_MAN_CALM_TALK_CLIP).toMatchObject({
      src: OLD_MAN_CALM_TALK_FRAMES[0],
      sources: OLD_MAN_CALM_TALK_FRAMES,
      frames: 8,
      frameMs: Array.from({ length: 8 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 7,
    });
    expect(OLD_MAN_CALM_TAIL_BLINK_FRAMES).toBe(OLD_MAN_CALM_TALK_FRAMES);
    expect(OLD_MAN_CALM_TAIL_BLINK).toMatchObject({
      src: OLD_MAN_CALM_TALK_FRAMES[0],
      sources: OLD_MAN_CALM_TALK_FRAMES,
      frames: 8,
      frameMs: Array.from({ length: 8 }, () => 55),
    });
  });
});

describe('Zhou Deming angry animation', () => {
  const framePaths = Array.from({ length: 12 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/talk-angry-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 12 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and reuses the same sequence for blinking', () => {
    expect(OLD_MAN_ANGRY_TALK_FRAMES).toHaveLength(12);
    expect(OLD_MAN_ANGRY_TALK_CLIP).toMatchObject({
      src: OLD_MAN_ANGRY_TALK_FRAMES[0],
      sources: OLD_MAN_ANGRY_TALK_FRAMES,
      frames: 12,
      frameMs: Array.from({ length: 12 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 11,
    });
    expect(OLD_MAN_ANGRY_TAIL_BLINK_FRAMES).toBe(OLD_MAN_ANGRY_TALK_FRAMES);
    expect(OLD_MAN_ANGRY_TAIL_BLINK).toMatchObject({
      src: OLD_MAN_ANGRY_TALK_FRAMES[0],
      sources: OLD_MAN_ANGRY_TALK_FRAMES,
      frames: 12,
      frameMs: Array.from({ length: 12 }, () => 42),
    });
  });
});

describe('Zhou Deming sad animation', () => {
  const framePaths = Array.from({ length: 15 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/talk-sad-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 15 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and reuses the same sequence for blinking', () => {
    expect(OLD_MAN_SAD_TALK_FRAMES).toHaveLength(15);
    expect(OLD_MAN_SAD_TALK_CLIP).toMatchObject({
      src: OLD_MAN_SAD_TALK_FRAMES[0],
      sources: OLD_MAN_SAD_TALK_FRAMES,
      frames: 15,
      frameMs: Array.from({ length: 15 }, () => 55),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 14,
    });
    expect(OLD_MAN_SAD_TAIL_BLINK_FRAMES).toBe(OLD_MAN_SAD_TALK_FRAMES);
    expect(OLD_MAN_SAD_TAIL_BLINK).toMatchObject({
      src: OLD_MAN_SAD_TALK_FRAMES[0],
      sources: OLD_MAN_SAD_TALK_FRAMES,
      frames: 15,
      frameMs: Array.from({ length: 15 }, () => 55),
    });
  });
});

describe('Zhou Deming insane animation', () => {
  const framePaths = Array.from({ length: 13 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/talk-insane-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const blinkPaths = Array.from({ length: 18 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/tail-blink-insane-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 13 }, () => ({ width: 430, height: 606 })),
    );
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 18 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and uses the supplied blink sequence', () => {
    expect(OLD_MAN_INSANE_TALK_FRAMES).toHaveLength(13);
    expect(OLD_MAN_INSANE_TALK_CLIP).toMatchObject({
      src: OLD_MAN_INSANE_TALK_FRAMES[0],
      sources: OLD_MAN_INSANE_TALK_FRAMES,
      frames: 13,
      frameMs: Array.from({ length: 13 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 12,
    });
    expect(OLD_MAN_INSANE_TAIL_BLINK_FRAMES).not.toBe(OLD_MAN_INSANE_TALK_FRAMES);
    expect(OLD_MAN_INSANE_TAIL_BLINK).toMatchObject({
      src: OLD_MAN_INSANE_TAIL_BLINK_FRAMES[0],
      sources: OLD_MAN_INSANE_TAIL_BLINK_FRAMES,
      frames: 18,
      frameMs: Array.from({ length: 18 }, () => 42),
    });
  });
});

describe('Zhou Deming happy animation', () => {
  const framePaths = Array.from({ length: 14 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/talk-happy-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );
  const blinkPaths = Array.from({ length: 8 }, (_, index) =>
    resolve(
      process.cwd(),
      `public/assets/characters/animated/old-man/tail-blink-happy-cleaned/${String(index).padStart(2, '0')}.png`,
    ),
  );

  it('installs every supplied frame on the standard character canvas', () => {
    expect(framePaths.map(pngSize)).toEqual(
      Array.from({ length: 14 }, () => ({ width: 430, height: 606 })),
    );
    expect(blinkPaths.map(pngSize)).toEqual(
      Array.from({ length: 8 }, () => ({ width: 430, height: 606 })),
    );
  });

  it('plays once, holds the last frame, and uses the supplied blink sequence', () => {
    expect(OLD_MAN_HAPPY_TALK_FRAMES).toHaveLength(14);
    expect(OLD_MAN_HAPPY_TALK_CLIP).toMatchObject({
      src: OLD_MAN_HAPPY_TALK_FRAMES[0],
      sources: OLD_MAN_HAPPY_TALK_FRAMES,
      frames: 14,
      frameMs: Array.from({ length: 14 }, () => 42),
      loop: false,
      holdLastFrame: true,
      reducedMotionFrame: 13,
    });
    expect(OLD_MAN_HAPPY_TAIL_BLINK_FRAMES).not.toBe(OLD_MAN_HAPPY_TALK_FRAMES);
    expect(OLD_MAN_HAPPY_TAIL_BLINK).toMatchObject({
      src: OLD_MAN_HAPPY_TAIL_BLINK_FRAMES[0],
      sources: OLD_MAN_HAPPY_TAIL_BLINK_FRAMES,
      frames: 8,
      frameMs: Array.from({ length: 8 }, () => 42),
    });
  });
});

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
