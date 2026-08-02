function normalizeCycleCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export const LOOP_PACING_CONTRACT = `[核心时间结构与节奏契约]
- “剧情回合”是一次玩家输入/选择、一次场景生成和一次状态结算；一天内包含多个剧情回合。
- “轮回”只指玩家角色经历完整重复日并发生日终重置；绝不能把一次 AI 回复称为一次轮回。
- cycleCount 表示当前重复日序号，从 1 开始；已完成轮回数 = max(0, cycleCount - 1)。
- 前三个重复日（cycleCount 1–3）只能调查、失败、积累记忆与证据：不得确认真凶、不得输出 solution/confirmation 级答案、不得安排普通路线结局。
- cycleCount >= 4 才可进入正式复盘与路线分化；嫌疑度 50 只是路线候选，不等于事实成立，也不能单独授权结局。
- 最终指认必须等待程序授权的关键事实与解决事实；不得用玩家反复怀疑、氛围、眼神或同一证据的重复叙述制造快速锁凶。
- 同一角色的嫌疑度在一个完整重复日内累计最多增加 15；达到当日预算后，继续调查必须真实发生但以可信阻碍、第三者或非目标线索转向。
- 玩家输入表达的是角色尝试，不是世界规则或必然结果；越权、规则破坏、凭空人物或机械降神只能表现为主观幻想，并由程序扣除理智。
- 产品目标的日初重置时间是 08:00；迁移完成前若 gameStatus.time 与此不同，必须服从界面提供的实际时间，不得在正文中虚构另一时间。`;

export function buildLoopPacingContract(cycleCountValue: unknown): string {
  const cycleCount = normalizeCycleCount(cycleCountValue);
  const completedLoops = Math.max(0, cycleCount - 1);
  const phase = cycleCount === 1
    ? '第一重复日：以可信日常、关系和行动目的为主，只放入轻微不安，不向单一答案收束。'
    : cycleCount === 2
      ? '第二重复日：扩大异常与既视感，同时保留多个合理方向，不让任何一名嫌疑人压倒性领先。'
      : cycleCount === 3
        ? '第三重复日：加深矛盾与悬疑，让旧判断受到挑战，但仍禁止确认真凶或接近唯一解。'
        : '已完成至少三次完整轮回：可以复盘和形成路线，但最终真相仍须满足授权事实与程序结局门。';
  const earlyGate = completedLoops < 3 ? '本回合禁止确认真凶或收束到普通路线结局。' : '';
  return `${LOOP_PACING_CONTRACT}\n- 当前重复日：cycleCount=${cycleCount}；已完成轮回数=${completedLoops}。${phase}${earlyGate}`;
}
