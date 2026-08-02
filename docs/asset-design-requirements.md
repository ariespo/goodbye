# 音效·立绘特效·物品图片 设计需求清单

**用途**：列出需要额外制作的全部音频、立绘特效和物品图片资源，供美术和音效团队参考。

---

## 一、现有资产盘点

### 1.1 现有 BGM（7首）

| 文件名 | 用途 |
|--------|------|
| `silence.mp3` | 静默/雨声氛围 |
| `peace.mp3` | 温暖日常 |
| `lovely.mp3` | 甜蜜互动（旧版开场） |
| `suspense.mp3` | 微妙不安 |
| `tension.mp3` | 紧张追查 |
| `horror.mp3` | 恐惧/死亡 |
| `title.mp3` | 标题页 |

### 1.2 现有 SFX（12个）

| 文件名 | 用途 |
|--------|------|
| `ui-click.wav` | UI 点击 |
| `ui-hover.wav` | UI 悬停 |
| `ui-confirm.wav` | UI 确认 |
| `ui-cancel.wav` | UI 取消 |
| `dialogue-advance.wav` | 对话推进（打字机点击声） |
| `choice-open.wav` | 选项菜单展开 |
| `clue-add.wav` | 线索收集提示 |
| `deduction-start.wav` | 推理开始 |
| `sanity-drop.wav` | 理智下降 |
| `warning.wav` | 警告/推送通知 |
| `success.wav` | 成功/完成 |
| `ending-signal.wav` | 结局信号 |

### 1.3 现有立绘（2角色 × 6情绪 = 12张）

**文穗（fumi）**：normal / happy / sad / angry / horror / insane
**灯织（touko）**：normal / happy / sad / angry / horror / insane

每张均有 `normalized` 版本（统一画布尺寸）。

### 1.4 现有背景（14张）

`bedroom1.png` / `bedroom1-night.png` / `home.png` / `home-night.png` / `apartment.png` / `apartment.gif` / `school.png` / `school-night.png` / `supermarket.png` / `supermarket-night.png` / `street.png` / `suburbs.gif` / `black.png` / `DEATH.gif`

### 1.5 现有 UI 资源

完整的像素风 UI 框架（按钮、面板、模态框、滚动条等），`noise-film.png`（胶片噪点）、`scanline.png`（扫描线）、`scratch-film.png`（刮痕）。

### 1.6 现有情绪特效

- **MoodOverlay**：全屏覆盖层，按 mood 切换颜色和 `screenFlash` 动画
- **themes.css**：按 `data-mood` 切换 CSS 变量（文字颜色、阴影、边框色）
- **animations.css**：6 种情绪文字动画（`textHorror` / `textInsane` / `textSad` / `textAngry` / `textHappy` + 基础动画）
- **CharacterSprite**：当前只有 `grayscale(100%) contrast(120%)` 滤镜，**无情绪特效**

---

## 二、需新增的 SFX（音效）

### 2.1 情绪切换音效（6个）

当角色情绪切换时，播放对应情绪的"提示音"（极短，0.3-0.8秒）。

| 文件名 | 情绪 | 音效描述 | 参考 |
|--------|------|---------|------|
| `emotion-calm.wav` | calm → 平静 | 低沉柔和的单音"咚"，如水滴入池 | — |
| `emotion-happy.wav` | happy → 开心 | 轻快上扬的双音"叮咚"，像风铃轻碰 | 塞尔达发现物品音效 |
| `emotion-sad.wav` | sad → 悲伤 | 下沉的单音"呜"，像大提琴空弦渐弱 | — |
| `emotion-angry.wav` | angry → 愤怒 | 短促有力的"嗡"，像金属碰撞 | — |
| `emotion-horror.wav` | horror → 恐惧 | 不和谐的尖锐短促"嘶"，像弦乐拨弦突变 | 寒蝉日ync改变化 |
| `emotion-insane.wav` | insane → 癫狂 | 快速不规则的碎音"嗒嗒嗒嗒"，像走调的八音盒 | — |

**触发时机**：当 `CharacterSprite` 的 `emotion` 发生变化时，播放对应音效。
**音量**：低于 dialogue-advance，不干扰对话阅读。

### 2.2 系统音效（8个）

| 文件名 | 用途 | 音效描述 |
|--------|------|---------|
| `rain-loop.wav` | 暴雨环境循环 | 持续的雨声白噪音（可与 silence.mp3 叠加使用） |
| `rain-heavy.wav` | 暴雨加剧 | 比正常雨声更猛烈的暴雨+雷声远 |
| `thunder-distant.wav` | 远雷 | 一声闷雷（用于场景转场/闪回） |
| `phone-vibrate.wav` | 手机震动 | 手机嗡嗡声（文穗消息/天气预警推送时） |
| `phone-ring.wav` | 手机拨号 | 拨号音+无人接听忙音（玩家拨打文穗时） |
| `clock-tick.wav` | 闹钟/挂钟滴答 | 单声"滴答"，用于打字机推进或挂钟场景 |
| `loop-reset.wav` | 轮回重置 | 低频"嗡——"渐强后骤停，配合画面黑屏 |
| `flashback-whoosh.wav` | 闪回/既视感 | 短促的"呼"声+轻微磁带回放声 |

### 2.3 调查/行动音效（4个）

| 文件名 | 用途 | 音效描述 |
|--------|------|---------|
| `investigate-paper.wav` | 翻阅纸条/笔记本 | 纸张翻动声 |
| `investigate-object.wav` | 调查物品 | 手触碰物品的轻微声 |
| `door-open.wav` | 开门 | 老旧木门开合声 |
| `footstep-rain.wav` | 雨中行走 | 湿鞋踩水的脚步声 |

---

## 三、需新增的立绘特效（情绪特效）

### 3.1 特效分类

立绘特效分为两类：
- **切换特效**：情绪变化时的一次性视觉冲击（0.3-0.5秒）
- **持续特效**：情绪保持期间的持续动画效果

### 3.2 情绪 → 立绘特效映射表

| 情绪 | 切换特效（一次性） | 持续特效 | SFX |
|------|-------------------|---------|-----|
| **calm** | 轻微淡入（0.3秒） | 无额外特效 | `emotion-calm.wav` |
| **happy** | 立绘上方闪过一道暖金色反光（从左到右，0.4秒） | 立绘轻微上下浮动（±2px，2s周期） | `emotion-happy.wav` |
| **sad** | 立绘轻微下沉（translateY +3px，0.5s）后回弹 | 立绘微微下沉+冷蓝色蒙层（opacity 0.1） | `emotion-sad.wav` |
| **angry** | 立绘横向震动（±3px，0.3秒，3次） | 立绘边缘红色微光（box-shadow rgba(201,79,79,0.3)） | `emotion-angry.wav` |
| **horror** | 立绘剧烈震动（±4px，不规则，0.5秒）+ 滤镜闪红 | 立绘轻微持续颤抖（±1px）+ 滤镜增暗 | `emotion-horror.wav` |
| **insane** | 立绘色差错位（RGB split效果，0.4秒） | 立绘持续色差错位（±2px红/青偏移）+ 不规则微颤抖 | `emotion-insane.wav` |

### 3.3 特效实现方式

所有特效通过 **CSS animation + filter** 实现，不需要额外的图片资源：

```css
/* happy — 闪过反光 */
@keyframes spriteShimmer {
  0% { filter: grayscale(100%) contrast(120%); }
  50% { filter: grayscale(60%) contrast(140%) brightness(1.3); }
  100% { filter: grayscale(100%) contrast(120%); }
}

/* angry — 震动 */
@keyframes spriteShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px); }
  40% { transform: translateX(3px); }
  60% { transform: translateX(-2px); }
  80% { transform: translateX(2px); }
}

/* horror — 剧烈颤抖 */
@keyframes spriteTremble {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-2px, 1px); }
  20% { transform: translate(3px, -1px); }
  30% { transform: translate(-1px, 2px); }
  40% { transform: translate(2px, -2px); }
  50% { transform: translate(-3px, 0); }
  60% { transform: translate(1px, 1px); }
  70% { transform: translate(-2px, -1px); }
  80% { transform: translate(2px, 2px); }
  90% { transform: translate(-1px, -2px); }
}

/* insane — 色差错位 */
@keyframes spriteGlitch {
  0%, 100% { filter: grayscale(100%) contrast(120%); text-shadow: none; }
  20% { filter: grayscale(80%) contrast(150%) hue-rotate(10deg); }
  40% { filter: grayscale(100%) contrast(120%) hue-rotate(-10deg); }
  60% { filter: grayscale(70%) contrast(160%) hue-rotate(5deg); }
  80% { filter: grayscale(100%) contrast(130%); }
}

/* sad — 下沉 */
@keyframes spriteSink {
  0% { transform: translateY(0); }
  100% { transform: translateY(3px); }
}

/* happy — 浮动 */
@keyframes spriteFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
```

### 3.4 反光特效实现（happy切换）

happy 情绪切换时的"反光"效果，使用伪元素 + 渐变扫光：

```css
.character-sprite[data-emotion="happy"]::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg,
    transparent 30%,
    rgba(255, 230, 150, 0.4) 50%,
    transparent 70%);
  animation: shimmerSweep 0.4s ease-out forwards;
}

@keyframes shimmerSweep {
  0% { transform: translateX(-100%); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
}
```

---

## 四、需新增的物品图片

### 4.1 开局/剧情关键物品（像素风，与现有美术风格统一）

| ID | 文件名 | 尺寸建议 | 说明 | 出现场景 |
|----|--------|---------|------|---------|
| 1 | `item-note.png` | 120×80px | 文穗的纸条（横线纸，字迹圆润，末尾有歪歪扭扭的小猫） | 开局/每轮回变化 |
| 2 | `item-mug.png` | 100×120px | 星月夜马克杯（黑白像素风，杯身两个小人手拉手） | 开局客厅 |
| 3 | `item-medicine-bottle.png` | 60×100px | 药瓶（标签模糊，可隐约看到"利"字） | 床头柜 |
| 4 | `item-medicine-bottle-clear.png` | 60×100px | 药瓶（标签清晰可见"利培酮"） | 第4轮+ |
| 5 | `item-strawberry-hairtie.png` | 80×60px | 草莓发绳（粉色，带小草莓装饰） | 文穗房间床头 |
| 6 | `item-apron.png` | 100×140px | 绿色围裙（有补丁） | 文穗衣柜（开局缺少） |
| 7 | `item-phone.png` | 80×140px | 手机屏幕（显示文穗消息+太阳表情） | 开局 |
| 8 | `item-weather-alert.png` | 120×80px | 手机天气预警推送画面 | 开局（时间锚） |

### 4.2 调查/线索物品

| ID | 文件名 | 尺寸建议 | 说明 | 出现轮次 |
|----|--------|---------|------|---------|
| 9 | `item-receipt.png` | 100×60px | 便利店收银小票（07:30时间戳，创可贴+矿泉水） | 第1轮 |
| 10 | `item-bandaid.png` | 40×30px | 创可贴（包装纸） | 第1轮 |
| 11 | `item-notebook.png` | 100×80px | 文穗的秘密笔记本（封面磨损，内页有字） | 第2轮水塔 |
| 12 | `item-notebook-open.png` | 140×100px | 笔记本展开页（孤儿院地址、院长名字） | 第2轮+ |
| 13 | `item-flashlight.png` | 80×30px | 手电筒（旧款，电池耗尽标记） | 第2轮水塔 |
| 14 | `item-old-photo.png` | 80×60px | 孤儿院时期老照片（模糊的合影） | 第2轮水塔 |
| 15 | `item-torn-letter.png` | 120×80px | 文穗的碎信（撕碎的纸片，碎片拼合） | 第4轮（玩家线） |
| 16 | `item-altar-list.png` | 100×140px | 阳极地名单（手写，名字列表，文穗名字在列） | 第4轮（老头线） |
| 17 | `item-scratch-mark.png` | 60×80px | 侦探A手上的抓痕（特写） | 第4轮（侦探线） |
| 18 | `item-tower-engraving.png` | 120×80px | 水塔墙刻痕（"文穗 第X次来"） | 第2轮+ |

### 4.3 物品图片风格要求

- **黑白像素风**：与现有背景和 UI 风格统一，灰度为主
- **可交互**：点击后放大显示详细描述
- **轮次变体**：部分物品在不同轮回中有变体（如药瓶标签从模糊→清晰）
- **存储路径**：`public/assets/images/items/`

---

## 五、需新增的背景图片

### 5.1 重构后新增场景

| ID | 文件名 | 说明 | 对应地点 |
|----|--------|------|---------|
| 1 | `water-tower.png` | 废弃水塔内部（灰暗、潮湿、墙上有刻痕） | 文穗秘密据点 |
| 2 | `water-tower-exterior.png` | 废弃水塔外部（被树丛遮挡，雨中） | 黔灵山脚步道 |
| 3 | `mountain-trail.png` | 黔灵山脚步道（石阶、湿滑、树丛） | 步道 |
| 4 | `senpai-building.png` | 学姐商住楼外观（高档、底层咖啡厅） | 学姐楼 |
| 5 | `senpai-room.png` | 学姐公寓内部（过于干净、极简主义） | 学姐楼（进入） |
| 6 | `detective-inn.png` | 侦探小旅馆（陈旧、走廊昏暗） | 侦探住处 |
| 7 | `old-man-building.png` | 独居老头楼（老式居民楼，底层麻将馆） | 老头楼 |
| 8 | `old-man-room.png` | 老头内室（祭坛、蜡烛、名单笔记本） | 老头楼（进入） |
| 9 | `community-hospital.png` | 社区医院（白光、简陋、值班台） | 社区医院 |
| 10 | `observation-deck.png` | 山腰废弃观景台（湿滑、锈栏、陡坡） | 死亡地点 |

### 5.2 背景风格要求

- **黑白灰为主**：与现有 `bedroom1.png` 等统一
- **像素风**：16-bit 复古精致风
- **雨效层叠**：背景本身不包含雨，雨效由 CSS 叠加（已有 noise-film.png 和 scanline.png 可复用）
- **存储路径**：`public/assets/backgrounds/`

---

## 六、需新增的动画/GIF

| ID | 文件名 | 说明 | 触发条件 |
|----|--------|------|---------|
| 1 | `rain-overlay.gif` | 全屏暴雨覆盖动画（雨丝下落+水雾） | 全程暴雨场景 |
| 2 | `lightning-flash.gif` | 闪电闪烁（1-2帧白光） | 随机/特定转场 |
| 3 | `loop-transition.gif` | 轮回重置动画（画面碎裂→黑屏） | 轮回重置时 |
| 4 | `flashback-shimmer.gif` | 闪回/既视感动画（胶片抖动+模糊） | 既视感触发时 |

---

## 七、需新增的立绘

### 7.1 新角色立绘

重构设定中新增了以下角色，需要立绘：

| 角色 | 情绪需求 | 说明 |
|------|---------|------|
| 独居老头周德明 | normal / happy（慈祥）/ horror（空白脸） | 笑眯眯分糖果的老头 → 祭坛前的空白脸 |
| 侦探A赵刚 | normal / sad（罪疚与失控后的沉坠） | 消瘦、寸头、北方口音、不合身深色夹克；`sad` 是内在难过，不是泛化的慌乱脸 |
| 侦探B林静 | normal / angry | 严格黑白灰像素；低马尾、无框眼镜、实习护士伪装；`angry` 通过摘下眼镜与收紧档案夹表现控制力上升 |

### 7.2 文穗/灯织立绘补充

| 角色 | 需新增 | 说明 |
|------|--------|------|
| 文穗 | `fumi-gone.png` | 空椅子的暗示（文穗不在场时的位置标记） |
| 文穗 | `fumi-silhouette.png` | 文穗剪影/半透明灵魂形态（结局/幻觉） |
| 文穗 | `fumi-child.png` | 孤儿院时期的小文穗（老照片中） |
| 灯织 | `touko-half-closed.png` | 半眯眼（她的标志性表情，观察玩家时） |

---

## 八、优先级排序

### P0（开局必须）

| 类型 | 资源 | 理由 |
|------|------|------|
| SFX | `rain-loop.wav` | 开局暴雨氛围 |
| SFX | `phone-vibrate.wav` | 开局手机推送 |
| SFX | `phone-ring.wav` | 开局拨打文穗 |
| SFX | `flashback-whoosh.wav` | 开局既视感 |
| SFX | `emotion-calm.wav` ~ `emotion-insane.wav`（6个） | 全局立绘切换 |
| CSS | 6个立绘特效动画 | CharacterSprite 组件增强 |
| 图片 | `item-note.png` | 开局核心物品 |
| 图片 | `item-mug.png` | 开局核心物品 |
| 图片 | `item-medicine-bottle.png` | 开局可调查物品 |
| 图片 | `item-phone.png` | 开局手机 |
| 图片 | `item-weather-alert.png` | 开局时间锚 |
| GIF | `rain-overlay.gif` | 全局暴雨覆盖 |

### P1（前3轮需要）

| 类型 | 资源 | 理由 |
|------|------|------|
| SFX | `rain-heavy.wav` | 第2轮暴雨加剧 |
| SFX | `thunder-distant.wav` | 场景转场 |
| SFX | `investigate-paper.wav` | 调查纸条/笔记本 |
| SFX | `investigate-object.wav` | 调查物品 |
| SFX | `door-open.wav` | 进入新场景 |
| SFX | `footstep-rain.wav` | 雨中移动 |
| 图片 | `item-receipt.png` | 第1轮便利店 |
| 图片 | `item-notebook.png` / `item-notebook-open.png` | 第2轮水塔 |
| 图片 | `item-flashlight.png` | 第2轮水塔 |
| 图片 | `item-old-photo.png` | 第2轮水塔 |
| 图片 | `item-tower-engraving.png` | 第2轮水塔 |
| 背景 | `water-tower.png` | 第2轮 |
| 背景 | `mountain-trail.png` | 第2轮 |
| 背景 | `senpai-building.png` | 第3轮 |
| 背景 | `detective-inn.png` | 第3轮 |
| GIF | `lightning-flash.gif` | 转场 |

### P2（第4轮+/结局需要）

| 类型 | 资源 | 理由 |
|------|------|------|
| SFX | `loop-reset.wav` | 轮回重置 |
| 图片 | `item-medicine-bottle-clear.png` | 第4轮药瓶真相 |
| 图片 | `item-torn-letter.png` | 第4轮玩家线 |
| 图片 | `item-altar-list.png` | 第4轮老头线 |
| 图片 | `item-scratch-mark.png` | 第4轮侦探线 |
| 图片 | `item-strawberry-hairtie.png` | 文穗房间 |
| 图片 | `item-apron.png` | 文穗衣柜 |
| 背景 | `old-man-building.png` / `old-man-room.png` | 老头线 |
| 背景 | `community-hospital.png` | 玩家线 |
| 背景 | `observation-deck.png` | 死亡地点 |
| 背景 | `senpai-room.png` | 学姐楼（进入） |
| 立绘 | 老头（3情绪） | 老头线 |
| 立绘 | 侦探A/B | 侦探线 |
| 立绘 | `fumi-silhouette.png` | 结局 |
| GIF | `loop-transition.gif` | 轮回重置 |
