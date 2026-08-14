import type { NarrativeSceneContract } from '../agents/mystery/types';
import { getCanonicalBackgroundId } from '../data/backgroundAssets';
import { addMinutes, estimateTravel, getLocationBackground, getLocationById } from '../data/locations';
import type { Scene } from '../sillytavern/types';

export interface ActionNarrativeContext {
  locationId: string;
  background: string;
  entryMode: 'exterior' | 'interior' | 'destination';
  requiredNpcIds: string[];
  enRouteNpcIds: string[];
  forbiddenNpcIds: string[];
  presentationMode: 'default' | 'huihui-first' | 'huihui-known' | 'hospital-first' | 'hospital-unknown' | 'hospital-known';
  costs: { timeMinutes?: number; stamina?: number };
  directive: string;
  sceneContract: NarrativeSceneContract;
}

export interface ResolveActionNarrativeContextOptions {
  currentLocationId?: string;
  cycleCount?: number;
  /** 测试或复现用；未传时由输入、时间和地点生成稳定概率。 */
  enRouteEncounterRoll?: number;
  schoolEncounterRoll?: number;
  knowledgeEvents?: unknown;
}

interface DestinationRule {
  locationId: string;
  aliases: RegExp;
}

const DESTINATIONS: DestinationRule[] = [
  { locationId: 'supermarket', aliases: /便利店|便民超市|社区超市/ },
  { locationId: 'community-hospital', aliases: /社区医院|医院/ },
  { locationId: 'school', aliases: /中学|学校|校门|校园|校内|教学楼|操场|体育办公室/ },
  { locationId: 'old-man-building', aliases: /周大爷(?:家|住处|房子)?|周德明(?:家|住处|房子)?|老头楼|麻将馆楼上/ },
  { locationId: 'senpai-building', aliases: /学姐(?:家|住处|房子|楼)?|灯织(?:家|住处|房子)?|商住楼/ },
  { locationId: 'mountain-trail', aliases: /黔灵山脚|山脚步道|山路/ },
  { locationId: 'detective-inn', aliases: /侦探小旅馆|小旅馆|旅馆/ },
  { locationId: 'water-tower', aliases: /废弃水塔|水塔/ },
  { locationId: 'observation-deck', aliases: /废弃观景台|观景台/ },
  { locationId: 'home', aliases: /玩家公寓|自己家|家里|回家|公寓/ },
];

const TRAVEL_INTENT = /(?:去|前往|赶往|赶到|走向|走到|走进|进入|进去|进校|到|到达|抵达|返回|回到|拜访|探访|动身|出发|过去|调查|查看|寻找|去找|找)(?:.{0,16})/;
const NEGATED_TRAVEL = /(?:不|别|不要|取消|放弃)(?:再|打算|准备|想)?(?:去|前往|进入|回到|拜访|调查|查看|寻找)/;
const SCHOOL_INTERIOR = /进(?:入|去)?(?:中学|学校|校内|校园|教学楼|操场|体育办公室)|进校|校内|校园|教学楼|操场|体育办公室|找体育老师|找刘仁光/;
const SCHOOL_EXTERIOR = /校门|门口|学校外|中学外|校外/;

const NPC_SPEAKERS: Record<string, RegExp> = {
  'chen-huihui': /^(?:陈慧慧|chen-huihui|店员|便利店员)$/i,
  'detective-b': /^(?:林静|detective-b|陌生护士|新来的护士)$/i,
  'liu-renguang': /^(?:刘仁光|liu-renguang|体育老师)$/i,
  'school-guard': /^(?:老张|门卫老张|学校门卫|门卫|school-guard)$/i,
  'old-man': /^(?:周德明|周大爷|old-man)$/i,
  touko: /^(?:沈灯织|灯织|灯织学姐|学姐|touko)$/i,
  'detective-a': /^(?:赵刚|detective-a|寸头男人|陌生货车司机|货车司机)$/i,
};

function stableRoll(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function findDestination(input: string): DestinationRule | null {
  if (!TRAVEL_INTENT.test(input) || NEGATED_TRAVEL.test(input)) return null;
  return DESTINATIONS.find(rule => rule.aliases.test(input)) ?? null;
}

function npcPublicLabel(npcId: string): string {
  return ({
    'chen-huihui': '陈慧慧（chen-huihui）',
    'detective-b': '当前以新来普通护士身份工作的林静（detective-b）',
    'liu-renguang': '体育老师刘仁光（liu-renguang）',
    'school-guard': '学校门卫老张（school-guard）',
    'old-man': '周大爷（old-man）',
    touko: '灯织学姐（touko）',
    'detective-a': '当前以货车司机身份活动的寸头男人（detective-a）',
  } as Record<string, string>)[npcId] ?? npcId;
}

/**
 * 将玩家的自然语言决定解析为确定性的目的地契约。
 * 概率事件使用稳定散列，同一次回合重试不会改变结果，也不能靠反复重试刷遭遇。
 */
export function resolveActionNarrativeContext(
  input: string,
  currentTime: Date,
  explicitTimeCostMinutes = 0,
  options: ResolveActionNarrativeContextOptions = {},
): ActionNarrativeContext | null {
  const destinationRule = findDestination(input);
  if (!destinationRule) return null;
  const location = getLocationById(destinationRule.locationId);
  if (!location) return null;

  const currentLocationId = options.currentLocationId ?? 'home';
  const estimate = estimateTravel(currentLocationId, location.id);
  const timeMinutes = explicitTimeCostMinutes > 0
    ? explicitTimeCostMinutes
    : estimate?.timeMinutes ?? 10;
  const arrivalTime = addMinutes(currentTime, timeMinutes);
  const background = getLocationBackground(location, arrivalTime);
  const entryMode = location.id === 'school'
    ? (SCHOOL_INTERIOR.test(input) && !SCHOOL_EXTERIOR.test(input) ? 'interior' : 'exterior')
    : 'destination';

  const requiredNpcIds: string[] = [];
  const forbiddenNpcIds: string[] = [];
  const knowledgeEvents = new Set(Array.isArray(options.knowledgeEvents)
    ? options.knowledgeEvents.filter((event): event is string => typeof event === 'string')
    : []);
  const huihuiKnown = knowledgeEvents.has('meet:chen-huihui');
  const hospitalVisited = knowledgeEvents.has('visit:community-hospital');
  const hospitalNurseKnown = knowledgeEvents.has('identify:lin-jing-name');
  let presentationMode: ActionNarrativeContext['presentationMode'] = 'default';
  if (location.id === 'supermarket') presentationMode = huihuiKnown ? 'huihui-known' : 'huihui-first';
  if (location.id === 'community-hospital') {
    presentationMode = hospitalNurseKnown
      ? 'hospital-known'
      : hospitalVisited ? 'hospital-unknown' : 'hospital-first';
  }
  if (location.id === 'supermarket') requiredNpcIds.push('chen-huihui');
  if (location.id === 'community-hospital') requiredNpcIds.push('detective-b');
  if (location.id === 'old-man-building') requiredNpcIds.push('old-man');
  if (location.id === 'senpai-building') requiredNpcIds.push('touko');
  if (location.id === 'school') {
    requiredNpcIds.push('school-guard');
    if (entryMode === 'exterior') {
      forbiddenNpcIds.push('liu-renguang');
    } else {
      const schoolRoll = options.schoolEncounterRoll ?? stableRoll(
        `school|${options.cycleCount ?? 1}|${currentTime.toISOString()}|${input}`,
      );
      if (schoolRoll < 0.6) requiredNpcIds.push('liu-renguang');
    }
  }

  const isTravel = currentLocationId !== location.id;
  const enRouteRoll = options.enRouteEncounterRoll ?? stableRoll(
    `route|${options.cycleCount ?? 1}|${currentTime.toISOString()}|${currentLocationId}|${location.id}|${input}`,
  );
  const enRouteNpcIds = isTravel && location.id !== 'home' && enRouteRoll < 0.3
    ? ['detective-a']
    : [];

  const destinationNpcText = requiredNpcIds.length > 0
    ? requiredNpcIds.map(npcPublicLabel).join('、')
    : '无强制对话 NPC；不得凭空生成替代角色';
  const enRouteText = enRouteNpcIds.length > 0
    ? `途中必须先在 street 场景遭遇${enRouteNpcIds.map(npcPublicLabel).join('、')}，只能按其公开货车司机身份演绎，不得揭示侦探身份。`
    : '本次途中没有固定人物遭遇，不得为了凑戏凭空添加侦探。';
  const schoolBoundary = location.id === 'school'
    ? (entryMode === 'exterior'
        ? '玩家只到校门/校外，没有进入学校；体育老师刘仁光不得出场。'
        : requiredNpcIds.includes('liu-renguang')
          ? '玩家明确进入学校，本次概率规划命中体育老师刘仁光，他必须实际出场。'
          : '玩家明确进入学校，但本次概率规划未遇到体育老师，不得强行让刘仁光出场。')
    : '';
  const identityFlow = presentationMode === 'huihui-first'
    ? `陈慧慧尚未写入玩家档案。必须按顺序演出：①由内部角色 chen-huihui 说话，但首个显示称呼固定写“店员”；②紧接旁白用玩家既有认知说明“这是附近便利店的店员陈慧慧”，并提到她看起来有些奇怪、总是紧张兮兮或笑得不自然；③该旁白下一行提交“认知|meet:chen-huihui”；④此后她的显示称呼改为“陈慧慧”。这不是临时店员，所有行为仍必须服从 chen-huihui 的人物表演规则。`
    : presentationMode === 'huihui-known'
      ? '玩家已经认识陈慧慧，所有台词直接显示“陈慧慧”，不得退回“店员”或重新提交初见认知。'
      : presentationMode === 'hospital-first'
        ? '玩家第一次见到该角色。由内部角色 detective-b 说话，但显示称呼固定写“新来的护士”；随后旁白从玩家视角说明：小地方的医院护士大多面熟，这张漂亮却陌生的脸若见过一定会有印象，因此大概是新来的护士。不要写出林静姓名，不要提交任何关于她的认知事件，也不要建立角色档案。'
        : presentationMode === 'hospital-unknown'
          ? '玩家仍不知道该护士姓名，显示称呼继续使用“新来的护士”；不得写出林静姓名，也不得提交她的姓名、职业或人物档案认知事件。'
          : presentationMode === 'hospital-known'
            ? '玩家已经通过其他可靠证据知道她叫林静，可以显示“林静”，但仍不得揭露侦探身份。'
            : '';
  const directive = `[确定性场景契约]
语义解析结果：玩家正在前往 ${location.name}（${location.id}），抵达背景固定为 ${background}，进入模式为 ${entryMode}。
目的地必须实际出场并参与剧情的 NPC：${destinationNpcText}。
${enRouteText}
${schoolBoundary}
${identityFlow}
导演 beats 必须明确写出目的地 locationId=${location.id}，并把上述强制 NPC 的内部 ID 放进 speakerIds；写手必须逐条服从对应 characterPerformances。
职业称呼只允许按上述初见流程作为固定角色的玩家可见称呼，不能据此生成临时 NPC；玩家尚未确认隐藏身份时，只经营其公开职业，不得提前揭露侦探身份。
[/确定性场景契约]`;

  const requiredKnowledgeEvents = presentationMode === 'huihui-first'
    ? [{
        eventId: 'meet:chen-huihui',
        evidence: '陈慧慧先以“店员”身份说话；随后玩家旁白认出她是附近便利店店员陈慧慧，并回想她总显得奇怪、紧张而笑得不自然。',
      }]
    : [];
  const forbiddenKnowledgeEventIds = presentationMode === 'hospital-first' || presentationMode === 'hospital-unknown'
    ? ['observe:unknown-woman', 'identify:lin-jing-name', 'learn:lin-jing-job', 'insight:lin-jing-composure', 'learn:zhao-lin-connection']
    : [];

  const sceneContract: NarrativeSceneContract = {
    destinationLocationId: location.id,
    destinationBackground: background,
    entryMode,
    requiredDestinationNpcIds: requiredNpcIds,
    requiredEnRouteNpcIds: enRouteNpcIds,
    forbiddenNpcIds,
    requiredKnowledgeEvents,
    forbiddenKnowledgeEventIds,
    directive,
  };

  return {
    locationId: location.id,
    background,
    entryMode,
    requiredNpcIds,
    enRouteNpcIds,
    forbiddenNpcIds,
    presentationMode,
    costs: {
      timeMinutes,
      stamina: explicitTimeCostMinutes > 0 ? undefined : estimate?.staminaCost,
    },
    directive,
    sceneContract,
  };
}

export function actionNarrativeContextError(
  context: ActionNarrativeContext | null,
  scene: Pick<Scene, 'lines'>,
): string | null {
  if (!context) return null;
  const speakers = scene.lines.map(line => line.speaker.trim());
  const destinationBackground = getCanonicalBackgroundId(context.background);
  const destinationIndex = scene.lines.findIndex(line => (
    !!line.background && getCanonicalBackgroundId(line.background) === destinationBackground
  ));
  if (destinationIndex < 0) {
    return `正文没有实际切换到目的地场景 ${context.locationId}（${context.background}）。`;
  }
  const requiredNpcIds = [...context.enRouteNpcIds, ...context.requiredNpcIds];
  const missing = requiredNpcIds.filter(npcId => {
    const pattern = NPC_SPEAKERS[npcId];
    return !pattern || !speakers.some(speaker => pattern.test(speaker));
  });
  if (missing.length > 0) {
    return `场景契约缺少必须实际出场的 NPC：${missing.join('、')}。角色立绘不能代替正文说话者身份。`;
  }
  if (context.enRouteNpcIds.length > 0) {
    const encounterIndex = scene.lines.findIndex(line => (
      context.enRouteNpcIds.some(npcId => NPC_SPEAKERS[npcId]?.test(line.speaker.trim()))
    ));
    const encounterBackground = encounterIndex >= 0 ? scene.lines[encounterIndex].background : undefined;
    if (encounterIndex < 0 || encounterIndex >= destinationIndex
      || !encounterBackground || getCanonicalBackgroundId(encounterBackground) !== 'street') {
      return '途中概率遭遇必须先在 street 场景完整发生，然后才能抵达目的地。';
    }
  }
  const forbidden = context.forbiddenNpcIds.filter(npcId => {
    const pattern = NPC_SPEAKERS[npcId];
    return pattern && speakers.some(speaker => pattern.test(speaker));
  });
  if (forbidden.length > 0) {
    return `场景契约禁止当前未满足进入条件的 NPC 出场：${forbidden.join('、')}。`;
  }
  if (context.requiredNpcIds.includes('chen-huihui')) {
    const performanceText = scene.lines.map(line => line.text).join('');
    const hasHuihuiPerformance = /汗|笑容|僵住|僵硬|吃、?吃|磕绊|局促|紧张|([一-鿿])、\1/u.test(performanceText);
    if (!hasHuihuiPerformance) {
      return '陈慧慧虽然被点名，但正文仍缺少她的结巴、僵笑、出汗、局促或“吃吃”笑等实际人物表演。';
    }
  }
  if (context.presentationMode === 'huihui-first') {
    const clerkIndex = scene.lines.findIndex(line => /^(?:店员|便利店员)$/.test(line.speaker.trim()));
    if (clerkIndex < destinationIndex) return '陈慧慧初见必须先以“店员”称呼实际说话，不能一登场就提前实名。';
    const introIndex = scene.lines.findIndex((line, index) => (
      index > clerkIndex
      && /^(?:旁白|narration)$/i.test(line.speaker.trim())
      && /陈慧慧/.test(line.text)
      && /(?:附近|社区).{0,8}便利店|便利店.{0,8}店员/.test(line.text)
      && /奇怪|紧张|不自然|僵硬|汗/.test(line.text)
      && line.knowledgeEvents?.includes('meet:chen-huihui')
    ));
    if (introIndex < 0) return '“店员”说话后，必须由玩家视角旁白认出陈慧慧、概括她的紧张怪异印象，并紧接提交 meet:chen-huihui。';
    if (!scene.lines.slice(introIndex + 1).some(line => /^陈慧慧$/.test(line.speaker.trim()))) {
      return '提交 meet:chen-huihui 后，后续对话的显示称呼必须从“店员”更新为“陈慧慧”。';
    }
  }
  if (context.presentationMode === 'huihui-known' && speakers.some(speaker => /^(?:店员|便利店员)$/.test(speaker))) {
    return '玩家已经认识陈慧慧，便利店对话不得再退回无名“店员”称呼。';
  }
  if (context.presentationMode === 'hospital-first') {
    const nurseIndex = scene.lines.findIndex(line => /^新来的护士$/.test(line.speaker.trim()));
    if (nurseIndex < destinationIndex) return '医院初见必须先由“新来的护士”说话，不能提前显示姓名或使用泛称“护士”。';
    const introIndex = scene.lines.findIndex((line, index) => index > nurseIndex
      && /^(?:旁白|narration)$/i.test(line.speaker.trim())
      && /小地方|社区医院|这家医院/.test(line.text)
      && /面熟|见过|印象/.test(line.text)
      && /漂亮|好看/.test(line.text)
      && /陌生|新来/.test(line.text));
    if (introIndex < 0) return '“新来的护士”说话后，必须用玩家视角旁白说明本地护士大多面熟、她漂亮却陌生，因此推测是新来的。';
  }
  if (context.presentationMode === 'hospital-first' || context.presentationMode === 'hospital-unknown') {
    const forbiddenKnowledge = new Set(context.sceneContract.forbiddenKnowledgeEventIds);
    if (scene.lines.some(line => line.knowledgeEvents?.some(eventId => forbiddenKnowledge.has(eventId)))) {
      return '玩家尚不知道新护士的姓名，本场不得更新她的事实或角色档案。';
    }
    if (speakers.some(speaker => /^(?:林静|detective-b|陌生护士|护士)$/.test(speaker))) {
      return '玩家尚不知道她的姓名，当前显示称呼只能使用“新来的护士”。';
    }
  }
  return null;
}
