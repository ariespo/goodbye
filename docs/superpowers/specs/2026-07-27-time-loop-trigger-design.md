# 时间节点触发轮回：引擎时钟 + 定时事件表

日期：2026-07-27
状态：已与用户对齐（方案 A）

## 背景与问题

游戏设定是时间循环推理：玩家在 2024-09-09 一天内调查，到达时间节点后应触发轮回重置。轮回结算本身已完整实现（`src/utils/cycleLoop.ts`：`checkCycleFailure` 检测体力≤0/理智≤0/过零点，`settleCycleVariables` 继承线索并重置状态，`startNextCycle` 生成过场），但存在两个断层：

1. **时钟不动**：调查/行动项的时间成本（「5分钟」等）只是展示文本，`variables.time` 全靠 LLM 自觉在 vars 里写新值，实际几乎不推进，导致过零点触发永远等不到。
2. **16:00 死讯事件未实装**：`docs/loop-flow.md` 设定第 1 轮约 16:00–17:00 得知文穗死讯，代码中无任何机制保证它发生。

## 决策记录（用户已确认）

- 时间推进由**引擎结算**，LLM 只负责叙事。
- 三个触发点全部实装：过零点强制轮回、体力/理智归零硬触发、16:00 死讯剧本事件。
- 死讯**不立即触发轮回**：死讯 → 崩溃段剧情（可玩但受限）→ 时间推到凌晨 → 引擎强制轮回。
- 死讯**每轮都触发**（只要文穗未被救），后续轮次叙事由写手按 cycleCount 变化。
- 纯对话回合耗时由**导演/写手报数**（vars.timeCost），缺失时默认 10 分钟兜底。

## 设计

### 1. 引擎时钟结算（`src/engine/game-clock.ts`，纯函数）

- `parseTimeCost(text: string): number` — 把 `'5分钟'`/`'2小时'`/`'30分钟'` 解析成分钟数；无法解析返回 0。
- `advanceClock(timeISO: string, minutes: number): string` — 返回推进后的时间字符串。
- 耗时来源优先级：
  1. 玩家点击的调查/行动项自带 `time` 字段 → 引擎直接扣，不经 LLM；
  2. 对话/自由输入回合 → 读写手 `vars.timeCost`（分钟数，输出协议中注明）；
  3. 都没有 → 默认 10 分钟。
- `vars.timeCost` 是消费型字段：结算后从 vars 中剔除，不落库。钳制在 1–180 分钟。
- LLM 若在 `vars.time` 直接写了**更晚**的时间（剧情跳时间，如昏睡），以更晚者为准；**时钟只进不退**。

### 2. 定时事件表（`src/engine/scheduled-events.ts`）

数据驱动的极简事件表，目前仅一条：

- **death-news（16:00）**：触发条件 = 本回合时钟跨过 16:00 且 `variables.deathNewsDelivered` 未置位、且文穗未被救。「未被救」首版判定：结局面板未激活且回合仍在正常游玩流程（当前游戏内容中 16:00 前无法真正救下文穗，特殊路线均直接进入结局流程，故此判定成立；后续内容若引入白天救援线，再扩展为显式剧情标记）。
- 命中后：置 `variables.deathNewsDelivered = true`，并给**下一回合**注入强制指令——agent 模式写进导演 brief（「本回合必须呈现死讯到达，形式由写手定」），legacy 模式追加到 system prompt。
- **崩溃段**：`deathNewsDelivered` 为真期间，每回合导演/写手指令附带崩溃氛围约束（理智持续下滑、调查项收窄、NPC 反应变化）。玩家仍可自由行动，直到过零点由引擎强制轮回。
- 引擎只管「何时必须发生」，怎么演全交给写手；死讯不打断当前回合。
- `deathNewsDelivered` 不进 `INHERITED_KEYS`，轮回结算时自然清除，每轮可重新触发。

### 3. 触发与轮回衔接（`src/hooks/useGameLoop.ts` finalize）

结算顺序（仅在回合成功落库时执行，重试/校验失败不扣时）：

```
vars 合并 → 引擎扣时（写回 variables.time + 同步 gameStatus.time 显示）
→ 定时事件检查（置死讯 flag）
→ checkCycleFailure（体力≤0 / 理智≤0 / 过零点）
→ 命中 → startNextCycle（现有：过场叙事 + toast + settleCycleVariables）
```

- 轮回优先级最高：同回合既跨 16:00 又过零点时直接轮回，死讯指令作废。
- 三种触发从此由引擎兜底强制，不依赖 LLM 把变量写到位。

### 4. 测试与验证

- `game-clock.test.ts`：耗时解析、扣时、只进不退、钳制、跨 16:00/零点判定。
- `scheduled-events.test.ts`：死讯触发条件矩阵（未触发/已触发/文穗已救/新轮次重置）。
- 现有 `cycleLoop.test.ts` 保持全绿；finalize 结算顺序用 mock LLM 单测。
- 浏览器实测（DeepSeek 真实 API）：连续调查推过 16:00 验证死讯回合与崩溃段氛围；推过零点验证强制轮回、LOOP 计数 +1、线索继承、`deathNewsDelivered` 清除。

## 明确不做（YAGNI）

- 不做完整文穗时刻表系统（`wensui-timeline.md` 数据化、导演逐时感知）——事件表结构为其留了扩展位，但本次只有 death-news 一条。
- 不改变「体力归零昏睡 1–3 小时」的叙事包装——引擎层面统一按硬触发轮回处理。
- 不新增 UI 组件；时间显示复用现有 STATUS 侧栏。
