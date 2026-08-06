# 灯织 sad 情绪 talk 动画导入设计

## 目标
把用户提供的 `G:\灯织难过\matted_frames\matte_00001.png` ~ `matte_00012.png` 导入项目，实装为沈灯织（touko）在 `sad` 情绪下的台词手势动画，并按用户要求把同一组 12 帧同时作为 tail-blink 复用。

## 源资产
- 路径：`G:\灯织难过\matted_frames\`
- 文件：`matte_00001.png` ~ `matte_00012.png`，共 12 帧
- 原始尺寸：656 × 1392
- 内容：从发顶到大腿中段的悲伤姿态

## 归一化方案
项目统一逻辑画布为 430 × 606，但原图纵横比与画布不同。为保留完整人物且不裁切内容，采用 **高度等比缩放 + 左右补透明边** 的方式：
- 以高度 606 为基准等比缩放；
- 缩放后宽度不足 430 的部分，左右填充透明像素；
- 最终输出为 430 × 606 的 PNG，带透明边距。

输出目录：
```text
public/assets/characters/animated/touko/talk-sad/
  00.png
  01.png
  ...
  11.png
```

## 动画配置（`src/data/characterAnimations.ts`）

新增常量：
- `TOUKO_SAD_TALK_FRAMES`：12 帧路径数组。
- `TOUKO_SAD_TALK_CLIP`：
  - `frames: 12`
  - `frameMs: [55, 55, ..., 55]`（ sadness 放慢，与文穗 sad 一致）
  - `loop: false`
  - `holdLastFrame: true`
  - `reducedMotionFrame: 11`
- `TOUKO_SAD_TAIL_BLINK`：直接复用 `TOUKO_SAD_TALK_FRAMES`，
  - `frames: 12`
  - `frameMs: [55, ..., 55]`

新增 asset revision：例如 `20260806-talk-sad-12-v1`。

## 播放器接线（`src/components/game/CharacterSprite.tsx`）

1. 新增 `toukoSad` 判断：
   ```ts
   const toukoSad = mood === 'sad' && /^touko-sad(?:-normalized)?\.png$/i.test(sprite);
   ```
2. 在 `animationClip` 选择链中加入 `toukoSad` 分支，返回 `TOUKO_SAD_TALK_CLIP`。
3. 在 `tailBlink` 选择链中加入 `toukoSad` 分支，返回 `TOUKO_SAD_TAIL_BLINK`。
4. `fallbackSrc` 使用 `TOUKO_SAD_TALK_FRAMES[0]`。

这样当剧情出现 `对话|沈灯织|sad|...` 时，灯织会先播一次悲伤手势，然后每约 2.6 秒循环一次这 12 帧作为尾部呼吸/眨眼动画。

## 测试（`src/data/characterAnimations.test.ts`）

新增一个 `describe('Touko sad talk animation', ...)` 块，验证：
- 12 帧尺寸均为 430 × 606；
- `TOUKO_SAD_TALK_CLIP` 配置正确（12 帧、55ms、非循环、末帧停留）；
- `TOUKO_SAD_TAIL_BLINK` 复用同一组 12 帧。

## 可选补充

在 `public/assets/characters/animated/touko/manifest.json` 中补充 `talk.sad` 记录，方便 `/?characterLab=1` 预览器验收。

## 回滚策略

所有改动均为新增，不删除现有 `touko-calm` 资源。若效果不理想，只需在 `CharacterSprite.tsx` 中移除 `toukoSad` 分支即可回退到静态 `touko-sad-normalized.png`。
