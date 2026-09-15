import { STORY_WORLD_CONTRACT } from '../../engine/story-rules';

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
- 同一角色的嫌疑度在一个完整重复日内累计最多增加 15；上限只限制数值，不限制按事实门取得新材料或复述已知材料，不得仅因预算用尽强制转向。真实剧情阻碍与转场仍须有独立依据。
- 玩家输入表达的是角色尝试，不是世界规则或必然结果；越权、规则破坏、凭空人物或机械降神只能表现为主观幻想，并由程序扣除理智。
- 日初重置时间是08:00，当前分钟以gameStatus.time为准，不得在正文中虚构另一时间。

${STORY_WORLD_CONTRACT}`;

export function buildLoopPacingContract(cycleCountValue: unknown): string {
  const cycleCount = normalizeCycleCount(cycleCountValue);
  const completedLoops = Math.max(0, cycleCount - 1);
  const phase = cycleCount === 1
    ? '第一重复日：让玩家实际询问她的去向，区分熟悉她的生活习惯与知道她的安排；允许取得一项非排他的具体线索，不收束答案。'
    : cycleCount === 2
      ? '第二重复日：通过已授权的文穗自述、物件或准备展示她自己的决定；她的出行意愿不等于事件结果，不能只用他人评价替她表达。'
      : cycleCount === 3
        ? '第三重复日：让玩家基于已有信息尝试核实安全或救援，回应具体行动；指出尚未核实的日期、身份和消息时间，不捏造玩家做过的救援，不确认真凶。'
        : '已完成至少三次完整轮回：可以复盘和形成路线，但最终真相仍须满足授权事实与程序结局门。';
  const earlyGate = completedLoops < 3 ? '本回合禁止确认真凶或收束到普通路线结局。' : '';
  return `${LOOP_PACING_CONTRACT}\n- 当前重复日：cycleCount=${cycleCount}；已完成轮回数=${completedLoops}。${phase}${earlyGate}`;
}
