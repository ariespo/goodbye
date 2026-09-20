import type { ConclusionChoiceId } from './conclusion-system';

const ROUTE_BRIDGES: Record<string, string> = {
  A: '内室的伤痕、二楼窗沿与转运记录已经接上。周德明施暴、推落文穗并伪装现场的事实，不会随你的处理方式改变。',
  B: '记录里的两个环节已经分清：赵刚强行带人时造成致命撞击，林静随后参与转移和掩盖。你作出的选择将决定怎样面对这些证据。',
  C: '外部录音、伤情和前夜的时间相互吻合。你是否愿意承认，都不能改变你在家中扼死文穗的事实。',
  N: '连续画面与伤情已经证实独行失足和栏杆失效。信里写的是她离开的意愿；接受或拒绝那封信，都不会改写事故。',
  F: '文穗离开后的生还已经核实。她没有布置遗体；初报的误认给了她时间，而循着你打听的人仍可能找到她。',
  X: '仪式的反应已经验证，周德明杀害并转移文穗的罪行也仍然成立。切断支点会终止循环；封存清晨只会消耗你的余生，不能让她复活。',
  P: '治疗环境与案卷的对应已经核实。病房解释了调查世界怎样被重构，不能撤销前夜你对文穗的暴力与责任。',
};

const CHOICE_LINES: Partial<Record<ConclusionChoiceId, string>> = {
  report: '你把证据整理好，决定让它进入所有人都无法抹去的记录。',
  private: '你合上档案，决定私下报复周德明，自己承担随后的一切。',
  accept: '你没有再后退，决定承受这个答案带来的一切。',
  deny: '你决定拒绝已经核实的答案，再把自己藏进记忆的空白里。',
  letgo: '你松开一直攥紧的手，允许告别真正发生。',
  refuse: '你明知事故已经有了答案，还是决定拒绝这次告别。',
  release: '你停止追逐，把她选择去往何处的权利还给她。',
  pursue: '你走进雨里，决定追到痕迹真正终止的地方。',
  destroy: '你伸手破坏维持仪式的最后一个支点。',
  sacrifice: '你把自己的余生留在祭坛里，决定让清晨一直重演。',
  wake: '你朝门外真实的声音伸出手。',
  sink: '你把注意力从病房移开，选择留在记忆重构出的清晨。',
};

export function buildConclusionTransitionMaintext(endingId: string, choiceId: ConclusionChoiceId): string {
  const route = endingId.split('-')[0];
  return `场景|black
效果|ending-transition
音乐|silence
对话|旁白|tense|${CHOICE_LINES[choiceId] ?? '你终于作出了不能撤回的选择。'}
对话|旁白|calm|${ROUTE_BRIDGES[route] ?? '世界停顿了一瞬，然后开始回应你的选择。'}
对话|旁白|calm|选择已经作出。接下来，是这条路留下的后果。`;
}

export function buildMetaEndingTransitionMaintext(endingId: 'STAY' | 'TRUE'): string {
  const lines = endingId === 'STAY'
    ? ['你第三次选择留在家里，把注意力交给与文穗相处的记忆。',
      '你没有等到她走进屋。接下来浮现的早餐和问候，都来自你记得、又忍不住补写的旧日。']
    : ['你停下追问，在记忆中向文穗道别。眼前的房间没有因此多出一个人。',
      '已经走过的故事各有自己的经过。你把它们分别合上，不再拿这一篇的答案覆盖另一篇。'];
  return ['场景|black', '效果|ending-transition', '音乐|silence',
    ...lines.map(line => `对话|旁白|calm|${line}`)].join('\n');
}
