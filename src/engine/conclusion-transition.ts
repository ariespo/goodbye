import type { ConclusionChoiceId } from './conclusion-system';

const ROUTE_BRIDGES: Record<string, string> = {
  A: '你把最后一页证词按在桌面上。那个一直被你追问的人终于没有再移开视线。',
  B: '两名侦探之间短促的沉默，比任何辩解都更清楚。你作出的决定同时落在了他们身上。',
  C: '你不再把记忆里的空白推给别人。镜中的自己没有回答，却也没有再次消失。',
  N: '你把寻找“凶手”的问题放下，第一次允许那封告别信以它本来的样子被读完。',
  F: '你沿着最后一处生还痕迹走到雨幕边缘；从这里开始，追寻与放手只能选择其一。',
  X: '仪式留下的痕迹在你眼前连成完整的圆。你迈出的下一步，将决定这个圆是否还能闭合。',
  P: '病房与暴雨小镇的声音在同一秒重叠。你必须决定哪一个世界值得醒来。',
};

const CHOICE_LINES: Partial<Record<ConclusionChoiceId, string>> = {
  report: '你把证据整理好，决定让它进入所有人都无法抹去的记录。',
  private: '你合上档案，选择独自去完成最后一次对质。',
  accept: '你没有再后退，决定承受这个答案带来的一切。',
  deny: '你拒绝让这个答案替你定义余下的人生。',
  letgo: '你松开一直攥紧的手，允许告别真正发生。',
  refuse: '你留下最后一页空白，决定继续追问。',
  release: '你停止追逐，把她选择去往何处的权利还给她。',
  pursue: '你走进雨里，决定追到痕迹真正终止的地方。',
  destroy: '你伸手破坏维持仪式的最后一个支点。',
  sacrifice: '你走进原本属于她的位置。',
  wake: '你朝门外真实的声音伸出手。',
  sink: '你关上门，选择留在仍有她存在的世界。',
};

export function buildConclusionTransitionMaintext(endingId: string, choiceId: ConclusionChoiceId): string {
  const route = endingId.split('-')[0];
  return `场景|black
效果|ending-transition
音乐|silence
对话|旁白|tense|${CHOICE_LINES[choiceId] ?? '你终于作出了不能撤回的选择。'}
对话|旁白|calm|${ROUTE_BRIDGES[route] ?? '世界停顿了一瞬，然后开始回应你的选择。'}
对话|旁白|calm|这不是一个突然出现的答案，而是此前每一次调查、迟疑和重置共同抵达的结果。`;
}
