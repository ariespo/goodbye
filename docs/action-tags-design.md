# 观察/调查/行动 XML 标签设计

## 总体架构

LLM 一次返回包含全部内容，前端按需展示：

```xml
<maintext>主剧情文本</maintext>
<observe>观察内容</observe>
<investigate>
调查项描述|嫌疑人指向|结果风格|耗时|耗体|耗理智
...
</investigate>
<action>
行动描述|结果风格|耗时|耗体|耗理智
...
</action>
<option>选项A
选项B</option>
<sum>回合总结</sum>
```

---

## 一、`<observe>` — 五感观察

**用途**：玩家点击"观察"按钮后直接展示，无需二次请求 LLM。

**内容要求**：
- 五感收集到的环境信息（视觉、听觉、嗅觉、触觉、味觉）
- 玩家对当前状况的内心想法
- 疑点、异常、违和感
- 与轮回记忆对比后的恐慌/困惑

**格式**：纯文本段落

```xml
<observe>
房间里弥漫着煎蛋的香气，阳光透过蓝格窗帘照进来，让整个空间显得温暖而舒适。
文穂正凑到自己面前，端着热腾腾香气扑鼻的早餐。一切都如此熟悉，却无法让你感到安宁。
——因为你已经经历过这一切。恐慌和担忧在你心中蔓延。这是轮回！
</observe>
```

**前端展示**：像素边框面板，标题"观察"，直接显示文本。

---

## 二、`<investigate>` — 现场调查列表

**用途**：玩家点击"调查"按钮后，弹出可调查对象列表。选择一项后，**再发送请求**给 LLM 获取具体调查结果。

**格式**：每行一条，字段用 `|` 分隔

```
调查项描述|嫌疑人指向|结果风格|耗时|耗体|耗理智
```

| 字段 | 说明 | 示例 |
|------|------|------|
| 调查项描述 | 可调查的对象/区域 | `仔细查看文穂准备的早餐：煎蛋、面包、牛奶` |
| 嫌疑人指向 | 该线索可能指向谁 | `玩家` / `文穂` / `灯织` / `杀手` / `无` |
| 结果风格 | 调查结果的真相滤镜 | `现实` / `心理` / `邪神` / `梦境` |
| 耗时 | 执行需要多少时间 | `5分钟` |
| 耗体 | 消耗的体力值 | `3` |
| 耗理智 | 消耗的理智值 | `5` |

**示例**：

```xml
<investigate>
仔细查看文穂准备的早餐：煎蛋、面包，还有最近她总让你喝的牛奶|玩家|心理|5分钟|3|5
观看电视，新闻里正在报道「虐绞狂」的最新案件|杀手|现实|5分钟|0|3
检查床头柜上的药瓶，标签被撕掉了一半|玩家|心理|2分钟|1|8
翻看墙上挂钟，秒针在倒转|无|邪神|3分钟|0|10
</investigate>
```

**前端展示**：
- 像素边框面板，标题"调查"
- 列表形式，每项显示描述 + 消耗（时间/体力/理智）
- 体力/理智不足时置灰不可选
- 点击某项后发送请求给 LLM

**LLM 返回调查结果格式**：

```xml
<action type="investigate">
你端起牛奶杯，温热的液体滑入喉咙...
[发现] 杯底有一圈淡淡的白色沉淀，不是普通牛奶会有的。
[疑点] 文穂最近总让你喝这个，但她自己从来不喝。
</action>
```

---

## 三、`<action>` — 场景行动列表

**用途**：与 `<investigate>` 类似，但倾向"切换场景"或"改变现状"，而非"原地搜索"。

**格式**：每行一条，字段用 `|` 分隔（5 个字段，比 investigate 少一个"嫌疑人指向"）

```
行动描述|结果风格|耗时|耗体|耗理智
```

| 字段 | 说明 | 示例 |
|------|------|------|
| 行动描述 | 可执行的行动 | `前往厨房查看焦味的来源` |
| 结果风格 | 行动结果的真相滤镜 | `现实` / `心理` / `邪神` / `梦境` |
| 耗时 | 执行需要多少时间 | `5分钟` |
| 耗体 | 消耗的体力值 | `2` |
| 耗理智 | 消耗的理智值 | `0` |

**示例**：

```xml
<action>
前往厨房查看焦味的来源|现实|5分钟|2|0
拉开窗帘看窗外的天气|现实|1分钟|0|0
打开电视切换新闻频道|现实|3分钟|0|3
走出公寓去楼道看看|现实|10分钟|5|5
重新躺下假装继续睡觉|心理|30分钟|0|0
</action>
```

**前端展示**：与"调查"面板类似，标题"行动"。

**LLM 返回行动结果格式**：

```xml
<action type="act">
你起身走向厨房，推开门——
灶台上的平底锅还在冒烟，煎蛋已经彻底焦黑。
[发现] 灶台下方的煤气阀门开着一条缝。
[变化] 场景切换 → 厨房
</action>
```

---

## 四、字段约束与校验

### 嫌疑人指向 可选值
```
玩家 / 文穂 / 灯织 / 杀手 / 无
```

### 结果风格 可选值
```
现实 / 心理 / 邪神 / 梦境
```

**场景切换**：不由字段控制，由 LLM 返回的行动结果中的 `[变化] 场景切换 → xxx` 标记触发。

---

## 五、解析器扩展

### stream-parser.ts 新增 case

```typescript
case 'observe':
  state.parsed.observe = content;
  break;

case 'investigate':
  state.parsed.investigateItems = content.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [desc, suspect, style, time, stamina, sanity] = line.split('|').map(s => s.trim());
      return { desc, suspect, style, time, stamina: parseInt(stamina), sanity: parseInt(sanity) };
    });
  break;

case 'action':
  state.parsed.actionItems = content.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [desc, style, time, stamina, sanity] = line.split('|').map(s => s.trim());
      return { desc, style, time, stamina: parseInt(stamina), sanity: parseInt(sanity) };
    });
  break;
```

### ParsedContent 扩展

```typescript
export interface ParsedContent {
  thinking: string;
  maintext: string;
  options: string[];
  summary: string;
  vars: Record<string, any>;

  // 新增
  observe?: string;
  investigateItems?: Array<{
    desc: string;
    suspect: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;
  actionItems?: Array<{
    desc: string;
    style: string;
    time: string;
    stamina: number;
    sanity: number;
  }>;

  // 二次请求返回的具体结果
  actionType?: 'investigate' | 'act';
  actionResult?: string;
}
```

---

## 六、游戏内交互流程

### 完整流程图

```
场景播放完毕 (sceneComplete=true)
    ↓
前端检查 parsedContent
    ↓
有 <observe> ? → 观察按钮高亮可用
有 <investigate> ? → 调查按钮高亮可用
有 <action> ? → 行动按钮高亮可用
    ↓
玩家点击 [观察]
    → 直接显示 <observe> 内容（无需请求 LLM）
    → 标记为"已观察"

玩家点击 [调查]
    → 弹出面板，列出 <investigateItems>
    → 体力/理智不足的项目置灰
    → 玩家选择一项
    → 扣除对应体力/理智
    → 发送请求给 LLM（携带调查对象+当前场景）
    → LLM 返回 <action type="investigate">...</action>
    → 显示调查结果

玩家点击 [行动]
    → 弹出面板，列出 <actionItems>
    → 体力/理智不足的项目置灰
    → 玩家选择一项
    → 扣除对应体力/理智
    → 发送请求给 LLM（携带行动描述+当前场景）
    → LLM 返回 <action type="act">...</action>
    → 如果结果中有 `[变化] 场景切换 → xxx`，切换场景背景
    → 显示行动结果
```

---

## 七、LLM Prompt 设计

### 主剧情 Prompt 新增要求

在主剧情的 system prompt 末尾追加：

```
【观察/调查/行动输出要求】

除了主剧情 <maintext>，你还需要在同一次回复中输出以下内容：

1. <observe>：玩家当前所处环境的五感描述 + 内心想法 + 疑点
2. <investigate>：当前场景内 3-4 个可调查对象，格式：描述|嫌疑人|风格|耗时|耗体|耗理智
3. <action>：当前场景下 3-4 个可执行行动，格式：描述|风格|耗时|耗体|耗理智

嫌疑人可选：玩家、文穂、灯织、杀手、无
风格可选：现实、心理、邪神、梦境

调查项和行动项的设计原则：
- 至少 1 项指向当前已推进的真相线索
- 至少 1 项指向其他真相方向（误导/隐藏线索）
- 高理智消耗的项目往往指向深层真相
- 高体力消耗的项目往往涉及场景切换
```

### 二次请求 Prompt（调查/行动结果）

**调查请求**：
```
[系统] 玩家选择了调查："{investigateDesc}"
当前场景：{currentBackground}
嫌疑人指向：{suspect}
结果风格：{style}
已发生剧情：{lastFewLines}

请返回详细的调查结果，包含发现、疑点、可能的线索。
输出格式：<action type="investigate">...</action>
```

**行动请求**：
```
[系统] 玩家执行了行动："{actionDesc}"
当前场景：{currentBackground}
结果风格：{style}

请描述行动过程、结果、场景变化（如果有）。
如果行动导致场景切换，在文本末尾加上：[变化] 场景切换 → 新场景名
输出格式：<action type="act">...</action>
```
