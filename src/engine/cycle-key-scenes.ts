import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import { buildMysteryBrief } from '../agents/mystery/brief';
import { REVEAL_LEVELS, type RevealLevel } from '../agents/mystery/types';
import { normalizeWorldMemory } from '../memory/world-memory';
import type { ChatMessage, DynamicRecord } from '../sillytavern/types';
import { readPublicActionOutcome } from '../utils/actionPresentation';

export const FUMI_BOUNDARY_NOTE_ID = 'shared-fumi-boundary-note';

/** Text inside a protocol line can never introduce another command or XML tag. */
export function cycleProse(text: string): string {
  return text.replace(/[\r\n|｜<>]/gu, ' ').trim();
}

export function presentedCycleBeatIds(variables: DynamicRecord): string[] {
  const ids: unknown = variables.storyProgress?.presentedBeatIds;
  return Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))] : [];
}

/** Recall the exact acquired projection, including its uncertainty; never read canonicalTruth. */
function rememberedMaterials(variables: DynamicRecord): Array<{ factId: string; level: RevealLevel; text: string }> {
  const playerKnowledge = Object.fromEntries(Object.entries(variables.mysteryKnowledge ?? {})
    .filter(([, level]) => REVEAL_LEVELS.includes(level as RevealLevel))) as Record<string, RevealLevel>;
  const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, { cycleCount: Number(variables.cycleCount ?? 1),
    currentLocation: 'home', lockedRoute: null, activeOverlay: null, unlockedClueIds: [],
    playerKnowledge, suspicion: {}, activeNpcIds: [] });
  return brief.playerKnownFacts.map(fact => {
    const { level, text } = fact;
    const label = level === 'hint' ? '待核暗示' : level === 'atmosphere' ? '初步观察' : '已取得材料';
    return { factId: fact.id, level, text: `${label}：${text}` };
  });
}

/** Only accepted assistant outcomes and that day's accepted memory can attest execution. */
export function acceptedCycleConsequence(variables: DynamicRecord, messages: ChatMessage[]): string | undefined {
  const cycle = Number(variables.cycleCount ?? 1);
  const events = normalizeWorldMemory(variables).events;
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant' || Number(message.variables.cycleCount) !== cycle) continue;
    const outcome = readPublicActionOutcome(message.acceptedActionOutcome);
    if (!outcome) continue;
    const event = events.find(item => item.turnId === message.id && item.cycleCount === cycle && item.kind === 'narrative-turn');
    if (!event?.summary) return undefined;
    return `上一日最后的片段又浮上来：${event.summary}${outcome.remaining ? '还没做完的那一段，也停在了那里。' : ''}`;
  }
  return undefined;
}

export function buildCycleKeyScene(options: {
  nextVariables: DynamicRecord;
  previousVariables: DynamicRecord;
  messages: ChatMessage[];
}): { maintext: string; summary: string; beatId?: string; grantedFactIds: string[]; recalledSources: Array<{ factId: string; level: RevealLevel }> } {
  const cycle = Number(options.nextVariables.cycleCount ?? 1);
  const beatId = ({ 2: 'cycle-1-familiarity-gap', 3: 'cycle-2-fumi-boundary', 4: 'cycle-3-rescue-assumptions' } as Record<number, string>)[cycle];
  if (!beatId || presentedCycleBeatIds(options.nextVariables).includes(beatId)) return { maintext: '', summary: '', grantedFactIds: [], recalledSources: [] };
  const lines: string[] = [];
  let summary: string;
  const materials = rememberedMaterials(options.nextVariables);
  const grantedFactIds: string[] = [];
  if (cycle === 2) {
    summary = '玩家意识到熟悉生活细节并不能说明文穗的去向，准备寻找有出处的材料；查看物品或核对学校记录仍只是下一步计划。';
    lines.push('你伸手去关闹钟，手指不用看就找到了开关。熟悉的房间让你几乎相信：只要照着平常做，就能找到文穗。',
      '可当你试着回答“她去了哪里”，那些熟悉的生活细节并没有给出答案。你知道怎样与她生活，却还不知道她的去向。',
      materials.length ? `你能抓住的只有已经见过的材料：${materials[0].text}` : '关于去向的材料仍是空白。你想写下她平时上学的路，笔尖停了停，最后只留下一个问号。',
      '你的目光在房门与桌面之间来回。先看她留下的物品，还是去学校问清那份记录的日期？这次，你想带回一个有来处的回答。');
  } else if (cycle === 3) {
    const note = MYSTERY_TRUTH_GRAPH.facts.find(fact => fact.id === FUMI_BOUNDARY_NOTE_ID)?.revelations.clue;
    if (!note) throw new Error('文穗边界便条缺少已编写的公开线索。');
    summary = `玩家读完便条，开始区分文穗自己的话与他人转述；${note}`;
    lines.push('你的手在桌边停住。那张事前留下的便条仍在。这一次，你把她写给你的话从头读完。',
      note,
      '你把纸放平。她要的不是由你代替她做一个更好的决定，而是先把她的话听完。你还不知道这些安排后来怎样了。',
      '你把“她想做什么”写在纸的最上面。下面留一行，准备记她自己说过的话；再留一行，记别人怎样转述她。');
    grantedFactIds.push(FUMI_BOUNDARY_NOTE_ID);
  } else {
    summary = `玩家将已核对与尚未核实的材料分开，重新列出身份、日期、死亡时刻和文穗自己的计划等待核对。${options.previousVariables.deathNews === 'delivered'
      ? '此前警方来电仅是初步通报，不能当作身份或死亡时刻已被确认。'
      : '上一日中断前尚未收到初步通报，不能把想象的电话当作记忆。'}`;
    const consequence = acceptedCycleConsequence(options.previousVariables, options.messages);
    lines.push(consequence ?? '你盯着空白的纸，仍没找到一个可靠的时间点，能告诉你该在何时、何处等到文穗。',
      options.previousVariables.deathNews === 'delivered'
        ? '你记得收到过警方的初步死亡通报。你在“接到电话”与“死亡时刻”之间画了一道箭头，又把它划掉。电话里的疑问，当时并没有得到回答。'
        : '这一次中断前，你尚未收到初步通报。手机还在桌上，你把想象中的那通电话从回忆里放开。',
      '你在纸上分开写下两列：“已经核对”与“尚未核实”。曾经觉得只要赶得够早就能改变一切，可那个“早”，究竟是比哪一刻更早？',
      '你写下“身份”“日期”“死亡时刻”，在每一项旁边留了空。随后另起一行：“她自己的计划，后来怎样了？”',
      ...materials.map(material => `你保留下来的${material.text}`),
      materials.length ? '你一条条写下材料的出处，把不确定的地方圈起来。圈与圈之间，还有没有接上的空隙。' : '“已经核对”一栏仍没有行踪材料。纸上空着，你这次没有急着填满它。',
      '你把笔放下。今天先回到一份原始记录前，问清它的日期与身份；或者顺着她自己的计划，找到下一处可以核对的地方。门外的雨还在等着。');
  }
  const recalled = cycle === 4 ? materials : cycle === 2 ? materials.slice(0, 1) : [];
  return { beatId, grantedFactIds, summary: cycleProse(summary),
    recalledSources: recalled.map(({ factId, level }) => ({ factId, level })),
    maintext: lines.map(line => `对话|旁白|calm|${cycleProse(line)}`).join('\n') };
}
