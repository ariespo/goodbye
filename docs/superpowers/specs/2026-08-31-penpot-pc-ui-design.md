# Penpot PC UI 设计规格

## 目标

在一个新建的 Penpot 文件中，以 `1920 × 1080` 标准 PC 画布重建已确认的黑白低清 8-bit 主界面。交付物只包含 UI 覆盖层，不处理、导入或导出游戏背景。最终设计需要同时满足视觉还原、组件复用和开发交接。

视觉参考为 `H:\goodbye\ui-concepts\14-pc-large-screen-ui.png`。该图片只用于描摹布局；Penpot 最终画布保持透明背景。

## 范围

本阶段只制作 PC 端。手机端、背景读取规则、场景图片、线索子界面和档案子界面均不在范围内。

PC 端包含两个页面状态：

1. `PC / Wheel Closed`：左下角只显示操作光圈中心。
2. `PC / Wheel Open`：操作光圈在原位置展开为五项扇形轮盘。

## 还原方式

采用组件优先的混合式工作流：

- 边框、状态栏、轮盘、操作中心、对白框和播放控制使用 Penpot 矢量组件重建。
- 像素图标制作成独立 SVG，并导入 Penpot 资源页。
- 背景不制作。参考图可临时作为锁定、低透明度的描摹层，但在最终页面中必须隐藏。
- 所有尺寸和坐标吸附到 `4px` 网格；主要边框使用 `4px` 或 `8px`，避免半像素坐标。

## 字体

所有中文、数字和状态值统一使用项目实际默认字体 `RenOuFangSong 16 / 人偶仿宋`。

依据：

- `src/styles/globals.css` 将 `--game-font-family` 默认设置为 `"RenOuFangSong 16"`。
- `src/utils/fonts.ts` 将 `renou-fangsong` 作为首选和未指定时的回退选项。
- `src/sillytavern/database.ts` 将新设置和迁移设置默认值设为 `renou-fangsong`。
- 字体资源由 `public/assets/fonts/916/font.css` 本地托管。

Penpot 中优先上传并使用该字体。若当前 Penpot 环境不允许上传自定义字体，则阻止最终验收：不以其他字体冒充 1:1 完成。可先用 SVG 字形轮廓进行视觉校准，但必须保留明确标记，待字体可用后替换为可编辑文本。

## 颜色与像素规则

建立以下共享颜色样式：

| Token | 值 | 用途 |
| --- | --- | --- |
| `UI / Black` | `#050505` | 面板和按钮底色 |
| `UI / White` | `#F2F2F0` | 主文字、主边框和高亮 |
| `UI / Gray` | `#8A8A88` | 次要文字和灰阶像素 |
| `UI / Dark Gray` | `#3A3A3A` | 未激活状态和抖动纹理 |

不使用蓝色、黄色、渐变、柔化阴影或抗锯齿装饰。反白状态仅交换黑白填充与文字颜色。

## Penpot 文件结构

新文件包含以下页面：

```text
00 Cover
01 Assets
02 Components
03 PC Screen
```

`03 PC Screen` 中放置两个 `1920 × 1080` 透明画板：

```text
PC / Wheel Closed
PC / Wheel Open
```

## 组件结构

### 顶部状态栏

组件：

- `TopBar / Menu Button`
- `TopBar / Status Item`
- `TopBar / Full`

状态栏为单行横向布局。内容顺序固定为：

```text
[≡]  时间 08:00  地点 公寓  体力 100/100  理智 70/100  循环 1
```

每个状态项由独立 SVG 图标、标签和值组成。体力和理智必须显示当前值与最大值，不使用百分比替代。

### 操作中心与轮盘

组件：

- `Operation Hub / Closed`
- `Operation Hub / Open`
- `Radial Item / Default`
- `Radial Item / Selected`
- `Radial Menu / Open`

操作中心是五叶暗房光圈 Logo。轮盘展开时中心位置不移动，五个扇区从中心外环连续向右上展开，不允许出现独立方形按钮或与中心脱离的浮动轮盘。

五项顺序为：

1. 观察
2. 调查
3. 行动
4. 线索
5. 地图

`Selected` 状态使用黑白反相。PC 展开示例默认选中“观察”，其他项也需要可切换到相同选中样式。

### 对白与播放控制

组件：

- `Dialogue / Box`
- `Dialogue / Next`
- `Playback / Pause`
- `Playback / Fast`

示例对白为：

```text
脑袋好沉……要快点清醒过来……
```

对白文本必须保持可编辑。前进箭头放在对白框右侧。暂停和快速按钮位于对白框下方，并共用同一按钮组件结构。

## 独立 SVG 素材

素材保存到：

```text
public/assets/ui/penpot/pc/
```

文件列表：

```text
icon-menu.svg
icon-time.svg
icon-location.svg
icon-stamina.svg
icon-sanity.svg
icon-loop.svg
icon-observe.svg
icon-investigate.svg
icon-action.svg
icon-clue.svg
icon-map.svg
icon-operation-iris.svg
icon-dialogue-next.svg
icon-pause.svg
icon-fast-forward.svg
```

每个 SVG 使用整数坐标、无滤镜、无渐变，并以 `currentColor` 或纯黑白填充实现反白复用。

## 导出与交付

本地交付：

- 15 个独立 SVG 图标。
- 一份素材清单，记录尺寸、用途和 Penpot 组件名。

Penpot 交付：

- 新建文件。
- Assets、Components、PC Screen 页面。
- 轮盘关闭和展开两个 1920 × 1080 画板。
- 可编辑文本、共享颜色样式和可复用组件。

## 验收标准

1. Penpot 文件中的 UI 与参考稿在 `1920 × 1080` 画布上按比例匹配。
2. 背景保持透明，最终画板不包含场景图片。
3. 默认字体为 `RenOuFangSong 16 / 人偶仿宋`。
4. 顶部状态栏完整显示 `体力 100/100` 和 `理智 70/100`。
5. 操作中心与轮盘共用同一圆心，关闭和展开状态位置一致。
6. 所有 15 个图标均为独立 SVG，且可以反白复用。
7. 主要 UI 元素为 Penpot 可编辑组件，不以整页位图代替。
8. 参考描摹层在最终交付画板中隐藏。
