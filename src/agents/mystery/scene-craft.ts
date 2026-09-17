import type { CharacterPerformanceProfile } from '../../data/characterPerformance';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';
import type { DirectorBeat, DirectorPlan } from './types';

export const SCENE_CRAFT_FOCUSES = [
  'dialogue-response', 'evidence-focus', 'action-process', 'scene-transition', 'quiet-interval', 'present-moment',
] as const;
export type SceneCraftFocus = typeof SCENE_CRAFT_FOCUSES[number];
export const SCENE_READER_EFFECTS = [
  'uncertainty-to-focus', 'restrained-friction', 'care-with-boundary', 'breathing-space', 'open-question',
] as const;
export type SceneReaderEffect = typeof SCENE_READER_EFFECTS[number];

/** A stylistic proposal, never a channel for free-form facts or character psychology. */
export interface SceneCraftIntent {
  focus: SceneCraftFocus;
  beatIds: string[];
  readerEffect?: SceneReaderEffect;
}

/** Program-selected writing advice, excluded from assertion sources and state authority. */
export interface SceneCraftGuidance {
  authority: 'writing-only';
  focus: SceneCraftFocus;
  readerEffect: SceneReaderEffect;
  beatIds: string[];
  characterIds: string[];
  goal: string;
  approach: string;
  examples: string[];
}

export function parseSceneCraftIntent(value: unknown, beats: readonly DirectorBeat[]): SceneCraftIntent | undefined {
  if (value === undefined) return undefined;
  const item = value as Partial<SceneCraftIntent>;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => key !== 'focus' && key !== 'beatIds' && key !== 'readerEffect')
    || !SCENE_CRAFT_FOCUSES.includes(item.focus as SceneCraftFocus)
    || (item.readerEffect !== undefined && !SCENE_READER_EFFECTS.includes(item.readerEffect))
    || !Array.isArray(item.beatIds) || item.beatIds.length < 1 || item.beatIds.length > 3
    || new Set(item.beatIds).size !== item.beatIds.length
    || item.beatIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 80
      || beats.filter(beat => beat.id === id).length !== 1)) {
    throw new Error('sceneCraft 只允许 focus、可选 readerEffect 枚举及一至三个唯一、已存在的 beatIds；不得自拟目标、示例、事实或心理。');
  }
  return { focus: item.focus as SceneCraftFocus, beatIds: [...item.beatIds],
    ...(item.readerEffect ? { readerEffect: item.readerEffect } : {}) };
}

const READER_EFFECTS: Record<SceneReaderEffect, { goal: string; approach: string; example: string }> = {
  'uncertainty-to-focus': {
    goal: '让读者的注意从散开的疑问收拢到眼前一处可核实的重点，读完这一场得到一点清晰。',
    approach: '让取景由已有的整体范围落到一个获准细节，句子在这里稍作停留，再接具体行动。',
    example: '聚焦写法：你把【当前问题】重新看了一遍，目光停在【获准的一点】。下一句只写这一点，让读者跟着看清。',
  },
  'restrained-friction': {
    goal: '让已批准问答中的压力逐句可感，保持克制，把张力留在双方正在谈的具体问题上。',
    approach: '只承接节拍已有的分歧或追问，用更具体的问句、长短相接的答句和短暂留白形成张力；每个反应仍按角色规则，不附加秘密或心态解释。',
    example: '张力写法：“这一点呢？”你把问题留在原处。等现有答复落定，再接下一句。读者从接话间距感到压力。',
  },
  'care-with-boundary': {
    goal: '让日常关照有温度，也给各自表达留出空间；读者从眼前的言行感到温和而清楚的距离。',
    approach: '只采用 characterPerformances 已允许的关照方式，让它与本次真实问答相接；把选择留在人物和玩家实际说出、做出的部分，不宣告关系改变。',
    example: '分寸写法：“你先说。”一句角色获准的关照，让对方已有的回答完整落下。接下来怎样做，仍留在可选的行动里。',
  },
  'breathing-space': {
    goal: '给场景一小段可以呼吸的留白，让动作之间的距离和时间的流动被读者感到。',
    approach: '收住解释，用一个当前已有的普通动作承接前句；概述之后留一个短句，下一段从实际到达的时刻继续。',
    example: '留白写法：写到【本次实际停留的位置】，句子也收住。一个已有的动作接过去，再让后面的事开始。',
  },
  'open-question': {
    goal: '让本次有限进展留下余味，读者带着一处清楚的未决问题走向下一步。',
    approach: '将已有进展写实，结尾轻轻停在获准范围内尚待继续的位置；保留不确定性的原有边界，已确认的结论仍然成立。',
    example: '余味写法：【已经做到的部分】写到这里便停住。下一句把【仍待继续的一点】留在原位，读者知道可以从哪一步接下去。',
  },
};

const CRAFT: Record<SceneCraftFocus, Pick<SceneCraftGuidance, 'goal' | 'approach' | 'examples'>> = {
  'dialogue-response': {
    goal: '让这次问答真正接住玩家的问题：回应之后，问题的范围或下一步行动有一处清楚的变化。',
    approach: '从所选节拍里已有的问题进入，把获准答复落在角色自己的措辞与一个有作用的动作上；按 characterPerformances 保留各人的语气。',
    examples: [
      '接话写法：“你问的是哪一段？”你把问题缩窄，再听对方回答。问句与答句咬住同一个对象。',
      '收束写法：答复落下，你把注意力转向【获准的下一步行动】。接下来的问句从这里继续，只承接已经回答的部分与获准选项。',
    ],
  },
  'evidence-focus': {
    goal: '让玩家通过一次具体的看、听或核对接触获准材料，同时看清这份材料能够说明的范围。',
    approach: '材料的事实措辞和限定保持原样，叙事变化放在玩家如何接触、停留、转向下一步上；让获准信息本身承担分量。',
    examples: [
      '落点写法：你停在【获准事实原文】这一处，再看向眼前要核对的部分。重心落在已经给出的材料上。',
      '限定写法：你把【材料已经说明的部分】与【仍未核实的部分】分开，接着做计划中已允许的下一步。两处都只填已有授权内容。',
    ],
  },
  'action-process': {
    goal: '把实际执行的工作写出推进感：挑出一个关键片段，用简洁过程概述连接它与本次确实做到的位置。',
    approach: '采用“着手—过程中的重点—当前进度”的节奏；长行动压缩重复劳动，保留关键问答或操作，下一段承接这一段已完成的部分。',
    examples: [
      '压缩写法：你按【获准的工作范围】逐项核对。叙述略过重复步骤，在【计划已有的关键动作】处停下来写。',
      '进度写法：先写这一次怎样着手，再写现在做到哪里；中间用一句具体的过程概述连接。内容与耗时只取本次实际执行段。',
    ],
  },
  'scene-transition': {
    goal: '让这段实际发生的路程成为清楚的场景转换，落点准确停在本次走到的位置。',
    approach: '以离开、在途或抵达中的实际阶段组织短段落，用移动连接前后场景；是否抵达只服从 resolvedAction。',
    examples: [
      '在途写法：你继续往前走。这一段以脚步和当前位置收束，下一处地点仍留在前方。只用于尚未抵达的路程。',
      '抵达写法：走到【本次确实抵达的位置】，你停下脚步。地点转换到此落定，后续工作只在实际执行时续写。',
    ],
  },
  'quiet-interval': {
    goal: '让等待或休息有一个可感知的停留，随后自然回到本次实际结束的时刻。',
    approach: '留住一个当下已有的动作，用简短概述承接余下时间；实际到来的事件单独落笔，让安静本身保有节奏。',
    examples: [
      '停留写法：你暂时停下手里的事。写一个当前已有的普通动作，然后让句子留一点空隙。',
      '时间写法：用一句概述带过本次等待，再从实际到来的事件或结束时刻接回现场；无需逐分钟重复同一动作。',
    ],
  },
  'present-moment': {
    goal: '把本回合已经发生的一件事写清楚，让玩家从眼前的动作或话语自然接到下一次选择。',
    approach: '贴近玩家当前能看见、听见和正在做的事；选一个已有的重点展开，让句末落回当下可执行的行动。',
    examples: [
      '视点写法：先写眼前已经发生的动作，再写玩家怎样接住它。两句各推进一步，不重复解释同一个意思。',
      '衔接写法：从这一刻实际结束的位置接下去，把下一步留给玩家。句子可以收住，不必替场景另添一个谜底。',
    ],
  },
};

const WORK_KINDS = new Set(['inquiry', 'investigation', 'search']);

export function buildSceneCraftGuidance(
  plan: DirectorPlan,
  profiles: readonly CharacterPerformanceProfile[],
  resolution?: ResolvedActionOutcome,
): SceneCraftGuidance {
  const intent = parseSceneCraftIntent(plan.sceneCraft, plan.beats);
  const segments = resolution?.segments.filter(segment => segment.executedMinutes > 0) ?? [];
  const work = segments.filter(segment => WORK_KINDS.has(segment.step.kind));
  const travel = segments.filter(segment => segment.step.kind === 'travel');
  const workLocations = new Set(work.map(segment => segment.step.locationId));
  const profileIds = new Set(profiles.map(profile => profile.id));
  const safeBeats = plan.beats.filter(beat => !resolution || !beat.locationId
    || workLocations.has(beat.locationId) || (beat.locationId === 'street' && travel.length > 0));
  const cast = (beats: readonly DirectorBeat[]) => [...new Set(beats.flatMap(beat => beat.speakerIds ?? [])
    .filter(id => profileIds.has(id)))];
  const partialWork = work.some(segment => !segment.completed);
  // Reprojection drops the intent; this guard also makes direct legacy builder calls safe.
  const useIntent = intent && (!resolution || (work.length > 0 && !partialWork));
  const requestedBeats = useIntent ? safeBeats.filter(beat => intent.beatIds.includes(beat.id)) : [];
  const candidates = requestedBeats.length ? requestedBeats : safeBeats;
  const hasWork = resolution ? work.length > 0 : (plan.actionSteps ?? []).some(step => WORK_KINDS.has(step.kind));
  const hasTravel = resolution ? travel.length > 0
    : plan.actionSteps?.some(step => step.kind === 'travel') || candidates.some(beat => beat.locationId === 'street');
  const quiet = resolution ? segments.some(segment => segment.step.kind === 'rest' || segment.step.kind === 'wait')
    : plan.actionSteps?.some(step => step.kind === 'rest' || step.kind === 'wait');
  const allowed: Record<SceneCraftFocus, boolean> = {
    'dialogue-response': cast(candidates).length > 0 && (!resolution || work.some(segment => segment.step.kind === 'inquiry')) && !partialWork,
    'evidence-focus': plan.revelations.length > 0 && (!resolution || work.some(segment => segment.completed)) && !partialWork,
    'action-process': hasWork,
    'scene-transition': !!hasTravel && !hasWork,
    'quiet-interval': !!quiet && !hasWork,
    'present-moment': true,
  };
  const priorities: SceneCraftFocus[] = partialWork
    ? ['action-process', 'present-moment']
    : ['evidence-focus', 'dialogue-response', 'action-process', 'scene-transition', 'quiet-interval', 'present-moment'];
  const focus = useIntent && requestedBeats.length && allowed[intent.focus]
    ? intent.focus : priorities.find(candidate => allowed[candidate])!;
  const selected = (focus === 'dialogue-response'
    ? candidates.filter(beat => cast([beat]).length > 0) : candidates).slice(0, 3);
  const guide = CRAFT[focus];
  let examples = [...guide.examples];
  let goal = guide.goal;
  if (focus === 'scene-transition' && resolution) {
    if (travel.some(segment => !segment.completed)) {
      goal = '把本次实际走过的路程写成连贯的在途片段，收束时仍停在途中。';
      examples = [guide.examples[0], '续行写法：用一句话连起已走过的这一段，再从当前脚步接下去。目的地只作为行进方向，不提前写接待或调查。'];
    } else {
      goal = '把实际完成的路程写出离开与抵达的连接，收束在本次确实到达的位置。';
      examples = [guide.examples[1], '落点写法：从移动中的句子，接到抵达时的一个普通动作。路程到此完成，尚未执行的工作留给下一步。'];
    }
  }
  const characterIds = resolution && work.length === 0 ? [] : cast(selected);
  const presentProfiles = profiles.filter(profile => characterIds.includes(profile.id));
  // These are positive affordances already in the public performance rules, not inferred relationships.
  const careAllowed = focus === 'dialogue-response' && presentProfiles.some(profile => (
    [...profile.actionRules, ...profile.reactionRules].some(rule => /关心|照顾|照看|实际帮助/.test(rule))
    && !profile.forbiddenPortrayals.some(rule => /(?:不得|禁止|不能|不应)(?:主动|表现|表达|提供)?(?:关心|照顾|温柔|善意|帮助)/.test(rule))
  ));
  const approvedPressure = [plan.tone, ...selected.flatMap(beat => [beat.purpose, beat.description])]
    .some(text => /紧张|分歧|质问|争执|追问|质疑/.test(text));
  const frictionAllowed = focus === 'dialogue-response' && characterIds.length > 0 && approvedPressure
    && !presentProfiles.some(profile => profile.forbiddenPortrayals.some(rule => /(?:不得|禁止|不能)(?:制造|表现|安排)?(?:冲突|争执|紧张|对抗)/.test(rule)));
  const effectAllowed: Record<SceneReaderEffect, boolean> = {
    'uncertainty-to-focus': true,
    'restrained-friction': frictionAllowed,
    'care-with-boundary': careAllowed,
    'breathing-space': ['scene-transition', 'quiet-interval', 'present-moment'].includes(focus),
    'open-question': !plan.revelations.some(fact => fact.level === 'confirmation'),
  };
  const preferredEffect: SceneReaderEffect = partialWork ? 'open-question'
    : focus === 'scene-transition' || focus === 'quiet-interval' ? 'breathing-space'
      : frictionAllowed ? 'restrained-friction' : careAllowed ? 'care-with-boundary'
        : focus === 'present-moment' && effectAllowed['open-question'] ? 'open-question' : 'uncertainty-to-focus';
  const defaultEffect = effectAllowed[preferredEffect] ? preferredEffect : 'uncertainty-to-focus';
  const requestedEffect = useIntent && requestedBeats.length ? intent.readerEffect : undefined;
  const readerEffect = requestedEffect && effectAllowed[requestedEffect] ? requestedEffect : defaultEffect;
  const effect = READER_EFFECTS[readerEffect];
  const executionGoal = partialWork ? '把这次实际执行的有限工作写出推进感，清楚落在中断时已做到的位置，保留尚未核实的部分。' : goal;
  return {
    authority: 'writing-only', focus, readerEffect, beatIds: selected.map(beat => beat.id), characterIds,
    goal: `${effect.goal}${executionGoal}`,
    approach: `${effect.approach}${guide.approach}`,
    examples: [effect.example, examples[0]],
  };
}
