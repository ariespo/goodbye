# 观察/调查/行动 XML 标签设计

> **重构版** — 已对齐 `重构后设定.txt` 中的三真相路线与角色设定。

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
- 与轮回记忆对比后的恐慌/困惑（第2轮+）

**格式**：纯文本段落

```xml
<observe>
房间里弥漫着煎蛋的香气，阳光透过蓝格窗帘照进来，让整个空间显得温暖而舒适。
文穗已经出门了——桌上的三明治还温着，旁边压着一张纸条："公交卡在外层口袋！"
一切如此熟悉，却让你感到不安。因为你已经经历过这一天。
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
| 调查项描述 | 可调查的对象/区域 | `检查床头柜上的药瓶，标签被撕掉了一半` |
| 嫌疑人指向 | 该线索可能指向谁 | `玩家` / `老头` / `侦探A` / `侦探B` / `无` |
| 结果风格 | 调查结果的真相路线倾向 | `现实` / `心理` / `犯罪` / `隐瞒` |
| 耗时 | 执行需要多少时间 | `5分钟` |
| 耗体 | 消耗的体力值 | `3` |
| 耗理智 | 消耗的理智值 | `5` |

**示例**：

```xml
<investigate>
检查文穗留的早餐和纸条|无|现实|3分钟|0|0
查看手机中文穗的消息记录|玩家|心理|2分钟|0|3
检查床头柜上的药瓶，标签被撕掉了一半|玩家|心理|2分钟|1|8
查看阳台外学姐楼的方向|学姐|隐瞒|1分钟|0|2
翻看沈灯织发来的微信消息|学姐|现实|2分钟|0|0
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
你拿起药瓶，标签被撕得只剩半截。在光线下勉强能辨认出一个字——"利"。
文穗买创可贴的收据还折在口袋里。手背的擦伤……是什么时候的事？
[发现] 药瓶不是感冒药。标签下露出的是"利培酮"的字样。
[疑点] 文穗最近总提醒你吃药。她知道这不是感冒药吗？
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
| 行动描述 | 可执行的行动 | `前往中学门口查看文穗是否到校` |
| 结果风格 | 行动结果的真相路线倾向 | `现实` / `心理` / `犯罪` / `隐瞒` |
| 耗时 | 执行需要多少时间 | `5分钟` |
| 耗体 | 消耗的体力值 | `2` |
| 耗理智 | 消耗的理智值 | `0` |

**示例**：

```xml
<action>
前往中学门口查看文穗是否到校|现实|15分钟|10|0
去便利店打听文穗早上的行踪|现实|10分钟|5|2
沿黔灵山脚步道往废弃水塔方向走|犯罪|25分钟|20|5
去学姐楼下看看文穗是否去过|隐瞒|15分钟|10|3
回公寓检查自己的药瓶和手机|心理|5分钟|2|8
</action>
```

**前端展示**：与"调查"面板类似，标题"行动"。

**LLM 返回行动结果格式**：

```xml
<action type="act">
你走到中学门口。门卫老张正在收雨伞。
"文穗？今天没来。哦——等一下，她请假了。今天一早有人打电话来请的假。"
"谁打的？""男的。声音年轻。"
[变化] 场景切换 → 中学门口
[线索] 请假电话是男的打的——不是文穗自己。
</action>
```

---

## 四、字段约束与校验

### 嫌疑人指向（仅 investigate）可选值

```
玩家 / 老头 / 侦探A / 侦探B / 学姐 / 无
```

| 值 | 说明 | 对应变量 |
|---|------|---------|
| `玩家` | 线索指向玩家自身 | `suspicion.self` |
| `老头` | 线索指向独居老头周德明 | `suspicion.oldMan` |
| `侦探A` | 线索指向侦探A赵刚 | `suspicion.detectiveA` |
| `侦探B` | 线索指向侦探B林静 | `suspicion.detectiveB` |
| `学姐` | 线索暗示学姐知情（但不锁凶） | `suspicion.senpai`（上限49） |
| `无` | 纯环境/氛围线索，不指向任何人 | — |

> 注：便利店员（陈慧慧）和体育老师（刘仁光）是烟雾弹角色，上限25。他们不会作为"嫌疑人指向"出现——他们的可疑行为通过对话和观察自然呈现，到25时触发揭发排除事件。

### 结果风格可选值

```
现实 / 心理 / 犯罪 / 隐瞒
```

| 值 | 说明 | 倾向路线 | 理智影响倾向 |
|---|------|---------|-------------|
| `现实` | 客观事实、物理证据、NPC证词 | 中性，所有路线共用 | 低消耗 |
| `心理` | 玩家自身的精神状态、药物、记忆、幻觉 | 路线C（玩家线） | 高理智消耗 |
| `犯罪` | 现场痕迹、物证、暴力证据 | 路线A（老头）或路线B（侦探） | 中等消耗 |
| `隐瞒` | 角色间的隐瞒、知情不报、误导 | 学姐线/玩家线 | 中等消耗 |

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

  // 行动系统
  observe?: string;
  investigateItems?: Array<{
    desc: string;
    suspect: string;       // '玩家' | '老头' | '侦探A' | '侦探B' | '学姐' | '无'
    style: string;         // '现实' | '心理' | '犯罪' | '隐瞒'
    time: string;
    stamina: number;
    sanity: number;
  }>;
  actionItems?: Array<{
    desc: string;
    style: string;         // '现实' | '心理' | '犯罪' | '隐瞒'
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
    → 如果结果中有 [线索]，提示玩家可整理

玩家点击 [行动]
    → 弹出面板，列出 <actionItems>
    → 体力/理智不足的项目置灰
    → 玩家选择一项
    → 扣除对应体力/理智
    → 发送请求给 LLM（携带行动描述+当前场景）
    → LLM 返回 <action type="act">...</action>
    → 如果结果中有 [变化] 场景切换 → xxx，切换场景背景
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

嫌疑人可选：玩家、老头、侦探A、侦探B、学姐、无
风格可选：现实、心理、犯罪、隐瞒

调查项和行动项的设计原则：
- 至少 1 项指向当前已推进的真相线索
- 至少 1 项指向其他真相方向（误导/隐藏线索）
- 高理智消耗的项目往往指向深层真相（玩家线）
- 高体力消耗的项目往往涉及场景切换或远距离调查
- "心理"风格的项目消耗理智较高，"犯罪"风格消耗体力较高
```

### 二次请求 Prompt（调查/行动结果）

**调查请求**：
```
[系统] 玩家选择了调查："{investigateDesc}"
当前场景：{currentBackground}
嫌疑人指向：{suspect}
结果风格：{style}
已发生剧情：{lastFewLines}
当前轮回：{cycleCount}
当前理智：{sanity}

请返回详细的调查结果，包含发现、疑点、可能的线索。
输出格式：<action type="investigate">...</action>
```

**行动请求**：
```
[系统] 玩家执行了行动："{actionDesc}"
当前场景：{currentBackground}
结果风格：{style}
当前轮回：{cycleCount}
当前理智：{sanity}

请描述行动过程、结果、场景变化（如果有）。
如果行动导致场景切换，在文本末尾加上：[变化] 场景切换 → 新场景名
输出格式：<action type="act">...</action>
```
