import type { CharacterAnimationClip, CharacterBlinkClip } from '../engine/character-animation';
import { assetUrl } from '../utils/assetUrl';

export type FumiAnimationId = 'idle' | 'talk' | 'fold';
export type ToukoAnimationId = 'idle' | 'talk' | 'reset-cuff';

const TOUKO_ANIMATION_ASSET_REVISION = '20260723-matted-cleaned-9-v1';
const TOUKO_SAD_ANIMATION_ASSET_REVISION = '20260807-talk-sad-12-v1';
const FUMI_ANIMATION_ASSET_REVISION = '20260725-matted-cleaned-9-v1';
const FUMI_EMOTION_ASSET_REVISION = '20260807-fumi-emotion-v1';
const toukoAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${TOUKO_ANIMATION_ASSET_REVISION}`);
const toukoSadAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${TOUKO_SAD_ANIMATION_ASSET_REVISION}`);
const fumiAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${FUMI_ANIMATION_ASSET_REVISION}`);
const fumiEmotionAsset = (path: string) =>
  assetUrl(`${path}?v=${FUMI_EMOTION_ASSET_REVISION}`);
const toukoMattedBlinkFrames = Array.from({ length: 9 }, (_, index) =>
  toukoAnimationAsset(
    `assets/characters/concepts/touko-blink-frames-user-v3-cleaned/matte_${String(index + 1).padStart(5, '0')}.png`,
  ),
);
const fumiMattedBlinkFrames = Array.from({ length: 9 }, (_, index) =>
  fumiAnimationAsset(
    `assets/characters/concepts/fumi-blink-frames-user-v4-cleaned/matte_${String(index + 1).padStart(5, '0')}.png`,
  ),
);

// The approved first frame is Touko's canonical calm pose. A one-frame clip
// settles onto it immediately; CharacterAnimationPlayer then runs the direct
// frame files as the regular blink loop.
const toukoCalmRestClip: CharacterAnimationClip = {
  src: toukoMattedBlinkFrames[0],
  frames: 1,
  frameMs: [1],
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: 0,
};

// 文穗的默认、人物简介与 calm 状态共享同一组经过抠图清理的眨眼帧。
// 首帧是常驻的睁眼姿态；眨眼由直接帧序列驱动，不再混入旧动作表的尾帧。
const fumiCalmRestClip: CharacterAnimationClip = {
  src: fumiMattedBlinkFrames[0],
  frames: 1,
  frameMs: [1],
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: 0,
};

export const TOUKO_SAD_TALK_FRAMES = Array.from({ length: 12 }, (_, index) =>
  toukoSadAnimationAsset(
    `assets/characters/animated/touko/talk-sad/${String(index).padStart(2, '0')}.png`,
  ),
);

// 灯织 sad 台词手势：一次完整的低气压姿态变化，之后停在末帧等待 tail-blink。
export const TOUKO_SAD_TALK_CLIP: CharacterAnimationClip = {
  src: TOUKO_SAD_TALK_FRAMES[0],
  sources: TOUKO_SAD_TALK_FRAMES,
  frames: TOUKO_SAD_TALK_FRAMES.length,
  frameMs: Array.from({ length: TOUKO_SAD_TALK_FRAMES.length }, () => 55),
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: TOUKO_SAD_TALK_FRAMES.length - 1,
};

// 用户要求复用同一组 12 帧作为 sad 情绪下的 tail-blink/呼吸循环。
export const TOUKO_SAD_TAIL_BLINK_FRAMES = TOUKO_SAD_TALK_FRAMES;

export const TOUKO_SAD_TAIL_BLINK: CharacterBlinkClip = {
  src: TOUKO_SAD_TAIL_BLINK_FRAMES[0],
  sources: TOUKO_SAD_TAIL_BLINK_FRAMES,
  frames: TOUKO_SAD_TAIL_BLINK_FRAMES.length,
  frameMs: Array.from({ length: TOUKO_SAD_TAIL_BLINK_FRAMES.length }, () => 55),
};

const TOUKO_INSANE_ANIMATION_ASSET_REVISION = '20260807-insane-10-v1';
const toukoInsaneAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${TOUKO_INSANE_ANIMATION_ASSET_REVISION}`);

export const TOUKO_INSANE_TALK_FRAMES = Array.from({ length: 10 }, (_, index) =>
  toukoInsaneAnimationAsset(
    `assets/characters/animated/touko/talk-insane/${String(index).padStart(2, '0')}.png`,
  ),
);

export const TOUKO_INSANE_TALK_CLIP: CharacterAnimationClip = {
  src: TOUKO_INSANE_TALK_FRAMES[0],
  sources: TOUKO_INSANE_TALK_FRAMES,
  frames: TOUKO_INSANE_TALK_FRAMES.length,
  frameMs: Array.from({ length: TOUKO_INSANE_TALK_FRAMES.length }, () => 42),
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: TOUKO_INSANE_TALK_FRAMES.length - 1,
};

export const TOUKO_INSANE_TAIL_BLINK_FRAMES = Array.from({ length: 14 }, (_, index) =>
  toukoInsaneAnimationAsset(
    `assets/characters/animated/touko/tail-blink-insane/${String(index).padStart(2, '0')}.png`,
  ),
);

export const TOUKO_INSANE_TAIL_BLINK: CharacterBlinkClip = {
  src: TOUKO_INSANE_TAIL_BLINK_FRAMES[0],
  sources: TOUKO_INSANE_TAIL_BLINK_FRAMES,
  frames: TOUKO_INSANE_TAIL_BLINK_FRAMES.length,
  frameMs: Array.from({ length: TOUKO_INSANE_TAIL_BLINK_FRAMES.length }, () => 42),
};

export const FUMI_HAPPY_TALK_FRAMES = Array.from({ length: 22 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/talk-happy/${String(index + 1).padStart(2, '0')}.png`,
  ),
);

export const FUMI_HAPPY_TALK_CLIP: CharacterAnimationClip = {
  src: FUMI_HAPPY_TALK_FRAMES[0],
  sources: FUMI_HAPPY_TALK_FRAMES,
  frames: FUMI_HAPPY_TALK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_HAPPY_TALK_FRAMES.length }, () => 42),
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: FUMI_HAPPY_TALK_FRAMES.length - 1,
};

export const FUMI_HAPPY_TAIL_BLINK_FRAMES = Array.from({ length: 7 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/tail-blink-happy/${String(index).padStart(2, '0')}.png`,
  ),
);

export const FUMI_HAPPY_TAIL_BLINK: CharacterBlinkClip = {
  src: FUMI_HAPPY_TAIL_BLINK_FRAMES[0],
  sources: FUMI_HAPPY_TAIL_BLINK_FRAMES,
  frames: FUMI_HAPPY_TAIL_BLINK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_HAPPY_TAIL_BLINK_FRAMES.length }, () => 42),
};

export const FUMI_SAD_TALK_FRAMES = Array.from({ length: 12 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/talk-sad/${String(index).padStart(2, '0')}.png`,
  ),
);

export const FUMI_SAD_TALK_CLIP: CharacterAnimationClip = {
  src: FUMI_SAD_TALK_FRAMES[0],
  sources: FUMI_SAD_TALK_FRAMES,
  frames: FUMI_SAD_TALK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_SAD_TALK_FRAMES.length }, () => 55),
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: FUMI_SAD_TALK_FRAMES.length - 1,
};

export const FUMI_SAD_TAIL_BLINK_FRAMES = Array.from({ length: 8 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/tail-blink-sad/${String(index).padStart(2, '0')}.png`,
  ),
);

export const FUMI_SAD_TAIL_BLINK: CharacterBlinkClip = {
  src: FUMI_SAD_TAIL_BLINK_FRAMES[0],
  sources: FUMI_SAD_TAIL_BLINK_FRAMES,
  frames: FUMI_SAD_TAIL_BLINK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_SAD_TAIL_BLINK_FRAMES.length }, () => 42),
};

export const FUMI_ANGRY_TALK_FRAMES = Array.from({ length: 20 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/talk-angry/${String(index).padStart(2, '0')}.png`,
  ),
);

export const FUMI_ANGRY_TALK_CLIP: CharacterAnimationClip = {
  src: FUMI_ANGRY_TALK_FRAMES[0],
  sources: FUMI_ANGRY_TALK_FRAMES,
  frames: FUMI_ANGRY_TALK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_ANGRY_TALK_FRAMES.length }, () => 42),
  loop: false,
  holdLastFrame: true,
  reducedMotionFrame: FUMI_ANGRY_TALK_FRAMES.length - 1,
};

export const FUMI_ANGRY_TAIL_BLINK_FRAMES = Array.from({ length: 10 }, (_, index) =>
  fumiEmotionAsset(
    `assets/characters/animated/fumi/tail-blink-angry/${String(index).padStart(2, '0')}.png`,
  ),
);

export const FUMI_ANGRY_TAIL_BLINK: CharacterBlinkClip = {
  src: FUMI_ANGRY_TAIL_BLINK_FRAMES[0],
  sources: FUMI_ANGRY_TAIL_BLINK_FRAMES,
  frames: FUMI_ANGRY_TAIL_BLINK_FRAMES.length,
  frameMs: Array.from({ length: FUMI_ANGRY_TAIL_BLINK_FRAMES.length }, () => 42),
};

export const FUMI_ANIMATION_CLIPS: Record<FumiAnimationId, CharacterAnimationClip> = {
  idle: fumiCalmRestClip,
  talk: fumiCalmRestClip,
  fold: {
    src: assetUrl('assets/characters/animated/fumi/fumi-gesture-fold-cloth.sheet.png'),
    frames: 6,
    // Pose-to-pose timing: readable anticipation, fast action, clear settle.
    // Slow exposure of the six large key poses reads as missing frames.
    frameMs: [280, 85, 90, 105, 150, 720],
    loop: false,
    holdLastFrame: true,
    reducedMotionFrame: 5,
  },
};

const fumiFullFrameBlink: CharacterBlinkClip = {
  src: fumiMattedBlinkFrames[0],
  sources: fumiMattedBlinkFrames,
  frames: 9,
  // 用户提供的帧按原顺序播放，约 24 fps；尾帧回到首帧后保持睁眼姿态。
  frameMs: [42, 42, 42, 42, 42, 42, 42, 42, 42],
};

export const FUMI_TAIL_BLINKS: Record<FumiAnimationId, CharacterBlinkClip> = {
  idle: fumiFullFrameBlink,
  talk: fumiFullFrameBlink,
  fold: fumiFullFrameBlink,
};

export const TOUKO_ANIMATION_CLIPS: Record<ToukoAnimationId, CharacterAnimationClip> = {
  idle: toukoCalmRestClip,
  talk: toukoCalmRestClip,
  'reset-cuff': {
    src: toukoAnimationAsset('assets/characters/animated/touko/touko-gesture-reset-cuff.sheet.png'),
    frames: 6,
    frameMs: [320, 90, 95, 105, 170, 760],
    loop: false,
    holdLastFrame: true,
    reducedMotionFrame: 5,
  },
};

const toukoFullFrameBlink: CharacterBlinkClip = {
  src: toukoMattedBlinkFrames[0],
  sources: toukoMattedBlinkFrames,
  frames: 9,
  // The supplied matte sequence is played verbatim at approximately 24 fps.
  frameMs: [42, 42, 42, 42, 42, 42, 42, 42, 42],
};

export const TOUKO_TAIL_BLINKS: Record<ToukoAnimationId, CharacterBlinkClip> = {
  idle: toukoFullFrameBlink,
  talk: toukoFullFrameBlink,
  'reset-cuff': toukoFullFrameBlink,
};

export function resolveFumiAnimation(
  animation: string | undefined,
  speaker: string,
): FumiAnimationId {
  if (animation === 'fold-cloth') return 'fold';
  if (animation === 'idle') return 'idle';
  if (speaker === '文穗' || speaker === '文穂' || speaker === 'fumi') return 'talk';
  return 'idle';
}

export function resolveToukoAnimation(
  animation: string | undefined,
  speaker: string,
): ToukoAnimationId {
  if (animation === 'reset-cuff') return 'reset-cuff';
  if (animation === 'idle') return 'idle';
  if (/^(沈灯织|灯织|緋室灯織|绯室灯织|touko)$/i.test(speaker)) return 'talk';
  return 'idle';
}
