# 观察/调查/行动 系统设计文档

## 一、核心设计目标

把"观察/调查/行动"从"单纯的发消息"变成**有结构、有反馈、有内容的游戏机制**。

玩家点击按钮 → 触发特定 LLM 调用 → 获得结构化结果 → 在游戏内展示 → 可能解锁线索/推进剧情。

---

## 二、交互流程设计

### 整体流程

```
场景播放完毕 (sceneComplete=true)
    ↓
玩家点击 [观察]/[调查]/[行动]
    ↓
前端构造特定 prompt 发送给 LLM
    ↓
LLM 返回 <action> 标签
    ↓
前端解析并显示结果面板
    ↓
玩家可继续观察/调查/行动，或输入自由文本推进剧情
```

### 三种动作的差异

| 动作 | 触发方式 | LLM Prompt 特征 | 结果类型 |
|------|---------|----------------|---------|
| **观察** | 直接点击 | "请描述当前场景的视觉/听觉/嗅觉细节" | 环境描述文本 |
| **调查** | 点击 → 选择对象 → 确认 | "请描述 [对象] 的详细信息，可能隐藏什么" | 物品/人物的详细描述 |
| **行动** | 点击 → 选择行动 → 确认 | "请描述执行 [行动] 后的结果" | 行动结果+可能的剧情变化 |

---

## 三、LLM 返回内容扩展

### 新增标签

在现有 `<maintext>` `<option>` `<sum>` `<vars>` `<thinking>` 基础上，新增两个标签：

#### 1. `<action>` — 动作结果

```xml
<action type="observe">
晨光透过半开的蓝格窗帘洒进房间，尘埃在光束中缓慢漂浮。
床垫的凹陷处还残留着体温，枕头上有淡淡的草莓味柔顺剂香气。
床头柜上放着一个药瓶，标签被撕掉了一半，露出"利培酮"的字样。
墙上的挂钟指针停在 0:00，秒针却在诡异地倒转。
</action>
```

`type` 属性取值：`observe` | `investigate` | `act`

#### 2. `<hint>` — 可交互提示

由 LLM 在主剧情回复中附带，告诉前端当前场景有哪些可观察/可调查/可行动的内容：

```xml
<hint>
可观察: 房间的光线,空气中的味道,窗外的景象
可调查: 床头柜上的药瓶,墙上的挂钟,文穂的围裙
可行动: 起床,检查药瓶,拥抱文穂,打开窗帘
</hint>
```

前端解析 `<hint>` 后：
- "观察"按钮：点击后直接发送观察请求（不需要选择）
- "调查"按钮：点击后弹出可调查物品列表（从 `<hint>` 的"可调查"中读取）
- "行动"按钮：点击后弹出可行动列表（从 `<hint>` 的"可行动"中读取）

### 扩展 ParsedContent 类型

```typescript
export interface ParsedContent {
  thinking: string;
  maintext: string;
  options: string[];
  summary: string;
  vars: Record<string, any>;
  
  // 新增
  actionType?: 'observe' | 'investigate' | 'act';
  actionResult?: string;
  hint?: {
    observe?: string[];
    investigate?: string[];
    actions?: string[];
  };
}
```

### 扩展 stream-parser.ts

在 `flushTagBuffer` 函数中新增 case：

```typescript
case 'action':
  // 从 content 中解析 type 属性
  const typeMatch = content.match(/^type="(\w+)"\s*\n?/);
  if (typeMatch) {
    state.parsed.actionType = typeMatch[1] as 'observe' | 'investigate' | 'act';
    state.parsed.actionResult = content.slice(typeMatch[0].length).trim();
  } else {
    state.parsed.actionResult = content;
  }
  break;

case 'hint':
  const hint: ParsedContent['hint'] = {};
  const observeMatch = content.match(/可观察[:：]\s*(.+)/);
  if (observeMatch) hint.observe = observeMatch[1].split(/[,，]/).map(s => s.trim());
  const investigateMatch = content.match(/可调查[:：]\s*(.+)/);
  if (investigateMatch) hint.investigate = investigateMatch[1].split(/[,，]/).map(s => s.trim());
  const actionMatch = content.match(/可行动[:：]\s*(.+)/);
  if (actionMatch) hint.actions = actionMatch[1].split(/[,，]/).map(s => s.trim());
  state.parsed.hint = hint;
  break;
```

---

## 四、Prompt 设计

### 观察 Prompt

```
[系统指令]
玩家正在进行"观察"动作。请基于当前场景，提供详细的环境描述。
当前场景信息：
- 场景名: {currentBackground}
- 当前时间: {gameStatus.time}
- 当前角色: {currentState.character}
- 当前情绪氛围: {currentState.mood}
- 已发生剧情: {lastFewLines}

要求：
1. 描述视觉细节（光线、颜色、物品位置）
2. 描述听觉细节（声音、寂静、回声）
3. 描述嗅觉/触觉细节（气味、温度、质感）
4. 包含 1-2 个"隐藏细节"——不明显但可能被注意到的反常之处
5. 如果玩家已经观察过，提供与上次不同的细节（变化）

输出格式：
<action type="observe">
观察结果文本...
</action>
```

### 调查 Prompt

```
[系统指令]
玩家正在调查特定对象："{investigateTarget}"

当前场景信息：
- 场景名: {currentBackground}
- 调查对象: {investigateTarget}
- 已发生剧情: {lastFewLines}

要求：
1. 描述调查对象的外观、材质、状态
2. 描述与调查对象相关的历史/背景信息
3. 包含 1-2 个可解锁的线索（可能指向真相A/B/C/D）
4. 如果这是重复调查，提供新的发现

输出格式：
<action type="investigate">
调查结果文本...
</action>
```

### 行动 Prompt

```
[系统指令]
玩家正在执行行动："{actionName}"

当前场景信息：
- 场景名: {currentBackground}
- 执行的行动: {actionName}
- 当前角色: {currentState.character}
- 已发生剧情: {lastFewLines}

要求：
1. 描述行动的过程（动作、反应、结果）
2. 行动可能对场景/角色/剧情产生的影响
3. 如果行动改变了场景，在描述中体现
4. 如果行动触发了新线索或新对话，一并描述

输出格式：
<action type="act">
行动结果文本...
</action>
```

---

## 五、前端展示设计

### 观察结果面板

```
┌─────────────────────────────────────────┐
│  [眼睛图标] 观 察                        │
├─────────────────────────────────────────┤
│                                         │
│  晨光透过半开的蓝格窗帘洒进房间，        │
│  尘埃在光束中缓慢漂浮。                  │
│                                         │
│  床垫的凹陷处还残留着体温，枕头上有      │
│  淡淡的草莓味柔顺剂香气。                │
│                                         │
│  [发现] 床头柜上的药瓶标签被撕掉         │
│  了一半，露出"利培酮"的字样。            │
│                                         │
│  [异常] 墙上的挂钟指针停在 0:00，        │
│  秒针却在诡异地倒转。                    │
│                                         │
└─────────────────────────────────────────┘
```

**设计要点**：
- 像素风格边框（与对话框一致）
- 标题带图标
- 关键发现用 `[发现]` 标签高亮
- 异常现象用 `[异常]` 标签高亮
- 底部有关闭按钮

### 调查结果面板

与观察面板类似，但标题是 `[放大镜图标] 调 查`。

### 行动结果面板

标题是 `[箭头图标] 行 动`。

如果行动触发了剧情变化（如场景切换、新对话），行动结果后自动继续播放剧情。

---

## 六、状态管理扩展

在 `gameStore` 中新增：

```typescript
interface GameState {
  // 现有字段...
  
  // 新增
  /** 已收集的线索 */
  collectedClues: Array<{
    id: string;
    type: 'observe' | 'investigate' | 'act';
    target?: string;
    content: string;
    cycleIndex: number;
    timestamp: number;
  }>;
  
  /** 当前场景的可交互提示 */
  currentHint?: {
    observe: string[];
    investigate: string[];
    actions: string[];
  };
  
  /** 当前显示的动作结果面板 */
  actionPanel: {
    visible: boolean;
    type: 'observe' | 'investigate' | 'act' | null;
    content: string;
  };
}
```

---

## 七、完整示例：从主剧情到交互

### LLM 返回的主剧情（包含 hint）

```xml
<maintext>
场景|bedroom1
音乐|lovely
对话|旁白|calm|你接过文穂精心准备的丰盛早餐...
对话|文穂|calm|公交卡放在外层口袋！
</maintext>

<hint>
可观察: 房间的光线变化,空气中的味道,窗外的天气
可调查: 床头柜上的药瓶,墙上的挂钟,文穂的围裙口袋
可行动: 起床检查药瓶,拥抱文穂,打开窗帘看外面
</hint>

<option>
继续吃早餐
询问文穂昨晚的事
</option>

<sum>主角接受文穂的早餐，文穂提醒带公交卡</sum>
```

### 玩家点击"观察"

前端发送：
```
[系统] 玩家执行了"观察"动作。当前场景：bedroom1，时间：早晨8:30。
```

LLM 返回：
```xml
<action type="observe">
晨光比之前更强烈了一些，窗帘被风吹得轻轻摆动。
房间里弥漫着煎蛋和吐司的香气，还有淡淡的消毒水味道——
从文穂的方向飘来的。

[发现] 文穂的围裙口袋里露出一张折叠的纸条，边角泛黄。

[异常] 地板上有几滴水渍，从厨房方向延伸到卧室门口，
但外面并没有下雨。
</action>
```

### 玩家点击"调查" → 选择"文穂的围裙口袋"

前端发送：
```
[系统] 玩家调查"文穂的围裙口袋"。当前场景：bedroom1。
```

LLM 返回：
```xml
<action type="investigate">
你假装不经意地靠近文穂，目光落在她的围裙口袋上。
那里露出一张折叠的纸条，边角已经泛黄，像是被反复打开过很多次。

文穂注意到你的视线，下意识地把纸条往口袋里塞了塞。

[发现] 纸条上隐约可见几个字："如果明天还会来..."
剩下的内容被她塞进了口袋深处。

[线索] 文穂的表情有一瞬间的慌乱，但马上恢复了笑容。
她在隐瞒什么。
</action>
```

### 玩家点击"行动" → 选择"拥抱文穂"

前端发送：
```
[系统] 玩家执行"拥抱文穂"。当前场景：bedroom1。
```

LLM 返回：
```xml
<action type="act">
你放下筷子，突然抱住了文穂。

她愣了一下，身体僵硬了一秒，然后轻轻拍了拍你的背。

"怎么了？突然撒娇？"

她的声音在笑，但你能感觉到她的身体在微微发抖。

[发现] 她的围裙口袋里有什么硬硬的东西——不像是纸条，
更像是一个...小瓶子？

[情绪] 文穂的好感度 +5，但她的"隐瞒值"也上升了。
</action>
```

---

## 八、实现优先级

### P0（必须）
1. 扩展 `ParsedContent` 类型（添加 `actionType`/`actionResult`/`hint`）
2. 扩展 `stream-parser.ts`（新增 `<action>` 和 `<hint>` 的解析）
3. 修改 `useGameLoop.ts`（`performAction` 支持 observe/investigate/act）
4. 新建 `ActionPanel.tsx`（显示观察/调查/行动结果）

### P1（重要）
5. 修改 `DialogueBox.tsx`（场景播放完毕后显示 action 按钮）
6. 扩展 `gameStore`（添加 `collectedClues`/`currentHint`/`actionPanel`）
7. 设计 prompt 模板（观察/调查/行动的系统提示词）

### P2（增强）
8. 记忆笔记本集成（自动记录收集到的线索）
9. 线索的"多重解读"（同一线索在不同真相滤镜下不同解读）
10. 调查/行动后的场景变化（如药瓶被拿走后，场景中不再显示）
