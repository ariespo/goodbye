# 灯织 sad 情绪 talk 动画导入实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把用户提供的 12 张灯织 sad 帧归一化到项目标准 430×606，实装为 `TOUKO_SAD_TALK_CLIP` 并复用为 tail-blink，让 `CharacterSprite` 在 `mood === 'sad'` 时播放。

**Architecture:** 新增一个一次性 Python 归一化脚本，把源帧裁剪/缩放到 430×606 后落地到 `public/assets/characters/animated/touko/talk-sad/`；然后在 `characterAnimations.ts` 中声明 Clip 与 Blink 常量，在 `CharacterSprite.tsx` 中新增 `toukoSad` 分支，最后补充 vitest 用例。

**Tech Stack:** React + TypeScript + Vite；PNG 处理用 Pillow（Python）；测试用 vitest。

## Global Constraints

- 所有新帧必须使用项目统一逻辑画布 `430 × 606`。
- 动画 Clip 参数：`frames` 与 `frameMs` 长度一致；`loop:false` 的非循环动作必须 `holdLastFrame:true`。
- 资源 URL 必须带 revision query，使用 `assetUrl` 工具函数。
- 不得删除或修改现有 `touko-calm` 资源；`toukoSad` 分支可随时移除以回退到静态立绘。
- 代码风格与现有 `characterAnimations.ts`、`CharacterSprite.tsx` 保持一致。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `scripts/normalize-touko-sad-frames.py` | 一次性脚本：读取 `G:\灯织难过\matted_frames\*.png`，按高度 606 等比缩放，左右补透明，输出到 `public/assets/characters/animated/touko/talk-sad/00.png` ~ `11.png`。 |
| `public/assets/characters/animated/touko/talk-sad/00.png` ~ `11.png` | 归一化后的 12 帧游戏资源。 |
| `src/data/characterAnimations.ts` | 新增 `TOUKO_SAD_TALK_FRAMES`、`TOUKO_SAD_TALK_CLIP`、`TOUKO_SAD_TAIL_BLINK` 及辅助 asset URL 函数。 |
| `src/components/game/CharacterSprite.tsx` | 新增 `toukoSad` 分支，把 sad 情绪路由到新的 Clip 与 Blink。 |
| `src/data/characterAnimations.test.ts` | 新增灯织 sad 动画测试，验证尺寸、配置和 tail-blink 复用。 |

---

### Task 1: Normalize and import the 12 source frames

**Files:**
- Create: `scripts/normalize-touko-sad-frames.py`
- Create: `public/assets/characters/animated/touko/talk-sad/00.png` ~ `11.png`

**Interfaces:**
- Consumes: raw frames at `G:\灯织难过\matted_frames\matte_*.png` (656×1392)
- Produces: 12 normalized PNGs at `public/assets/characters/animated/touko/talk-sad/{00..11}.png` (430×606)

- [ ] **Step 1: Create the normalization script**

```python
from pathlib import Path
from PIL import Image

SRC_DIR = Path('G:/灯织难过/matted_frames')
OUT_DIR = Path('public/assets/characters/animated/touko/talk-sad')
CANVAS_W, CANVAS_H = 430, 606

OUT_DIR.mkdir(parents=True, exist_ok=True)

files = sorted(SRC_DIR.glob('matte_*.png'))
if len(files) != 12:
    raise SystemExit(f'Expected 12 frames, found {len(files)}')

for idx, src in enumerate(files):
    img = Image.open(src).convert('RGBA')
    # Height-fit while preserving aspect ratio.
    ratio = CANVAS_H / img.height
    new_w = int(round(img.width * ratio))
    resized = img.resize((new_w, CANVAS_H), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - new_w) // 2
    canvas.paste(resized, (x, 0), resized)

    out = OUT_DIR / f'{idx:02d}.png'
    canvas.save(out)
    print(f'Wrote {out}')
```

- [ ] **Step 2: Ensure Pillow is installed**

Run:
```bash
python -c "from PIL import Image; print('Pillow OK')"
```
Expected: prints `Pillow OK`. If not, run `pip install Pillow`.

- [ ] **Step 3: Run the script**

Run:
```bash
python scripts/normalize-touko-sad-frames.py
```
Expected: prints 12 `Wrote ...` lines.

- [ ] **Step 4: Verify output dimensions**

Run:
```bash
node -e "const fs=require('fs'); for(let i=0;i<12;i++){ const b=fs.readFileSync(`public/assets/characters/animated/touko/talk-sad/${String(i).padStart(2,'0')}.png`); console.log(i, b.readUInt32BE(16), b.readUInt32BE(20)); }"
```
Expected: each line shows `i 430 606`.

- [ ] **Step 5: Commit the normalized assets**

```bash
git add public/assets/characters/animated/touko/talk-sad scripts/normalize-touko-sad-frames.py
git commit -m "$(cat <<'EOF'
assets: normalize and import Touko sad talk frames

- Scale 12 provided matted frames to project 430x606 canvas.
- Keep full figure via height-fit + transparent side padding.
- Add one-off normalization script for reproducibility.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Define the animation Clip and Blink constants

**Files:**
- Modify: `src/data/characterAnimations.ts`

**Interfaces:**
- Consumes: existing `CharacterAnimationClip`, `CharacterBlinkClip` types; existing `assetUrl` helper
- Produces: exported `TOUKO_SAD_TALK_CLIP`, `TOUKO_SAD_TAIL_BLINK`, `TOUKO_SAD_TALK_FRAMES`

- [ ] **Step 1: Add the revision and frame builder**

Insert after `const TOUKO_ANIMATION_ASSET_REVISION` (line 7):

```ts
const TOUKO_SAD_ANIMATION_ASSET_REVISION = '20260807-talk-sad-12-v1';
```

Insert after the `toukoAnimationAsset` helper (line 14):

```ts
const toukoSadAnimationAsset = (path: string) =>
  assetUrl(`${path}?v=${TOUKO_SAD_ANIMATION_ASSET_REVISION}`);
```

- [ ] **Step 2: Add the frame array, Clip and Blink**

Insert before `export const FUMI_ANIMATION_CLIPS` (around line 153):

```ts
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
```

- [ ] **Step 3: Type-check the file**

Run:
```bash
npx tsc --noEmit src/data/characterAnimations.ts
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/data/characterAnimations.ts
git commit -m "$(cat <<'EOF'
data: add Touko sad talk clip and tail-blink constants

- 12 frames at 55ms, non-looping, hold last frame.
- Reuse the same frames as tail-blink per design spec.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the new animation into CharacterSprite

**Files:**
- Modify: `src/components/game/CharacterSprite.tsx`

**Interfaces:**
- Consumes: `TOUKO_SAD_TALK_CLIP`, `TOUKO_SAD_TAIL_BLINK`, `TOUKO_SAD_TALK_FRAMES` from `characterAnimations.ts`
- Produces: `toukoSad` branch that renders the new clip when mood is sad and sprite is `touko-sad`

- [ ] **Step 1: Import the new constants**

Update the import block (around line 9) to include:

```ts
import {
  FUMI_ANIMATION_CLIPS,
  FUMI_ANGRY_TALK_CLIP,
  FUMI_ANGRY_TALK_FRAMES,
  FUMI_ANGRY_TAIL_BLINK,
  FUMI_HAPPY_TALK_CLIP,
  FUMI_HAPPY_TALK_FRAMES,
  FUMI_HAPPY_TAIL_BLINK,
  FUMI_SAD_TALK_CLIP,
  FUMI_SAD_TALK_FRAMES,
  FUMI_SAD_TAIL_BLINK,
  FUMI_TAIL_BLINKS,
  TOUKO_ANIMATION_CLIPS,
  TOUKO_SAD_TALK_CLIP,
  TOUKO_SAD_TALK_FRAMES,
  TOUKO_SAD_TAIL_BLINK,
  TOUKO_TAIL_BLINKS,
  resolveFumiAnimation,
  resolveToukoAnimation,
} from '../../data/characterAnimations';
```

- [ ] **Step 2: Add the mood flag**

Insert after `const fumiAngry = ...` (line 66):

```ts
const toukoSad = mood === 'sad' && /^touko-sad(?:-normalized)?\.png$/i.test(sprite);
```

- [ ] **Step 3: Route animationClip through toukoSad**

Replace the `animationClip` assignment (lines 69-79) with:

```ts
const animationClip = fumiHappy
  ? FUMI_HAPPY_TALK_CLIP
  : fumiSad
    ? FUMI_SAD_TALK_CLIP
    : fumiAngry
      ? FUMI_ANGRY_TALK_CLIP
      : fumiCalm
        ? FUMI_ANIMATION_CLIPS[fumiAnimationId]
        : toukoSad
          ? TOUKO_SAD_TALK_CLIP
          : toukoCalm
            ? TOUKO_ANIMATION_CLIPS[toukoAnimationId]
            : null;
```

- [ ] **Step 4: Route tailBlink through toukoSad**

Replace the `tailBlink` assignment (lines 80-90) with:

```ts
const tailBlink = fumiHappy
  ? FUMI_HAPPY_TAIL_BLINK
  : fumiSad
    ? FUMI_SAD_TAIL_BLINK
    : fumiAngry
      ? FUMI_ANGRY_TAIL_BLINK
      : fumiCalm
        ? FUMI_TAIL_BLINKS[fumiAnimationId]
        : toukoSad
          ? TOUKO_SAD_TAIL_BLINK
          : toukoCalm
            ? TOUKO_TAIL_BLINKS[toukoAnimationId]
            : undefined;
```

- [ ] **Step 5: Update fallbackSrc**

Replace the `fallbackSrc` expression (lines 116-122) with:

```ts
fallbackSrc={fumiHappy
  ? FUMI_HAPPY_TALK_FRAMES[0]
  : fumiSad
    ? FUMI_SAD_TALK_FRAMES[0]
    : fumiAngry
      ? FUMI_ANGRY_TALK_FRAMES[0]
      : toukoSad
        ? TOUKO_SAD_TALK_FRAMES[0]
        : src}
```

- [ ] **Step 6: Type-check**

Run:
```bash
npx tsc --noEmit src/components/game/CharacterSprite.tsx
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/game/CharacterSprite.tsx
git commit -m "$(cat <<'EOF'
feat: route Touko sad mood to new talk clip and tail-blink

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add tests for the Touko sad animation

**Files:**
- Modify: `src/data/characterAnimations.test.ts`

**Interfaces:**
- Consumes: `TOUKO_SAD_TALK_CLIP`, `TOUKO_SAD_TAIL_BLINK`, `TOUKO_SAD_TALK_FRAMES`
- Produces: passing vitest assertions for frame sizes and clip config

- [ ] **Step 1: Import the new constants**

Update the import list (around line 5) to include:

```ts
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
} from './characterAnimations';
```

- [ ] **Step 2: Append the test describe block**

Add at the end of the file:

```ts
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
```

- [ ] **Step 3: Run the new tests**

Run:
```bash
npx vitest run src/data/characterAnimations.test.ts
```
Expected: all tests pass, including the new Touko sad block.

- [ ] **Step 4: Commit**

```bash
git add src/data/characterAnimations.test.ts
git commit -m "$(cat <<'EOF'
test: add Touko sad animation assertions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Optional — add manifest entry for the character lab

**Files:**
- Create or modify: `public/assets/characters/animated/touko/manifest.json`

**Interfaces:**
- Consumes: existing manifest schema in `src/engine/character-animation.ts`
- Produces: `talk.sad` clip entry so `/?characterLab=1` can preview it

Skip this task if the team is not yet using the lab previewer for Touko. If implementing:

- [ ] **Step 1: Create/modify the manifest**

```json
{
  "character": "touko",
  "status": "stage-b-partial",
  "frameWidth": 430,
  "frameHeight": 606,
  "clips": {
    "talk.sad": {
      "src": "talk-sad/00.png",
      "sources": [
        "talk-sad/00.png", "talk-sad/01.png", "talk-sad/02.png", "talk-sad/03.png",
        "talk-sad/04.png", "talk-sad/05.png", "talk-sad/06.png", "talk-sad/07.png",
        "talk-sad/08.png", "talk-sad/09.png", "talk-sad/10.png", "talk-sad/11.png"
      ],
      "frames": 12,
      "frameMs": [55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55],
      "loop": false,
      "holdLastFrame": true,
      "reducedMotionFrame": 11,
      "tailBlink": "talk-sad/00.png",
      "tailBlinkSources": [
        "talk-sad/00.png", "talk-sad/01.png", "talk-sad/02.png", "talk-sad/03.png",
        "talk-sad/04.png", "talk-sad/05.png", "talk-sad/06.png", "talk-sad/07.png",
        "talk-sad/08.png", "talk-sad/09.png", "talk-sad/10.png", "talk-sad/11.png"
      ],
      "tailBlinkFrameMs": [55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55, 55]
    }
  }
}
```

- [ ] **Step 2: Validate the manifest**

Run a quick TypeScript/node check against `validateCharacterAnimationManifest` if a validator script exists; otherwise visually confirm field counts.

- [ ] **Step 3: Commit**

```bash
git add public/assets/characters/animated/touko/manifest.json
git commit -m "$(cat <<'EOF'
docs: add talk.sad entry to Touko animation manifest

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- 资源归一化 → Task 1
- 动画配置 → Task 2
- CharacterSprite 接线 → Task 3
- 测试 → Task 4
- manifest 可选补充 → Task 5

**Placeholder scan:** 无 TBD/TODO；所有代码块均为可直接运行的实际内容。

**Type consistency：**
- `TOUKO_SAD_TALK_CLIP` 使用 `CharacterAnimationClip`；
- `TOUKO_SAD_TAIL_BLINK` 使用 `CharacterBlinkClip`；
- `CharacterSprite` 中 `toukoSad` 分支与 `fumiSad` 分支模式一致。
