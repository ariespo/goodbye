import type { CharacterAnimationClip, CharacterBlinkClip } from '../engine/character-animation';
import { assetUrl } from '../utils/assetUrl';

export type FumiAnimationId = 'idle' | 'talk' | 'fold';
export type ToukoAnimationId = 'idle' | 'talk' | 'reset-cuff';

const TOUKO_ANIMATION_ASSET_REVISION = '20260723-matted-cleaned-9-v1';
const FUMI_ANIMATION_ASSET_REVISION = '20260725-matted-cleaned-9-v1';
const toukoAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${TOUKO_ANIMATION_ASSET_REVISION}`);
const fumiAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${FUMI_ANIMATION_ASSET_REVISION}`);
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
