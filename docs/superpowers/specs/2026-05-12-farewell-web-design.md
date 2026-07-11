# 漫长的告别 Web 端重构设计文档

**日期**: 2026-05-12
**项目**: 漫长的告别 (A Long Farewell) - Web 端游戏化 + 酒馆化重构
**技术栈**: React + TypeScript + Vite + Zustand + Dexie (IndexedDB)
**风格方向**: 16-bit 复古精致风

---

## 1. 概述

将现有的 SillyTavern iframe 插件改造为纯独立 Web 端视觉小说游戏，并集成 SillyTavern 生态核心功能（世界书、变量系统、预设管理、流式标签解析等）。

**核心原则**:
- 视觉小说体验为核心，酒馆化功能为增强层
- 16-bit 复古美学 + 现代精致设计细节
- 全中文化，现代中文字体排版
- 丰富的微交互动画，拒绝简陋
- 内部通知系统，拒绝浏览器默认弹窗

---

## 2. 目标与范围

### 2.1 保留内容
- 所有现有游戏资产（背景、立绘、音乐、地图、音效）
- 游戏核心机制（场景推进、选项分支、体力/理智/时间系统、地图系统）
- 存档数据（需迁移方案）

### 2.2 新增/重构内容
- React + TypeScript + Vite 工程化
- 直连 OpenAI API（流式传输）
- AI 响应格式从 JSON 改为 XML 标签（`<maintext>`, `<option>`, `<vars>`, `<thinking>`, `<sum>`）
- 世界书（Lorebook）关键词匹配注入
- 变量系统（注入/提取/回溯）
- 预设管理（temperature, max_tokens, model 等）
- 流式 XML 标签实时解析
- 双 API 路由（主 API 剧情 + 可选次 API 总结/变量）
- IndexedDB 持久化（lorebook, preset, 存档, 聊天记录）
- 历史回溯系统（跳转到任意回合）
- SillyTavern 格式导入/导出

### 2.3 明确不做的内容
- 多人在线功能
- 移动端原生 App（仅做响应式 Web 适配）
- 服务端渲染（SSR）
- 多语言支持（仅中文）

---

## 3. 架构设计

### 3.1 整体架构：一体化 Zustand 状态管理

采用 Zustand 作为全局状态中心，游戏状态和酒馆化状态统一存储，tavernlike 功能模块作为纯函数被状态层调用。

```
src/
├── stores/
│   └── gameStore.ts          # Zustand：游戏 + 酒馆 + API + UI 状态
├── engine/
│   ├── scene-parser.ts       # XML 标签流式解析
│   ├── prompt-builder.ts     # Prompt 组装（角色+世界书+变量+历史）
│   └── game-loop.ts          # 游戏主循环
├── sillytavern/              # 酒馆化核心（纯函数模块）
│   ├── types.ts              # 类型定义
│   ├── database.ts           # IndexedDB / Dexie 封装
│   ├── lorebook-engine.ts    # 关键词匹配引擎
│   ├── prompt-assembler.ts   # Prompt 顺序组装
│   ├── stream-parser.ts      # 流式 XML 标签解析
│   ├── vars-merger.ts        # 变量深合并
│   ├── api-router.ts         # 主/次 API 路由
│   ├── importer.ts           # SillyTavern JSON 导入/导出
│   └── index.ts              # 入口
├── components/
│   ├── game/                 # 游戏核心 UI
│   │   ├── GameCanvas.tsx    # 主画布（背景+立绘+对话框叠加层）
│   │   ├── DialogueBox.tsx   # 对话框
│   │   ├── CharacterSprite.tsx
│   │   ├── BackgroundLayer.tsx
│   │   ├── ChoiceMenu.tsx    # 选项菜单
│   │   ├── StatusPanel.tsx   # 侧边 HUD 状态面板
│   │   ├── ActionBar.tsx     # 观察/调查/行动/地图按钮
│   │   ├── MapModal.tsx      # 地图弹窗
│   │   └── MoodOverlay.tsx   # 情绪滤镜层
│   ├── system/               # 系统级 UI
│   │   ├── IntroAnimation.tsx    # 开场动画
│   │   ├── NotificationToast.tsx # 通知提示
│   │   ├── ConfirmModal.tsx      # 确认弹窗
│   │   └── CustomCursor.tsx      # 自定义光标
│   └── tavern/               # 酒馆化管理面板
│       ├── SettingsModal.tsx
│       ├── LorebookModal.tsx
│       ├── PresetModal.tsx
│       └── HistoryDrawer.tsx
├── hooks/
│   ├── useGameLoop.ts
│   ├── useStreamParser.ts
│   └── useTypewriter.ts
├── styles/
│   ├── globals.css         # 全局样式 + 字体 + 光标隐藏
│   ├── animations.css      # 关键帧动画库
│   └── themes.css          # 情绪主题 CSS 变量
└── assets/                 # 现有资源全部保留
```

---

## 4. 视觉设计系统

### 4.1 色彩体系（16-bit 精致调色板）

| 用途 | 色值 | 说明 |
|---|---|---|
| 背景主色 | `#0d0d0f` | 极暗灰黑，非纯黑，带极微弱蓝调 |
| 背景次色 | `#1a1a1f` | 面板、卡片背景 |
| 边框/分割线 | `#2a2a35` | 微妙分隔 |
| 主文字 | `#e8e4dc` | 暖白，类似羊皮纸/CRT 荧光感 |
| 次要文字 | `#8a8580` | muted 灰 |
| 强调色（蓝） | `#6b8cff` | 信息、链接、选中状态 |
| 强调色（金） | `#d4a853` | 重要按钮、高光 |
| 危险/恐怖 | `#c94f4f` | 情绪：恐怖、危险提示 |
| 癫狂/异常 | `#a855c7` | 情绪：精神异常 |
| 悲伤/忧郁 | `#5b8db8` | 情绪：悲伤 |

### 4.2 字体排版

| 用途 | 字体栈 | 说明 |
|---|---|---|
| 标题/角色名 | `"Source Han Serif SC", "Noto Serif SC", serif` | 思源宋体，复古印刷感 |
| 正文/对话 | `"LXGW WenKai", "Maple Mono CN", monospace` | 霞鹜文楷，有温度，适合长文本 |
| UI 标签/数字 | `"Maple Mono", "JetBrains Mono", monospace` | 等宽字体，终端感 |
| 像素装饰 | `"Zpix", "BoutiqueBitmap9x9", monospace` | 仅用于极小标签、LOGO |

### 4.3 边框与形状规范

- **对话框**: 直角 + 2px 实体边框（保持像素感），边框色 `#2a2a35`，hover 时过渡到 `#6b8cff`，0.3s ease
- **按钮**: 4px 圆角（轻微柔化），1px 边框，hover 时背景填充 + 文字反色
- **面板/卡片**: 0 圆角，1px 边框，微妙内阴影 `inset 0 1px 0 rgba(255,255,255,0.03)`
- **分隔线**: 1px dashed `#2a2a35`

### 4.4 阴影深度

- 主对话框: `box-shadow: 0 0 0 1px #2a2a35, 0 8px 32px rgba(0,0,0,0.5)`
- 浮动面板: `box-shadow: 0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)`

### 4.5 Icon 系统

- **全部使用 Phosphor Icons** (`@phosphor-icons/react`)
- 禁止使用 emoji
- 图标尺寸规范：工具栏 20px，按钮 16px，装饰 12px

---

## 5. 核心组件详细设计

### 5.1 开场动画（IntroAnimation）

完整六阶段仪式：

1. **黑场** (500ms): 纯黑，微弱扫描线噪点纹理动画
2. **信号干扰** (800ms): 屏幕中央水平 glitch 条纹，伴随极轻微白噪音（Web Audio API）
3. **标题显现** (1200ms): "漫长的告别" 打字机方式出现，每个字带 CRT 荧光扫描效果（从下到上亮度扫过），思源宋体，字间距加宽
4. **副标题淡入** (600ms): "A Long Farewell" 0.3 透明度从下方滑入
5. **加载条** (动态): 底部 1px 高金色进度条，进度增长有顿挫感
6. **切入场** (800ms): 开场层向上滑出，主游戏界面从模糊到清晰

**跳过机制**: 任意点击/按键加速到阶段 6，非瞬间消失。

### 5.2 自定义光标（CustomCursor）

全局 `cursor: none`，用 `position: fixed` div 跟随鼠标，`requestAnimationFrame` 平滑插值（lag 系数 0.15）。

| 场景 | 样式 | 动效 |
|---|---|---|
| 默认 | 8×8 像素箭头，白 `#e8e4dc` | 无 |
| hover 可点击 | 16×16 像素手形，带 1px 描边 | 放大 1.2x，0.15s ease |
| 文本输入区 | I-beam 竖线 | 闪烁动画 |
| 等待/加载 | 旋转像素时钟（4 帧 sprite） | 持续旋转 |
| 情绪：恐怖 | 滴血像素匕首 | 偶尔轻微抖动 |
| 情绪：癫狂 | 错位双光标（残影） | 随机偏移 |

### 5.3 对话框（DialogueBox）

- **容器**: 宽度 85vw，最大 960px，底部居中（`bottom: 6%`）
- **背景**: `rgba(13, 13, 15, 0.92)` + `backdrop-filter: blur(8px)`
- **边框**: 2px solid `#2a2a35`，顶部 1px solid `rgba(255,255,255,0.06)`
- **阴影**: `0 0 0 1px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.6)`

**角色名区域（Speaker）**:
- 左上角独立标签，背景 `#1a1a1f`，边框 1px `#2a2a35`
- 思源宋体 14px，颜色 `#6b8cff`，字间距 2px
- 进入动画：`translateX(-20px) → 0`，opacity 0→1，300ms ease-out

**正文区域（Content）**:
- 霞鹜文楷 22px，行高 1.8，颜色 `#e8e4dc`
- 打字机效果：每字 `opacity: 0 → 1` + `translateY(4px) → 0`，间隔 35ms
- `<em>` 斜体 + 颜色 `#d4a853`
- `<strong>` 加粗 + 字间距略大

**控制按钮（自动/快进）**:
- Phosphor Icons，右下角
- 默认：1px 边框 `#2a2a35`，透明背景
- Hover：边框 `#6b8cff`，背景 `rgba(107, 140, 255, 0.1)`
- 点击：scale 0.95，0.1s
- 激活状态：边框脉冲（opacity 0.5↔1，2s 循环）

**交互反馈**:
- Hover 对话框：边框 `#2a2a35 → #3a3a4a`，0.3s
- 点击（下一句）：整个框下沉 2px，0.1s，弹回

### 5.4 状态面板（StatusPanel）

- **布局**: 右侧边缘浮动垂直条带，宽 200px
- **背景**: `rgba(13, 13, 15, 0.85)` + `backdrop-filter: blur(4px)`

**时间显示**:
- 大号等宽字体，颜色 `#8a8580`
- 时间推进时翻页动画（旧数字上滑出，新数字下滑入）

**体力/理智条**:
- 高 4px，背景 `#1a1a1f`
- 体力填充 `#6b8cff`，理智填充 `#d4a853`
- 变化时平滑过渡 0.6s cubic-bezier(0.4, 0, 0.2, 1)，末尾微光扫过
- 低值（<30%）：变 `#c94f4f`，轻微脉动

**时间重置次数**:
- 数字 `#d4a853`，发光 `text-shadow: 0 0 8px rgba(212, 168, 83, 0.3)`
- 重置时：放大 1.5x→1x，弹性缓动

### 5.5 选项菜单（ChoiceMenu）

- 对话框上方居中，选项间距 12px
- **单选项卡片**:
  - 背景 `rgba(13, 13, 15, 0.9)`
  - 边框 1px `#2a2a35`，左侧 3px 强调条（默认透明）
  - 内边距 16px 20px，霞鹜文楷 18px
  - 最大宽 640px，最小 400px
- **Hover**:
  - 整体右偏移 8px，0.25s ease
  - 左侧强调条显现为 `#6b8cff`，0→3px 扩展
  - 背景 `rgba(107, 140, 255, 0.05)`
  - 文字发光 `text-shadow: 0 0 12px rgba(107, 140, 255, 0.2)`
- **点击**:
  - scale 0.98，0.1s
  - 其他选项淡出 opacity 0.3
  - 延迟 300ms 后整体淡出

### 5.6 通知系统（NotificationToast）

- **位置**: 顶部居中，距顶部 24px
- **样式**: 背景 `rgba(26, 26, 31, 0.95)`，左侧 3px 色条
  - info=`#6b8cff`, success=`#5b9e5b`, warning=`#d4a853`, error=`#c94f4f`
- **图标**: Phosphor Icons，颜色与边框一致
- **动画**:
  - 进入：`translateY(-20px) → 0`，opacity 0→1，0.3s ease-out
  - 停留：4 秒或手动关闭
  - 退出：向上滑出 + opacity 0，0.3s
- **堆叠**: 垂直间距 8px，新通知推旧通知下移
- **关闭**: 右上角 × 按钮，hover 旋转 90°

### 5.7 行动按钮栏（ActionBar）

- **布局**: 对话框左下方水平 mini bar
- **单按钮**: 40×40px 方形，1px 边框 `#2a2a35`
- **图标**: Phosphor 20px，默认 `#8a8580`
- **Hover**:
  - 边框 `#6b8cff`
  - 背景 `rgba(107, 140, 255, 0.08)`
  - 图标 `#6b8cff`
  - 下方 tooltip（"观察"/"调查"/"行动"/"地图"），80ms 延迟
- **点击**: scale 0.92，0.1s
- **激活**: 边框持续发光 `box-shadow: 0 0 8px rgba(107, 140, 255, 0.3)`
- **面板展开**: scale 0.9→1 + opacity 0→1，back-out 缓动

---

## 6. 情绪主题系统

情绪切换时全界面平滑过渡（0.8s ease），通过 CSS 变量实现。

| 情绪 | 背景 | 文字 | 强调色 | 特殊效果 |
|---|---|---|---|---|
| **平静** | 正常 | `#e8e4dc`，无动画 | `#6b8cff` | 无 |
| **恐怖** | 四角暗红渐变渗入 `rgba(201,79,79,0.15)` | 轻微颤抖（随机 `translateX(±0.5px)`，每 3s） | `#c94f4f` | 屏幕偶尔闪烁；噪点层 opacity 0.03→0.08 |
| **癫狂** | `hue-rotate(15deg)` | `#a855c7`，随机字符错位 | `#a855c7` | 扫描线加速；对话框边框 glitch |
| **悲伤** | 亮度 85%，对比度 90% | `#5b8db8`，行高 2.0 | `#5b8db8` | Canvas 雨滴 overlay（极缓慢下落） |
| **愤怒** | 边缘泛红 `inset 0 0 60px rgba(201,79,79,0.2)` | 加粗，关键句下划线动画 | `#c94f4f` | 屏幕震动（±1px，0.05s 间隔，3 次） |
| **欢乐** | 亮度 105%，微暖 | `#d4c5a0` | `#d4a853` | 粒子效果（微光点从底部向上飘） |

---

## 7. 酒馆化管理面板

### 7.1 设置面板（SettingsModal）

- **触发**: 行动按钮栏齿轮图标，或 `Esc` 键
- **入场**: 右侧滑入 `translateX(100%) → 0`，0.35s ease；主界面变暗 `brightness(0.7)`
- **布局**: 左侧导航（API / 游戏 / 界面），右侧内容

**API 设置**:
- baseUrl、apiKey（密码遮蔽，显示/隐藏切换）、模型选择下拉
- 次 API 开关 + 相同字段组
- 输入框 focus：边框 `#6b8cff`，底部细线发光

**游戏设置**:
- 打字速度滑块（20-100ms），thumb 为 8px 方形像素块
- 字体大小（小/中/大）
- 情绪效果强度滑块

**界面设置**:
- 自定义标签集输入
- 光标样式选择

### 7.2 世界书面板（LorebookModal）

- **布局**: 三栏——世界书列表 | 条目列表 | 条目编辑
- **世界书列表**: 名称、条目数、激活开关（像素方块左右滑动）
- **导入**: 拖放区域，hover 时边框虚线动画流动
- **条目编辑**: 关键词（逗号分隔）、内容 textarea、优先级数字
- **保存**: 按钮变为 ✓ 图标，0.5s 后恢复

### 7.3 预设面板（PresetModal）

- **布局**: 列表 + 编辑器
- **预设项**: 名称、温度（小数滑块）、max_tokens、top_p
- **选中**: 左侧 3px 金色条，背景高亮

### 7.4 历史记录抽屉（HistoryDrawer）

- **触发**: 左侧滑出
- **内容**: 按时间倒序的回合列表
- **单回合卡片**: 回合号、第一句话摘要、变量变化快照
- **Hover**: 显示"跳转至此"按钮
- **回退动画**: 屏幕中央"时间回溯"文字 + glitch 效果，然后重新加载场景

---

## 8. 数据流与状态管理

### 8.1 Zustand Store 结构

```typescript
interface GameStore {
  game: {
    currentScene: Scene | null;
    storyline: StorylineData | null;
    gameStatus: { time: Date; stamina: number; sanity: number; items: string[] };
    currentState: { bgm: string | null; background: string | null; character: string | null; speaker: string | null; mood: Mood };
    isTyping: boolean;
    isWaitingForAI: boolean;
    history: TurnSnapshot[];
  };
  tavern: {
    settings: AppSettings;
    lorebooks: Lorebook[];
    activeLorebookIds: string[];
    presets: ChatPreset[];
    activePresetId: string | null;
    chats: ChatSession[];
    activeChatId: string | null;
    variables: Record<string, any>;
  };
  api: {
    isStreaming: boolean;
    streamBuffer: string;
    parsedContent: ParsedContent;
    error: string | null;
  };
  ui: {
    showSettings: boolean;
    showLorebook: boolean;
    showPreset: boolean;
    showHistory: boolean;
    showMap: boolean;
    notifications: Notification[];
    introPlayed: boolean;
  };
}
```

### 8.2 游戏主循环

```
用户输入 / 选择选项
    ↓
[Game Loop] 组装 Prompt
    ↓
[Prompt Builder] 按顺序拼接：
  1. 系统设定（角色卡、场景描述）
  2. 激活的世界书条目（关键词匹配）
  3. 当前变量注入（JSON 格式）
  4. 历史对话（最近 N 条）
  5. 用户当前输入
  6. 输出格式指令（要求 XML 标签）
    ↓
[API Router] 发送给主 API（流式）
    ↓
[Stream Parser] 实时接收 token，边收边解析 XML 标签
    ↓
  ├─ <maintext> → 立即显示到对话框（打字机效果）
  ├─ <option> → 收完后显示选项菜单
  ├─ <vars> → 解析 JSON，更新变量，触发动画
  ├─ <thinking> → 存入折叠面板
  └─ <sum> → 存入历史摘要
    ↓
[Scene Parser] 提取场景指令（[background:xxx], [character:xxx], [mood:xxx]）
    ↓
[状态更新] 同步更新游戏状态、酒馆状态、UI 状态
    ↓
[自动存档] 回合结束 → IndexedDB 存快照
```

### 8.3 历史回溯流程

```
用户点击历史抽屉中的某回合
    ↓
确认弹窗："回溯到「xxx」？当前进度将保存为分支。"
    ↓
确认后：
  1. 保存当前状态为新分支（可选）
  2. 从历史快照恢复 gameStatus、variables、history
  3. UI 播放"时间回溯"动画
  4. 重新渲染场景
```

### 8.4 存档系统

**自动存档**: 每回合结束保存到 IndexedDB
**手动存档**: 玩家命名，带时间戳和 Canvas 截图
**存档数据结构**:
```typescript
interface SaveSlot {
  id: string;
  name: string;
  createdAt: number;
  thumbnail: string;  // base64 截图
  gameState: GameState;
  tavernState: TavernState;
  historyIndex: number;
}
```

---

## 9. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 构建工具 | Vite | 快速开发服务器，原生 ESM |
| 框架 | React 18 | 函数组件 + Hooks |
| 语言 | TypeScript | 严格模式 |
| 样式 | Tailwind CSS + 自定义 CSS | 工具类 + 复杂动画手写 |
| 状态管理 | Zustand | 轻量，切片式状态 |
| 本地数据库 | Dexie (IndexedDB) | lorebook、preset、存档、聊天记录 |
| 图标 | Phosphor Icons React | 禁止 emoji |
| 字体 | @chinese-fonts/lxgwwenkai、@fontsource/noto-serif-sc | 中文 WebFont |
| HTTP | 原生 fetch | 直连 OpenAI API |

---

## 10. AI 输出格式规范

LLM 必须按以下 XML 标签格式输出：

```xml
<thinking>思考过程（可选，内部不解析其他标签）</thinking>
<maintext>
剧情正文，支持多行。
可包含场景指令：
[background:assets/backgrounds/scene1.jpg]
[character:assets/characters/hero.png]
[bgm:assets/music/tension.mp3]
[mood:horror]
[speaker:角色名]
</maintext>
<option>
选项A描述
选项B描述
选项C描述
</option>
<sum>本回合一句话总结</sum>
<vars>{ "stamina": 85, "sanity": 70, "time": "2024-09-09T10:00:00" }</vars>
```

标签集可在设置中自定义增删。

---

## 11. 风险与注意事项

1. **存档迁移**: 现有存档格式与新 IndexedDB 格式不同，需要提供一次性迁移工具或引导用户重新开局
2. **字体加载**: 中文字体文件较大，需要 font-display: swap 策略 + 预加载关键字体
3. **AI 格式稳定性**: XML 标签格式依赖 LLM 遵循指令，需要 robust 的解析器处理不完整/错误格式
4. **性能**: 情绪效果（Canvas 雨滴、粒子）在低端设备上可能卡顿，需要提供"简化效果"开关
5. **音频**: 浏览器自动播放策略限制，需要用户首次交互后解锁 AudioContext
6. **光标兼容性**: 自定义光标在 touch 设备上需回退到默认光标

---

## 12. 验收标准

- [ ] Vite + React + TypeScript 项目可正常构建，无 TS 错误
- [ ] 开场动画完整播放，可跳过
- [ ] 自定义光标在所有交互场景下正常工作
- [ ] 对话框打字机效果流畅，支持点击跳过
- [ ] 选项菜单 hover/点击动效完整
- [ ] 6 种情绪主题切换平滑，特效正常
- [ ] 状态面板数值变化有动画
- [ ] 通知系统替代所有 alert/confirm
- [ ] 可直接调用 OpenAI API 获取流式响应
- [ ] 流式解析 `<maintext>`、`<option>`、`<vars>`、`<thinking>`
- [ ] 世界书关键词匹配注入 Prompt
- [ ] 变量系统可注入/提取/回溯
- [ ] 预设管理可切换 temperature/model 等
- [ ] 历史记录可跳转到任意回合
- [ ] 存档/读档功能正常（IndexedDB）
- [ ] 现有 assets 全部可用
- [ ] 移动端基本可玩（响应式适配）
