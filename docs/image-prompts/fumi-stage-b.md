# 文穗阶段 B 图像生成提示词记录

生成方式：Codex 内置图像生成。现有文穗设计图作为身份与像素风参考；不使用外部 API Key。

## `fumi-idle-calm-strip-v1`

```text
Use the supplied Fumi animation sheet as the strict identity and pixel-art reference. Create a production-oriented four-frame horizontal strip for only the idle.calm animation.

Layout: exactly one row and four equal vertical portrait panels, separated by thin white divider lines. Each panel must show the same Fumi from head top through mid-thigh, with both hands and the white cloth visible. Flat uniform solid #ff00ff chroma-key background in every panel. No labels or text.

Frame 1: calm settled pose, gently holding the folded cloth, eyes open toward viewer.
Frame 2: very subtle inhale—shoulders and cloth rise only a tiny pixel-art amount; head and face remain fixed; eyes open.
Frame 3: natural brief blink at the same body position as frame 2.
Frame 4: exact return to frame 1 pose and placement.

Hard registration constraints: identical camera distance, identical character scale, same 430×606 logical portrait framing, same head size, head center, head-top margin, shoulder line, waist line, and mid-thigh crop in all four panels. No horizontal or vertical body drift. Frame 1 and frame 4 should visually register as the same resting keyframe.

Preserve exactly: Fumi's 14-year-old appearance, gentle face, relaxed slightly upturned eyebrows, short softly wavy brown hair, slim build, white blouse, gray-green apron with patch, white cloth, muted grayscale palette, crisp hand-authored pixel clusters and outline weight.

Avoid: redesign, changed facial proportions, changed costume, over-furrowed eyebrows, fear, exaggerated breathing, bouncing, random gaze, extra props, malformed hands, extra fingers or limbs, smooth painterly rendering, anti-aliased eyelashes, shadows on background, scenery, text, watermark.
```

后处理：分割四格，使用统一色键移除洋红背景，按等比缩放装入 `430×606` 透明画布，以最近邻算法保持像素边缘，再合成为 `1720×606` 横向精灵表。

## `fumi-talk-calm-strip-v1`

核心生成约束：以已经完成的彩色待机条作为身份、调色、像素密度和镜头的唯一权威；四帧依次为闭口、小口、中口、闭口。头、眼、肩、手、抹布、围裙和大腿截断保持不动，只允许嘴与最小范围的下颌像素变化。

首轮生成因灰阶化和人物放大被拒绝；第二轮同时引用待机权威图与失败稿，只继承失败稿的嘴型顺序。后处理按待机有效人物范围统一缩放和锚定，没有直接采用模型输出的独立镜头尺度。

## `fumi-fold-cloth-strip-v1`

六帧动作定义为：平静持布、展开并对齐边缘、将一侧折入、双手压平折痕、水平托住并短暂检查、回到基础持布。允许手臂、手、抹布和极轻的重心改变；禁止脸、发型、躯干长度、围裙、镜头和人物缩放漂移。

生成稿通过后按每格主体有效范围等比缩放到 `580px` 高，并统一放置在 `430×606` 画布的 `y=26`；展开抹布帧允许横向轮廓变宽，但不缩小整个人物。
