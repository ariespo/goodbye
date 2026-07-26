# 时间节点触发轮回 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引擎接管游戏时钟推进，实装三种轮回触发（过零点/体力/理智）与 16:00 死讯定时事件。

**Architecture:** 新增两个纯函数模块（game-clock 时钟结算、scheduled-events 定时事件表），在 `useGameLoop` 的 finalize 结算点接线：回合成功后引擎扣时 → 事件检查 → 复用现有 `checkCycleFailure`/`pendingCycleReset`/`startNextCycle` 轮回链路。死讯/崩溃段以文本指令注入导演（agent 模式）与 user prompt（legacy 模式），剧情表现全交给 LLM。

**Tech Stack:** TypeScript + Vitest + Zustand。规格见 `docs/superpowers/specs/2026-07-27-time-loop-trigger-design.md`。

## Global Constraints

- 时钟只进不退；LLM 写的 `vars.time` 只有更晚才生效。
- `timeCost` 钳制 1–180 分钟；缺省兜底 10 分钟。
- 只有成功落库的回合才推进时钟（重试不双重扣时）。
- 轮回触发优先级最高于死讯事件。
- `deathNews` 不加入 `INHERITED_KEYS`（轮回自动清除）。
- 现有 236 个测试保持全绿；`npx tsc --noEmit` 零错误。
- 中文注释风格与现有代码一致；仅注释非显然的 WHY。

---

### Task 1: 引擎时钟纯函数模块 game-clock

**Files:**
- Create: `src/engine/game-clock.ts`
- Test: `src/engine/game-clock.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，零依赖）
- Produces:
  - `parseTimeCost(text: string | undefined | null): number` — `'5分钟'→5`、`'2小时'→120`、`'1小时30分钟'→90`、`'30 分钟'→30`；无法解析返回 `0`
  - `clampTimeCost(minutes: number): number` — 取整并钳制到 `[1, 180]`；非有限数返回 `10`
  - `advanceClock(timeISO: string, minutes: number): string` — 返回推进后的 `'YYYY-MM-DDTHH:mm:ss'`（本地时间无时区后缀，与 `settleCycleVariables` 的 `'2024-09-09T07:30:00'` 格式一致）；`timeISO` 非法时视为 `'2024-09-09T07:30:00'`
  - `laterTime(aISO: string, bISO: string): string` — 返回较晚者；一方非法返回另一方
  - `crossesThreshold(prevISO: string, nextISO: string, thresholdISO: string): boolean` — `prev < threshold && next >= threshold`

- [ ] **Step 1: 写失败测试**

```ts
// src/engine/game-clock.test.ts
import { describe, it, expect } from 'vitest';
import { parseTimeCost, clampTimeCost, advanceClock, laterTime, crossesThreshold } from './game-clock';

describe('parseTimeCost', () => {
  it('解析分钟', () => expect(parseTimeCost('5分钟')).toBe(5));
  it('解析小时', () => expect(parseTimeCost('2小时')).toBe(120));
  it('解析小时+分钟', () => expect(parseTimeCost('1小时30分钟')).toBe(90));
  it('容忍空格', () => expect(parseTimeCost('30 分钟')).toBe(30));
  it('无法解析返回0', () => expect(parseTimeCost('片刻')).toBe(0));
  it('空值返回0', () => expect(parseTimeCost(undefined)).toBe(0));
});

describe('clampTimeCost', () => {
  it('正常值取整', () => expect(clampTimeCost(15.7)).toBe(16));
  it('下限1', () => expect(clampTimeCost(0)).toBe(1));
  it('上限180', () => expect(clampTimeCost(999)).toBe(180));
  it('NaN返回默认10', () => expect(clampTimeCost(NaN)).toBe(10));
});

describe('advanceClock', () => {
  it('推进分钟', () => expect(advanceClock('2024-09-09T07:30:00', 45)).toBe('2024-09-09T08:15:00'));
  it('跨日', () => expect(advanceClock('2024-09-09T23:50:00', 20)).toBe('2024-09-10T00:10:00'));
  it('非法时间视为开局时刻', () => expect(advanceClock('garbage', 30)).toBe('2024-09-09T08:00:00'));
});

describe('laterTime', () => {
  it('返回较晚者', () => expect(laterTime('2024-09-09T08:00:00', '2024-09-09T11:00:00')).toBe('2024-09-09T11:00:00'));
  it('时钟只进不退', () => expect(laterTime('2024-09-09T12:00:00', '2024-09-09T09:00:00')).toBe('2024-09-09T12:00:00'));
  it('一方非法返回另一方', () => expect(laterTime('garbage', '2024-09-09T09:00:00')).toBe('2024-09-09T09:00:00'));
});

describe('crossesThreshold', () => {
  const T16 = '2024-09-09T16:00:00';
  it('跨过16点', () => expect(crossesThreshold('2024-09-09T15:50:00', '2024-09-09T16:10:00', T16)).toBe(true));
  it('恰好落在阈值', () => expect(crossesThreshold('2024-09-09T15:50:00', T16, T16)).toBe(true));
  it('未到不触发', () => expect(crossesThreshold('2024-09-09T14:00:00', '2024-09-09T15:00:00', T16)).toBe(false));
  it('早已过了不重复触发', () => expect(crossesThreshold('2024-09-09T16:30:00', '2024-09-09T17:00:00', T16)).toBe(false));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/engine/game-clock.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/engine/game-clock.ts
const FALLBACK_TIME = '2024-09-09T07:30:00';

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 把「5分钟」「2小时」「1小时30分钟」解析成分钟数；无法解析返回 0 */
export function parseTimeCost(text: string | undefined | null): number {
  if (!text) return 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|时)/);
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*分/);
  const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
  const mins = minMatch ? parseFloat(minMatch[1]) : 0;
  return Math.round(hours * 60 + mins);
}

/** 钳制到 1–180 分钟，防止 LLM 报离谱值一回合跳一天 */
export function clampTimeCost(minutes: number): number {
  if (!Number.isFinite(minutes)) return 10;
  return Math.min(180, Math.max(1, Math.round(minutes)));
}

export function advanceClock(timeISO: string, minutes: number): string {
  const base = toDate(timeISO) ?? toDate(FALLBACK_TIME)!;
  return toLocalISO(new Date(base.getTime() + minutes * 60_000));
}

/** 时钟只进不退：返回较晚者 */
export function laterTime(aISO: string, bISO: string): string {
  const a = toDate(aISO);
  const b = toDate(bISO);
  if (!a) return bISO;
  if (!b) return aISO;
  return a.getTime() >= b.getTime() ? aISO : bISO;
}

export function crossesThreshold(prevISO: string, nextISO: string, thresholdISO: string): boolean {
  const prev = toDate(prevISO);
  const next = toDate(nextISO);
  const threshold = toDate(thresholdISO);
  if (!prev || !next || !threshold) return false;
  return prev.getTime() < threshold.getTime() && next.getTime() >= threshold.getTime();
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/engine/game-clock.test.ts`
Expected: PASS 全绿

- [ ] **Step 5: Commit**

```bash
git add src/engine/game-clock.ts src/engine/game-clock.test.ts
git commit -m "feat: 引擎时钟纯函数模块(耗时解析/推进/阈值判定)"
```

---

### Task 2: 定时事件表 scheduled-events

**Files:**
- Create: `src/engine/scheduled-events.ts`
- Test: `src/engine/scheduled-events.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `crossesThreshold(prevISO, nextISO, thresholdISO)`
- Produces:
  - `DEATH_NEWS_TIME = '2024-09-09T16:00:00'`（导出常量）
  - `checkScheduledEvents(prevTimeISO: string, nextTimeISO: string, variables: Record<string, any>): { deathNews?: 'pending' }` — 跨过 16:00 且 `variables.deathNews` 未置位时返回 `{ deathNews: 'pending' }`，否则 `{}`
  - `buildScheduledDirectives(variables: Record<string, any>): string[]` — `deathNews === 'pending'` → `[死讯必须呈现指令]`；`'delivered'` → `[崩溃段氛围指令]`；否则 `[]`
- 状态机：`variables.deathNews`: `undefined → 'pending' → 'delivered'`。`pending → 'delivered'` 的转移由 Task 4 在 finalize 中完成（注入过指令的回合成功落库后）。

- [ ] **Step 1: 写失败测试**

```ts
// src/engine/scheduled-events.test.ts
import { describe, it, expect } from 'vitest';
import { checkScheduledEvents, buildScheduledDirectives, DEATH_NEWS_TIME } from './scheduled-events';

describe('checkScheduledEvents', () => {
  it('跨过16点触发死讯pending', () => {
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', {}))
      .toEqual({ deathNews: 'pending' });
  });
  it('未跨过不触发', () => {
    expect(checkScheduledEvents('2024-09-09T10:00:00', '2024-09-09T11:00:00', {})).toEqual({});
  });
  it('已置位不重复触发', () => {
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', { deathNews: 'delivered' }))
      .toEqual({});
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', { deathNews: 'pending' }))
      .toEqual({});
  });
  it('新轮次变量已清除后可再次触发', () => {
    // settleCycleVariables 不继承 deathNews，等价于 {} 场景
    expect(checkScheduledEvents('2024-09-09T15:59:00', DEATH_NEWS_TIME, {}))
      .toEqual({ deathNews: 'pending' });
  });
});

describe('buildScheduledDirectives', () => {
  it('pending返回死讯指令', () => {
    const lines = buildScheduledDirectives({ deathNews: 'pending' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('死讯');
    expect(lines[0]).toContain('必须');
  });
  it('delivered返回崩溃段指令', () => {
    const lines = buildScheduledDirectives({ deathNews: 'delivered' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('崩溃');
  });
  it('未置位返回空数组', () => {
    expect(buildScheduledDirectives({})).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/engine/scheduled-events.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// src/engine/scheduled-events.ts
import { crossesThreshold } from './game-clock';

export const DEATH_NEWS_TIME = '2024-09-09T16:00:00';

/**
 * 定时事件表。引擎只管「何时必须发生」，怎么演全交给写手。
 * 目前仅一条 death-news；将来扩展文穗时刻表时在此增加记录。
 */
export function checkScheduledEvents(
  prevTimeISO: string,
  nextTimeISO: string,
  variables: Record<string, any>,
): { deathNews?: 'pending' } {
  if (!variables.deathNews && crossesThreshold(prevTimeISO, nextTimeISO, DEATH_NEWS_TIME)) {
    return { deathNews: 'pending' };
  }
  return {};
}

const DEATH_NEWS_DIRECTIVE =
  '【定时事件·必须执行】时间已过16:00：文穗的死讯必须在本回合送达玩家（警方电话、警察上门、邻居传话等形式自选，地点不合适就让消息追到玩家所在处）。死讯到达后叙事基调转为崩溃，理智应明显下降。';

const COLLAPSE_DIRECTIVE =
  '【崩溃段】玩家已得知文穗的死讯。维持崩溃与失序氛围：理智持续下滑，调查/行动项收窄为与死讯相关或麻木的日常动作，NPC 反应事件余波。不要提供任何能拯救文穗的选项，时间将自然推进到午夜触发轮回。';

export function buildScheduledDirectives(variables: Record<string, any>): string[] {
  if (variables.deathNews === 'pending') return [DEATH_NEWS_DIRECTIVE];
  if (variables.deathNews === 'delivered') return [COLLAPSE_DIRECTIVE];
  return [];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/engine/scheduled-events.test.ts`
Expected: PASS 全绿

- [ ] **Step 5: Commit**

```bash
git add src/engine/scheduled-events.ts src/engine/scheduled-events.test.ts
git commit -m "feat: 定时事件表(16:00死讯/崩溃段指令)"
```

---

### Task 3: timeCost 上报协议（legacy vars + 导演计划字段）

**Files:**
- Modify: `src/sillytavern/types.ts`（`DEFAULT_FORMAT_PROMPT` 内 `<vars>` 协议段，约 L200 起的模板中 `<vars>{ "location": ... }</vars>` 示例附近）
- Modify: `src/agents/mystery/types.ts`（`DirectorPlan` 接口，约 L151-159）
- Modify: `src/agents/mystery/schemas.ts`（`DIRECTOR_PLAN_JSON_SCHEMA.properties`）
- Modify: `src/agents/mystery/prompts.ts`（导演 system prompt）
- Test: `src/agents/mystery/orchestrator.test.ts`（现有用例保持绿即可，新增一条可选字段透传断言）

**Interfaces:**
- Consumes: 无
- Produces:
  - legacy 协议：写手可在 `<vars>` JSON 中输出 `"timeCost": <分钟数>`（消费型，引擎读取后剔除，Task 4 实现读取）
  - `DirectorPlan.timeCostMinutes?: number` — agent 模式回合耗时估计，经 `preparedTurn.writerPacket.plan.timeCostMinutes` 到达 finalize（Task 4 消费）

- [ ] **Step 1: legacy 协议加一行**

在 `src/sillytavern/types.ts` 的 `DEFAULT_FORMAT_PROMPT` 中，`<vars>` 规则说明处（示例 `<vars>{ "location": "school", "stamina": 80, "sanity": 75 }</vars>` 附近）追加一条规则：

```
- vars 中额外输出 "timeCost": 本回合经过的分钟数(整数,1-180)。例如闲聊约10,搜查房间约30。系统据此推进游戏时钟,不会存档该字段。
```

- [ ] **Step 2: DirectorPlan 加可选字段**

`src/agents/mystery/types.ts` 的 `DirectorPlan` 接口末尾追加：

```ts
  /** 本回合预计经过的分钟数(1-180)，引擎据此推进游戏时钟 */
  timeCostMinutes?: number;
```

`src/agents/mystery/schemas.ts` 的 `DIRECTOR_PLAN_JSON_SCHEMA` 的 `properties` 中追加（**不进 `required`**，兼容旧预跑缓存）：

```ts
    timeCostMinutes: { type: 'integer', minimum: 1, maximum: 180 },
```

- [ ] **Step 3: 导演 prompt 说明**

`src/agents/mystery/prompts.ts` 导演 system prompt 中（计划字段说明区）追加一行：

```
- timeCostMinutes: 本回合经过的游戏内分钟数(整数1-180)。对话约5-15,调查约20-40,跨地点移动约15-30。
```

- [ ] **Step 4: 新增透传断言 + 回归**

在 `src/agents/mystery/orchestrator.test.ts` 中找到现有「导演计划解析」用例（mock 返回 JSON 的那类），复制一条：mock 的导演 JSON 中加 `"timeCostMinutes": 25`，断言 `plan.timeCostMinutes === 25`。

Run: `npx vitest run src/agents/mystery && npx tsc --noEmit`
Expected: PASS 全绿

- [ ] **Step 5: Commit**

```bash
git add src/sillytavern/types.ts src/agents/mystery/types.ts src/agents/mystery/schemas.ts src/agents/mystery/prompts.ts src/agents/mystery/orchestrator.test.ts
git commit -m "feat: timeCost上报协议(legacy vars字段+导演计划timeCostMinutes)"
```

---

### Task 4: useGameLoop 接线（扣时、事件状态机、指令注入）

**Files:**
- Modify: `src/hooks/useGameLoop.ts`
  - 模块顶部（`cachedPreparedTurn` 定义附近）：新增 `pendingTimeCost` 缓存
  - `sendMessage` 内 L213（`appendResourcePrompt`）与 L279（`thresholdDirectives`）：指令注入
  - `finalize`（L322-392）：扣时 + 事件状态机
  - `performAction`（L686-697、L709-720）：调查/行动项耗时缓存
- 回归: 全量 `npx vitest run`

**Interfaces:**
- Consumes: Task 1 `parseTimeCost/clampTimeCost/advanceClock/laterTime`；Task 2 `checkScheduledEvents/buildScheduledDirectives`；Task 3 `vars.timeCost` 与 `plan.timeCostMinutes`
- Produces: `variables.time` 每回合可靠推进；`variables.deathNews` 状态机；现有 `checkCycleFailure`（useGameLoop.ts:362，已接 `pendingCycleReset` → `CycleResetWatcher` → `startNextCycle`）从此真正会因 day-end 命中

- [ ] **Step 1: 模块级耗时缓存 + import**

`useGameLoop.ts` 顶部 import：

```ts
import { parseTimeCost, clampTimeCost, advanceClock, laterTime } from '../engine/game-clock';
import { checkScheduledEvents, buildScheduledDirectives } from '../engine/scheduled-events';
```

`cachedPreparedTurn` 定义旁新增：

```ts
// 玩家点击调查/行动项时缓存其标注耗时；重试同一输入时仍可命中
let pendingTimeCost: { chatId: string; input: string; minutes: number } | null = null;
```

- [ ] **Step 2: performAction 缓存耗时**

`performAction` 的 investigate 分支（L688 `const item = ...` 之后、`sendMessage(prompt)` 之前）插入：

```ts
        const parsedCost = parseTimeCost(item.time);
        pendingTimeCost = parsedCost > 0
          ? { chatId: store.tavern.activeChatId, input: prompt, minutes: clampTimeCost(parsedCost) }
          : null;
```

actions 分支（L711 `const item = ...` 之后）插入同样四行（`item` 为行动项）。

- [ ] **Step 3: sendMessage 注入定时事件指令**

L213 处改为（legacy 与写手侧都经 `promptUserInput` 生效）：

```ts
      const scheduledDirectives = buildScheduledDirectives(tavern.variables);
      const hadPendingDeathNews = tavern.variables.deathNews === 'pending';
      const promptUserInput = appendResourcePrompt(userInput, game.currentState.background, tavern.variables)
        + (scheduledDirectives.length ? '\n\n' + scheduledDirectives.map(l => `[系统指令] ${l}`).join('\n') : '');
```

L279 导演 turnContext 改为：

```ts
              thresholdDirectives: translateForDirector(tavern.variables)
                + (scheduledDirectives.length ? '\n' + scheduledDirectives.map(l => `- ${l}`).join('\n') : ''),
```

- [ ] **Step 4: finalize 扣时与事件状态机**

finalize 开头（L323-328）改为——先剔除消费型 `timeCost` 再进白名单校验，避免误报 rejected：

```ts
      const finalize = (apiUsed: 'primary' | 'dual') => {
        const parsed = parseStateRef.current.parsed;
        const { timeCost: reportedTimeCost, ...varsPatch } = (parsed.vars ?? {}) as Record<string, any>;
        const sanitized = sanitizeVarsPatch(varsPatch, tavern.variables);
```

紧接 `mergedVariables = mergeAuthorizedKnowledge(...)`（L329）之后插入引擎扣时：

```ts
        // 引擎时钟结算：优先用玩家点击项的标注耗时，其次 LLM 上报，最后兜底 10 分钟
        const prevClockISO = typeof tavern.variables.time === 'string'
          ? tavern.variables.time
          : game.gameStatus.time.toISOString();
        const actionCost = pendingTimeCost
          && pendingTimeCost.chatId === tavern.activeChatId
          && pendingTimeCost.input === userInput
          ? pendingTimeCost.minutes : null;
        const llmCostRaw = Number(reportedTimeCost ?? preparedTurn?.writerPacket.plan.timeCostMinutes);
        const llmCost = Number.isFinite(llmCostRaw) && llmCostRaw > 0 ? clampTimeCost(llmCostRaw) : null;
        let nextTimeISO = advanceClock(prevClockISO, actionCost ?? llmCost ?? 10);
        // LLM 直接写了更晚的 time(剧情跳时间)则以更晚者为准；时钟只进不退
        if (typeof sanitized.vars.time === 'string') nextTimeISO = laterTime(nextTimeISO, sanitized.vars.time);
        pendingTimeCost = null;

        // 死讯事件状态机: 跨16:00置pending；注入过指令的回合成功后转delivered
        const eventPatch = checkScheduledEvents(prevClockISO, nextTimeISO, mergedVariables);
        mergedVariables = { ...mergedVariables, time: nextTimeISO, ...eventPatch };
        if (!eventPatch.deathNews && hadPendingDeathNews) {
          mergedVariables = { ...mergedVariables, deathNews: 'delivered' };
        }
```

原 L331-343 的条件块改为无条件（时间每回合都变）：

```ts
        actions.setVariables(mergedVariables);
        if (sanitized.vars.stamina !== undefined) {
          actions.setGameStatus({ stamina: sanitized.vars.stamina });
        }
        if (sanitized.vars.sanity !== undefined) {
          actions.setGameStatus({ sanity: sanitized.vars.sanity });
        }
        actions.setGameStatus({ time: new Date(nextTimeISO) });
```

原 L345-349 `nextStatus` 的 `time` 行改为：

```ts
          time: new Date(nextTimeISO),
```

其余（`checkEndingConditions`/`checkCycleFailure`/`setPendingCycleReset`、消息落库、预规划）不动——`checkCycleFailure(nextStatus)` 现在拿到的是引擎推进后的时间，day-end 将真实命中；轮回结算走现有 `settleCycleVariables`（`deathNews` 非继承字段，自动清除）。

- [ ] **Step 5: 类型检查 + 全量回归**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全绿（236+ 通过；若 useGameLoop 相关 mock 测试因 `variables.time` 新增写入而断言失败，按新行为更新断言——时间推进是预期变化）

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGameLoop.ts
git commit -m "feat: 引擎接管时钟推进与死讯事件状态机,轮回触发不再依赖LLM自觉"
```

---

### Task 5: 浏览器真实 API 验证

**Files:** 无代码改动（验证任务；发现问题则回改对应模块并补测试）

**Interfaces:**
- Consumes: Task 1-4 全部成果；DeepSeek API 已配置于应用设置（FarewellDB）
- Produces: 验证结论记录在任务完成汇报中

- [ ] **Step 1: 启动与基线**

`npm run dev` 后用 Playwright 打开 `localhost:5173`，开始游戏并快进开场。确认 STATUS 侧栏时间为 `07:30`。

- [ ] **Step 2: 时钟推进验证**

点一个调查项，等回合完成。断言：侧栏时间前进了该项标注的耗时（或 LLM 上报值）；再发一条纯对话输入，确认时间再次前进（约 5-15 分钟或兜底 10 分钟）。

- [ ] **Step 3: 死讯与崩溃段验证**

用 Playwright evaluate 把 `variables.time` 改到 `2024-09-09T15:55:00`（通过 store：`useGameStore.getState().actions.setVariables({ ...vars, time: '2024-09-09T15:55:00' })`，同时 `setGameStatus`），执行一次调查把时钟推过 16:00。断言：本回合正常结束；**下一回合**剧情呈现死讯（正文含警察/电话/噩耗类内容）；再下一回合氛围为崩溃段、理智下降。

- [ ] **Step 4: 强制轮回验证**

再把时间改到 `2024-09-09T23:55:00`，做任意行动推过零点。断言：场景播完后触发轮回过场（「午夜零点…」）、toast「第 N 次轮回开始了」、侧栏 LOOP 计数 +1、时间回到 07:30、线索保留、`variables.deathNews` 已清除（evaluate 检查）。

- [ ] **Step 5: 回归收尾**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: 全绿 + 构建成功。汇报验证截图/结论。

---

## Self-Review 记录

- Spec 覆盖：引擎扣时(Task 1+4)、三来源耗时(Task 3+4)、只进不退(Task 1 laterTime)、钳制(Task 1)、死讯事件表+每轮触发+崩溃段(Task 2+4)、指令双通道注入(Task 4 Step 3)、轮回衔接与优先级(Task 4 Step 4 复用现有链路；轮回结算清除 deathNews)、重试不双重扣时(仅 finalize 执行；pendingTimeCost 按 chatId+input 匹配，重试同输入可命中)、测试与浏览器验证(各 Task + Task 5)。无缺口。
- 占位符扫描：无 TBD/TODO；所有代码步骤含实际代码。
- 类型一致性：`parseTimeCost/clampTimeCost/advanceClock/laterTime/crossesThreshold`、`checkScheduledEvents/buildScheduledDirectives/DEATH_NEWS_TIME`、`DirectorPlan.timeCostMinutes`、`vars.timeCost` 在各 Task 间命名一致。
