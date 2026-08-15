import { DEFAULT_LOCATION_ID, gameLocations, getLocationById, type LocationIconKey } from './locations';

export const LOCATION_KNOWLEDGE_STAGES = ['hidden', 'rumored', 'located', 'visited'] as const;
export type LocationKnowledgeStage = (typeof LOCATION_KNOWLEDGE_STAGES)[number];

export const PLAYER_KNOWLEDGE_EVENTS = [
  'know:home',
  'know:school',
  'know:supermarket',
  'meet:touko',
  'meet:old-man',
  'meet:chen-huihui',
  'meet:liu-renguang',
  'find:water-tower-fragment',
  'locate:water-tower-route',
  'observe:shaved-man',
  'follow:shaved-man-to-inn',
  'identify:zhao-gang',
  'identify:zhao-gang-name',
  'learn:zhao-gang-job',
  'insight:zhao-gang-reckless',
  'observe:unknown-woman',
  'identify:lin-jing',
  'identify:lin-jing-name',
  'learn:lin-jing-job',
  'insight:lin-jing-composure',
  'learn:zhao-lin-connection',
  'insight:touko-protective',
  'insight:old-man-neighborhood',
  'insight:chen-huihui-social-strain',
  'insight:chen-huihui-hypoglycemia',
  'insight:liu-renguang-boundaries',
  'find:medical-record',
  'hear:accident-site',
  'locate:observation-deck',
] as const;

export type PlayerKnowledgeEvent = (typeof PLAYER_KNOWLEDGE_EVENTS)[number] | `visit:${string}`;

export const CHARACTER_KNOWLEDGE_STAGES = ['observed', 'identified', 'public-known', 'familiar', 'understood'] as const;
export type CharacterKnowledgeStage = (typeof CHARACTER_KNOWLEDGE_STAGES)[number];
export type KnowledgeDiscoveryKind = 'introduction' | 'identity' | 'public-fact' | 'personal-fact' | 'behavior' | 'relationship' | 'location';

export interface LocationPresentation {
  id: string;
  stage: LocationKnowledgeStage;
  name: string;
  shortName: string;
  signal: string;
  description: string;
  icon: LocationIconKey;
  x: number;
  y: number;
  canTravel: boolean;
}

export interface PlayerEntityPresentation {
  id: string;
  stage: CharacterKnowledgeStage;
  displayName: string;
  subtitle: string;
  profile: string;
  portrait: string;
  facts: string[];
}

export interface KnowledgeVisualUpdate {
  id: string;
  kind: 'character-new' | 'character-updated' | 'location-rumored' | 'location-located' | 'location-visited';
  target: 'characters' | 'map';
  eyebrow: string;
  title: string;
  description: string;
  portrait?: string;
}

export interface PlayerKnowledgeBrief {
  locations: Array<Pick<LocationPresentation, 'id' | 'stage' | 'name' | 'canTravel'>>;
  entities: PlayerEntityPresentation[];
  namingRules: string[];
  allowedDiscoveries: Array<{
    eventId: PlayerKnowledgeEvent;
    kind: KnowledgeDiscoveryKind;
    subjectId?: string;
    meaning: string;
    evidenceStandard: string;
  }>;
}

const INITIAL_EVENTS: PlayerKnowledgeEvent[] = ['know:home', 'know:school', 'know:supermarket'];
const knownEventIds = new Set<string>(PLAYER_KNOWLEDGE_EVENTS);
const LEGACY_EVENT_EXPANSIONS: Record<string, PlayerKnowledgeEvent[]> = {
  'identify:zhao-gang': ['identify:zhao-gang-name', 'learn:zhao-gang-job'],
  'identify:lin-jing': ['identify:lin-jing-name', 'learn:lin-jing-job'],
};
const IMPLIED_EVENTS: Partial<Record<PlayerKnowledgeEvent, PlayerKnowledgeEvent[]>> = {
  'identify:zhao-gang-name': ['observe:shaved-man'],
  'learn:zhao-gang-job': ['observe:shaved-man'],
  'identify:lin-jing-name': ['observe:unknown-woman'],
  'learn:lin-jing-job': ['observe:unknown-woman'],
};

type StagePresentation = Omit<LocationPresentation, 'id' | 'stage' | 'icon' | 'x' | 'y' | 'canTravel'>;
type LocationKnowledgeRule = Partial<Record<Exclude<LocationKnowledgeStage, 'hidden'>, StagePresentation>> & {
  stage(events: Set<string>): LocationKnowledgeStage;
};

const rules: Record<string, LocationKnowledgeRule> = {
  home: {
    stage: () => 'located',
    located: { name: '玩家公寓', shortName: '公寓', signal: 'HOME', description: '你与文穗居住的公寓，也是今天调查开始的地方。' },
    visited: { name: '玩家公寓', shortName: '公寓', signal: 'HOME', description: '你与文穗居住的公寓。她留下的早餐、房间与药瓶仍有许多疑点。' },
  },
  school: {
    stage: () => 'located',
    located: { name: '文穗的中学', shortName: '中学', signal: 'SCHOOL', description: '文穗平日上学的地方。可以确认她今天是否到校。' },
    visited: { name: '文穗的中学', shortName: '中学', signal: 'SCHOOL', description: '门卫、请假记录与同学的证词可能还原文穗今天的行踪。' },
  },
  supermarket: {
    stage: () => 'located',
    located: { name: '社区便利店', shortName: '便利店', signal: 'STORE', description: '你们常去的二十四小时便利店。店员或许见过文穗。' },
    visited: { name: '社区便利店', shortName: '便利店', signal: 'STORE', description: '小票、店员证词与监控可以拼出文穗早晨的一段行踪。' },
  },
  'senpai-building': {
    stage: events => events.has('meet:touko') ? 'located' : 'hidden',
    located: { name: '灯织住的商住楼', shortName: '灯织住处', signal: 'TOUKO', description: '灯织告诉了你她的住处。楼下是一间营业到很晚的咖啡厅。' },
    visited: { name: '灯织住的商住楼', shortName: '灯织住处', signal: 'TOUKO', description: '灯织居住的高档商住楼，隔着雨幕正对你的公寓。' },
  },
  'old-man-building': {
    stage: events => events.has('meet:old-man') ? 'located' : 'hidden',
    located: { name: '周大爷住的旧楼', shortName: '周大爷住处', signal: 'ZHOU', description: '周大爷住在麻将馆楼上的旧居民楼。' },
    visited: { name: '周大爷住的旧楼', shortName: '周大爷住处', signal: 'ZHOU', description: '底层开着麻将馆的旧居民楼。周大爷的房间在暴雨天也常亮着灯。' },
  },
  'mountain-trail': {
    stage: events => events.has('locate:water-tower-route') ? 'located' : events.has('find:water-tower-fragment') ? 'rumored' : 'hidden',
    rumored: { name: '通往山里的旧步道？', shortName: '山路？', signal: 'UNKNOWN', description: '纸页上的残缺路线似乎指向北侧山林，但入口还不能确定。' },
    located: { name: '黔灵山脚步道', shortName: '山脚步道', signal: 'TRAIL', description: '你已确认这条湿滑石阶通向纸页所画的山林区域。' },
    visited: { name: '黔灵山脚步道', shortName: '山脚步道', signal: 'TRAIL', description: '通向水塔与山腰的湿滑石阶。雨越大，山路越危险。' },
  },
  'detective-inn': {
    stage: events => events.has('follow:shaved-man-to-inn') ? 'located' : 'hidden',
    located: { name: '黔灵旅社', shortName: '黔灵旅社', signal: 'QIANLING INN', description: '你跟随那个寸头男人，确认他进入了这家陈旧旅社。' },
    visited: { name: '黔灵旅社', shortName: '黔灵旅社', signal: 'QIANLING INN', description: '陈旧的小旅社。老板娘记得住客的伤口与来访者，但你仍需查清他们的身份。' },
  },
  'water-tower': {
    stage: events => events.has('locate:water-tower-route') ? 'located' : events.has('find:water-tower-fragment') ? 'rumored' : 'hidden',
    rumored: { name: '山中的旧设施？', shortName: '旧设施？', signal: 'UNKNOWN', description: '文穗留下的残页指向山里某处废弃设施，准确位置尚不明确。' },
    located: { name: '废弃水塔', shortName: '水塔', signal: 'WATER TOWER', description: '路线与地标已经对应上了：北侧山林中有一座废弃水塔。' },
    visited: { name: '废弃水塔', shortName: '水塔', signal: 'WATER TOWER', description: '文穗把这里当作秘密据点；水塔内部留下了比残页更完整的记录。' },
  },
  'community-hospital': {
    stage: events => events.has('find:medical-record') ? 'located' : 'hidden',
    located: { name: '药单上的社区医院', shortName: '社区医院', signal: 'HOSPITAL', description: '药瓶或就诊记录把你指向了这家社区医院。' },
    visited: { name: '社区医院', shortName: '社区医院', signal: 'HOSPITAL', description: '白光彻夜不熄。值班记录保存着一段你记不清的就诊历史。' },
  },
  'observation-deck': {
    stage: events => events.has('locate:observation-deck') ? 'located' : events.has('hear:accident-site') ? 'rumored' : 'hidden',
    rumored: { name: '疑似事故区域', shortName: '事故区域？', signal: 'UNKNOWN', description: '有人提到山腰发生过事故，但具体地点还没有确定。' },
    located: { name: '废弃观景台', shortName: '观景台', signal: 'OBSERVATION', description: '证词与路线指向山腰尽头的一座废弃观景台。' },
    visited: { name: '废弃观景台', shortName: '观景台', signal: 'OBSERVATION', description: '锈栏之外是被雨幕遮住的陡坡。现场痕迹可能推翻此前的猜测。' },
  },
};

const clueEventMap: Record<string, PlayerKnowledgeEvent[]> = {
  'water-tower-fragment': ['find:water-tower-fragment'],
  'water-tower-route': ['find:water-tower-fragment', 'locate:water-tower-route'],
  'shared-detective-tail': ['observe:shaved-man'],
  'detective-inn-address': ['observe:shaved-man', 'follow:shaved-man-to-inn'],
  'medical-record': ['find:medical-record'],
  'accident-site': ['hear:accident-site'],
  'observation-deck-route': ['hear:accident-site', 'locate:observation-deck'],
};

const discoveryRules: Array<{
  eventId: Exclude<PlayerKnowledgeEvent, `visit:${string}`>;
  kind: KnowledgeDiscoveryKind;
  subjectId?: string;
  meaning: string;
  evidenceStandard: string;
  requires?: PlayerKnowledgeEvent[];
  locations?: string[];
}> = [
  { eventId: 'meet:chen-huihui', kind: 'introduction', subjectId: 'chen-huihui', meaning: '玩家认出附近便利店店员陈慧慧，并回想起她平时看起来有些奇怪、总是紧张兮兮且笑得不自然；登记姓名、公开工作与这层既有印象。', evidenceStandard: '陈慧慧必须先以“店员”身份实际说话，随后旁白明确写出玩家认得她是附近便利店的陈慧慧，并概括既有的紧张怪异印象。', locations: ['supermarket'] },
  { eventId: 'insight:chen-huihui-social-strain', kind: 'behavior', subjectId: 'chen-huihui', meaning: '玩家认识到陈慧慧努力维持热情时会紧张，待人方式有些笨拙。', evidenceStandard: '正文必须呈现一次足够明确的失态，或明确概括此前至少两次一致的互动表现；不能仅凭外貌和第一印象。', requires: ['meet:chen-huihui'], locations: ['supermarket'] },
  { eventId: 'insight:chen-huihui-hypoglycemia', kind: 'personal-fact', subjectId: 'chen-huihui', meaning: '确认陈慧慧有低血糖；她总拿在手里的“文件夹”其实是大号巧克力。', evidenceStandard: '本事件只可绑定陈慧慧极少出现的愤怒演出：愤怒动作完整播放后，她必须当场打开或咬下手中物品、明确说明低血糖与大号巧克力，并亲口吐槽“我一个收银员拿文件夹做什么？”随后才能提交认知。', requires: ['meet:chen-huihui'], locations: ['supermarket'] },
  { eventId: 'meet:liu-renguang', kind: 'introduction', subjectId: 'liu-renguang', meaning: '确认刘仁光是文穗学校的体育老师；只登记公开身份。', evidenceStandard: '本人说明、教职工信息、课程记录或校方可靠介绍。', locations: ['school'] },
  { eventId: 'insight:liu-renguang-boundaries', kind: 'behavior', subjectId: 'liu-renguang', meaning: '玩家观察到刘仁光与人接触时缺乏应有的分寸。', evidenceStandard: '正文必须呈现具体越界言行，或由两个相互独立的可靠观察相互印证；不能把案件嫌疑当作性格证据。', requires: ['meet:liu-renguang'], locations: ['school'] },
  { eventId: 'meet:touko', kind: 'introduction', subjectId: 'touko', meaning: '灯织本人出场、来电或被可靠介绍；确认“灯织学姐”的称呼和住处。', evidenceStandard: '本人可识别的出场、来电，或可靠人物明确介绍。', locations: ['home', 'school', 'supermarket'] },
  { eventId: 'insight:touko-protective', kind: 'behavior', subjectId: 'touko', meaning: '玩家认识到灯织的关心带有居高临下的保护与谈话控制。', evidenceStandard: '正文必须呈现她纠正问题、转移焦点或代替玩家作决定的具体行为，并与关心玩家同时成立。', requires: ['meet:touko'] },
  { eventId: 'meet:old-man', kind: 'introduction', subjectId: 'old-man', meaning: '确认周大爷是附近独居的退休老人，并得知住处。', evidenceStandard: '本人交谈、自我介绍或可靠街坊介绍。', locations: ['home', 'school', 'supermarket'] },
  { eventId: 'insight:old-man-neighborhood', kind: 'behavior', subjectId: 'old-man', meaning: '玩家确认周大爷熟悉附近居民与日常动静。', evidenceStandard: '他准确说出至少一项可由现场、邻居或既有事实验证的街坊信息。', requires: ['meet:old-man'], locations: ['old-man-building'] },
  { eventId: 'find:water-tower-fragment', kind: 'location', meaning: '玩家获得文穗留下的残页、草图或等价证据，只形成“山中旧设施”的传闻。', evidenceStandard: '玩家实际取得或看到残页、草图或等价物证。', locations: ['home', 'school'] },
  { eventId: 'locate:water-tower-route', kind: 'location', meaning: '玩家用路线、地标或可靠证词确认山脚入口与废弃水塔坐标。', evidenceStandard: '路线与现实地标对应，或有可核验的明确地址证词。', requires: ['find:water-tower-fragment'] },
  { eventId: 'observe:shaved-man', kind: 'introduction', subjectId: 'detective-a', meaning: '寸头陌生男人直接进入玩家视野；此时只能称“寸头男人”。', evidenceStandard: '角色在玩家视野中实际出现。' },
  { eventId: 'follow:shaved-man-to-inn', kind: 'location', subjectId: 'detective-a', meaning: '玩家确认寸头男人进入黔灵旅社。', evidenceStandard: '玩家实际跟踪完整路线，或获得能指向旅社的明确地址证据。', requires: ['observe:shaved-man'] },
  { eventId: 'identify:zhao-gang-name', kind: 'identity', subjectId: 'detective-a', meaning: '确认眼前或被可靠介绍的男人姓名是赵刚；本事件会建立人物卡，但不自动确认职业。', evidenceStandard: '姓名证件、实名登记、本人明确自我介绍，或已知可靠人物的明确介绍。' },
  { eventId: 'learn:zhao-gang-job', kind: 'public-fact', subjectId: 'detective-a', meaning: '确认眼前男人的公开职业是货车司机；本事件会建立人物卡，但姓名可仍未知。', evidenceStandard: '驾驶或货运证件、货运单、可核验的车辆与工作行为，或本人说明获得外部印证。' },
  { eventId: 'insight:zhao-gang-reckless', kind: 'behavior', subjectId: 'detective-a', meaning: '玩家观察到赵刚精力充沛、讲义气，但行动冒失且不擅长周密措辞。', evidenceStandard: '正文必须呈现一次有实际后果的冒失行动，或至少两次一致的言行观察；不能根据体型或职业直接推断。', requires: ['identify:zhao-gang-name'] },
  { eventId: 'observe:unknown-woman', kind: 'introduction', subjectId: 'detective-b', meaning: '陌生女人直接进入玩家视野；此时只能称“陌生女人”。', evidenceStandard: '角色在玩家视野中实际出现。', locations: ['detective-inn', 'mountain-trail', 'observation-deck'] },
  { eventId: 'identify:lin-jing-name', kind: 'identity', subjectId: 'detective-b', meaning: '确认眼前或被可靠介绍的女人姓名是林静；本事件会建立人物卡，但不自动确认职业。', evidenceStandard: '姓名证件、实名记录、本人明确自我介绍，或已知可靠人物的明确介绍。', locations: ['detective-inn', 'mountain-trail', 'observation-deck', 'community-hospital'] },
  { eventId: 'learn:lin-jing-job', kind: 'public-fact', subjectId: 'detective-b', meaning: '确认眼前女人是刚来到本地工作的普通护士；本事件会建立人物卡，但姓名可仍未知。', evidenceStandard: '工牌、排班或入职记录、可核验的护理工作行为，或医院工作人员的可靠介绍。', locations: ['detective-inn', 'community-hospital'] },
  { eventId: 'insight:lin-jing-composure', kind: 'behavior', subjectId: 'detective-b', meaning: '玩家观察到林静高冷、平静，压力下仍会把情绪压进简短而精确的措辞。', evidenceStandard: '正文必须呈现她在有压力的具体场面中仍保持克制的行为；不能仅凭表情判断。', requires: ['identify:lin-jing-name'] },
  { eventId: 'learn:zhao-lin-connection', kind: 'relationship', subjectId: 'detective-b', meaning: '确认赵刚与林静彼此认识或保持联系；不自动说明关系性质。', evidenceStandard: '玩家亲眼看见双方互动，或获得可核验的通话、留言、登记或独立证词。', requires: ['identify:zhao-gang-name', 'identify:lin-jing-name'] },
  { eventId: 'find:medical-record', kind: 'location', meaning: '玩家看到药单、预约或就诊记录，因此确认社区医院与调查有关。', evidenceStandard: '玩家实际看到带有医院信息的药单、预约或就诊记录。', locations: ['home', 'school'] },
  { eventId: 'hear:accident-site', kind: 'location', meaning: '玩家获得山腰事故区域的模糊信息，但还不能前往。', evidenceStandard: '可靠人物或已有材料明确提到山腰事故区域。' },
  { eventId: 'locate:observation-deck', kind: 'location', meaning: '玩家以路线、现场图或可靠证词确认废弃观景台坐标。', evidenceStandard: '至少有路线、现场图、地标对应或可核验地址之一。', requires: ['hear:accident-site'] },
];

export function normalizeKnowledgeEvents(value: unknown, unlockedClues: unknown = []): PlayerKnowledgeEvent[] {
  const events = new Set<string>(INITIAL_EVENTS);
  if (Array.isArray(value)) {
    for (const event of value) {
      if (typeof event !== 'string') continue;
      if (knownEventIds.has(event) || (event.startsWith('visit:') && !!getLocationById(event.slice(6)))) {
        events.add(event);
        for (const expanded of LEGACY_EVENT_EXPANSIONS[event] ?? []) {
          events.add(expanded);
          for (const implied of IMPLIED_EVENTS[expanded] ?? []) events.add(implied);
        }
        for (const implied of IMPLIED_EVENTS[event as PlayerKnowledgeEvent] ?? []) events.add(implied);
      }
    }
  }
  if (Array.isArray(unlockedClues)) {
    for (const clueId of unlockedClues) {
      if (typeof clueId !== 'string') continue;
      for (const event of clueEventMap[clueId] ?? []) events.add(event);
    }
  }
  return [...events] as PlayerKnowledgeEvent[];
}

export function addKnowledgeEvent(value: unknown, event: PlayerKnowledgeEvent): PlayerKnowledgeEvent[] {
  return normalizeKnowledgeEvents([...(Array.isArray(value) ? value : []), event]);
}

/** 只落盘写手正文实际提交、并且导演已授权的玩家认知事件。 */
export function addPresentedAuthorizedKnowledgeEvents(
  value: unknown,
  presentedEventIds: readonly string[],
  authorizedEventIds: readonly string[],
): PlayerKnowledgeEvent[] {
  let events = normalizeKnowledgeEvents(value);
  const authorized = new Set(authorizedEventIds);
  for (const eventId of presentedEventIds) {
    if (authorized.has(eventId) && knownEventIds.has(eventId)) {
      events = addKnowledgeEvent(events, eventId as PlayerKnowledgeEvent);
    }
  }
  return events;
}

export function getLocationPresentation(
  locationId: unknown,
  variables: Record<string, unknown> = {},
): LocationPresentation | null {
  const location = getLocationById(locationId);
  if (!location) return null;
  const events = new Set(normalizeKnowledgeEvents(variables.knowledgeEvents, variables.unlockedClues));
  let stage = rules[location.id]?.stage(events) ?? 'hidden';
  if (events.has(`visit:${location.id}`)) stage = 'visited';
  if (variables.location === location.id && stage === 'hidden') stage = 'visited';
  const copy = rules[location.id]?.[stage === 'hidden' ? 'located' : stage];
  if (stage === 'hidden' || !copy) return null;
  return {
    id: location.id,
    stage,
    ...copy,
    icon: location.icon,
    x: location.x,
    y: location.y,
    canTravel: stage === 'located' || stage === 'visited',
  };
}

export function getVisibleLocationPresentations(variables: Record<string, unknown>): LocationPresentation[] {
  return gameLocations.flatMap(location => {
    const presentation = getLocationPresentation(location.id, variables);
    return presentation ? [presentation] : [];
  });
}

export function getCurrentLocationPresentation(variables: Record<string, unknown>): LocationPresentation {
  return getLocationPresentation(variables.location ?? DEFAULT_LOCATION_ID, variables)
    ?? getLocationPresentation(DEFAULT_LOCATION_ID, variables)!;
}

export function getPlayerEntities(variables: Record<string, unknown>): PlayerEntityPresentation[] {
  const events = new Set(normalizeKnowledgeEvents(variables.knowledgeEvents, variables.unlockedClues));
  const entities: PlayerEntityPresentation[] = [{
    id: 'fumi',
    stage: 'understood',
    displayName: '文穗',
    subtitle: '与你同住、如今失去联系的少女',
    profile: '与你共同生活的重要家人。她在暴雨中的清晨留下早餐和纸条后出门，此后一直无法取得联系。',
    portrait: 'fumi-normal.png',
    facts: ['与你共同居住', '今天早晨独自出门', '手机始终无人接听'],
  }];
  if (events.has('meet:touko')) entities.push({
    id: 'touko', stage: events.has('insight:touko-protective') ? 'familiar' : 'public-known', displayName: '灯织学姐',
    subtitle: '住在对面商住楼的学姐',
    profile: events.has('insight:touko-protective')
      ? '与你相识的学姐。你逐渐看出，她平静而准确的关心带着保护性的控制：她常纠正问题、转移观察焦点，并只留下一半答案。'
      : '与你相识、住在公寓对面商住楼的学姐。目前你只确认了她的公开身份与住处。',
    portrait: 'touko-normal.png',
    facts: [
      '住在公寓对面的商住楼',
      '与你和文穗都认识',
      ...(events.has('insight:touko-protective') ? ['关心中带有保护性的谈话控制'] : []),
    ],
  });
  if (events.has('meet:old-man')) entities.push({
    id: 'old-man', stage: events.has('insight:old-man-neighborhood') ? 'familiar' : 'public-known', displayName: '周大爷',
    subtitle: '独自住在麻将馆楼上的退休老人',
    profile: events.has('insight:old-man-neighborhood')
      ? '在附近独居的普通退休老人。经由可核验的街坊信息，你确认他很熟悉附近居民和日常动静。'
      : '在附近独居的普通退休老人。你已经确认他的称呼、退休状态与住处，除此之外仍需通过交谈了解。',
    portrait: 'old-man-normal.png',
    facts: ['已经退休', '住在麻将馆楼上的旧居民楼', ...(events.has('insight:old-man-neighborhood') ? ['熟悉附近居民与日常动静'] : [])],
  });
  if (events.has('meet:chen-huihui')) entities.push({
    id: 'chen-huihui', stage: events.has('insight:chen-huihui-hypoglycemia') ? 'understood' : events.has('insight:chen-huihui-social-strain') ? 'familiar' : 'public-known', displayName: '陈慧慧',
    subtitle: '社区便利店的店员',
    profile: events.has('insight:chen-huihui-hypoglycemia')
      ? '社区便利店的店员。你亲眼确认她有低血糖；她总拿在手里、看起来像文件夹的东西，其实是一块随时用来补充糖分的大号巧克力。'
      : events.has('insight:chen-huihui-social-strain')
        ? '社区便利店的店员。通过实际互动，你发现她努力维持热情时容易紧张，固定的笑容和措辞常显得笨拙。'
      : '附近社区便利店的店员。你认得她叫陈慧慧；她平时看起来有些奇怪，总是紧张兮兮，努力摆出的笑容也很不自然。',
    portrait: 'chen-huihui-normal.png',
    facts: [
      '在社区便利店工作',
      '平时看起来有些奇怪、紧张兮兮，笑容不太自然',
      ...(events.has('insight:chen-huihui-social-strain') ? ['努力维持热情时容易紧张', '待人方式有些笨拙'] : []),
      ...(events.has('insight:chen-huihui-hypoglycemia') ? ['有低血糖', '手中的“文件夹”其实是大号巧克力'] : []),
    ],
  });
  if (events.has('meet:liu-renguang')) entities.push({
    id: 'liu-renguang', stage: events.has('insight:liu-renguang-boundaries') ? 'familiar' : 'public-known', displayName: '刘仁光',
    subtitle: '文穗中学的体育老师',
    profile: events.has('insight:liu-renguang-boundaries')
      ? '文穗学校的体育老师。你已经亲眼看到或从相互印证的观察中确认，他与人接触时缺乏应有的分寸。'
      : '文穗学校的体育老师。目前你只确认了他的教职身份，不能据此推断他与学生私下如何相处。',
    portrait: 'liu-renguang-normal.png',
    facts: ['在文穗的中学任教', ...(events.has('insight:liu-renguang-boundaries') ? ['与人接触时缺乏应有的分寸'] : [])],
  });
  if (events.has('observe:shaved-man')) {
    const knowsName = events.has('identify:zhao-gang-name');
    const knowsJob = events.has('learn:zhao-gang-job');
    const knowsTemperament = events.has('insight:zhao-gang-reckless');
    const knowsConnection = events.has('learn:zhao-lin-connection');
    const stage: CharacterKnowledgeStage = knowsTemperament
      ? 'familiar'
      : knowsJob
        ? 'public-known'
        : knowsName
          ? 'identified'
          : 'observed';
    entities.push({
      id: 'detective-a', stage, displayName: knowsName ? '赵刚' : '寸头男人',
      subtitle: knowsName
        ? (knowsJob ? '约三十岁的货车司机' : '姓名已经确认的外地男人')
        : (knowsJob ? '公开职业是货车司机的陌生男人' : '身份不明的陌生男人'),
      profile: knowsTemperament
        ? `此前被你称作“寸头男人”的外地男人。${knowsJob ? '他的公开职业是货车司机。' : ''}通过实际言行，你发现他精力充沛、讲义气，但行动冒失且不擅长周密措辞。`
        : `你${knowsName ? '已确认他名叫赵刚' : '目前只能按外貌称他为“寸头男人”'}；${knowsJob ? '也已确认他的公开职业是货车司机' : '他的职业尚未获得可靠确认'}。除此之外，不应仅凭体格或行踪推断他的性格。`,
      portrait: 'detective-a-normal.png',
      facts: [
        ...(knowsName ? ['姓名已确认：赵刚'] : ['姓名未知']),
        ...(knowsJob ? ['公开职业是货车司机'] : []),
        ...(events.has('follow:shaved-man-to-inn') ? ['曾进入黔灵旅社'] : []),
        ...(knowsTemperament ? ['精力充沛、讲义气，但行动有些冒失'] : []),
        ...(knowsConnection ? ['与林静认识或保持联系'] : []),
      ],
    });
  }
  if (events.has('observe:unknown-woman')) {
    const knowsName = events.has('identify:lin-jing-name');
    const knowsJob = events.has('learn:lin-jing-job');
    const knowsTemperament = events.has('insight:lin-jing-composure');
    const knowsConnection = events.has('learn:zhao-lin-connection');
    const stage: CharacterKnowledgeStage = knowsTemperament
      ? 'familiar'
      : knowsJob
        ? 'public-known'
        : knowsName
          ? 'identified'
          : 'observed';
    entities.push({
      id: 'detective-b', stage, displayName: knowsName ? '林静' : '陌生女人',
      subtitle: knowsName
        ? (knowsJob ? '刚来到本地工作的普通护士' : '姓名已经确认的陌生女性')
        : (knowsJob ? '在本地工作的普通护士' : '身份不明的女性'),
      profile: knowsTemperament
        ? `你${knowsName ? '确认她名叫林静' : '仍不知道她的姓名'}。${knowsJob ? '她是刚来到本地工作的普通护士。' : ''}从压力下的具体表现看，她高冷而平静，常把情绪压进简短、精确的措辞。`
        : `你${knowsName ? '已确认她名叫林静' : '目前只能称她为“陌生女人”'}；${knowsJob ? '也已确认她是刚来到本地工作的普通护士' : '她的职业尚未获得可靠确认'}。除此之外，尚不足以判断她的性格与目的。`,
      portrait: 'detective-b-normal.png',
      facts: [
        ...(knowsName ? ['姓名已确认：林静'] : ['姓名未知']),
        ...(knowsJob ? ['是刚来到本地工作的普通护士'] : []),
        ...(knowsTemperament ? ['压力下仍保持冷静而克制'] : []),
        ...(knowsConnection ? ['与赵刚认识或保持联系'] : []),
      ],
    });
  }
  return entities;
}

function entityIdFromSpeaker(speaker: string, character?: string): string | null {
  const value = `${speaker} ${character ?? ''}`.toLowerCase();
  if (/文穗|文穂|fumi/.test(value)) return 'fumi';
  if (/灯织|灯織|touko/.test(value)) return 'touko';
  if (/周德明|周德星|周大爷|独居老头|老头|old-man/.test(value)) return 'old-man';
  if (/赵刚|侦探a|寸头男人|detective-a/.test(value)) return 'detective-a';
  if (/林静|侦探b|陌生女人|detective-b/.test(value)) return 'detective-b';
  if (/陈慧慧|便利店员|chen-huihui|clerk/.test(value)) return 'chen-huihui';
  if (/刘仁光|体育老师|liu-renguang|teacher/.test(value)) return 'liu-renguang';
  return null;
}

/** 将内部说话者名称投影为玩家当前有权看到的称呼。 */
export function resolvePlayerFacingSpeaker(
  speaker: string,
  character: string | undefined,
  variables: Record<string, unknown>,
): string {
  if (speaker === '旁白') return speaker;
  const entityId = entityIdFromSpeaker(speaker, character);
  if (!entityId) return speaker;
  const events = new Set(normalizeKnowledgeEvents(variables.knowledgeEvents, variables.unlockedClues));
  if (entityId === 'chen-huihui' && !events.has('meet:chen-huihui')) return '店员';
  if (entityId === 'detective-b' && !events.has('identify:lin-jing-name')
    && variables.location === 'community-hospital') return '新来的护士';
  if (entityId === 'detective-a' && !events.has('observe:shaved-man')
    && variables.location === 'street') return '货车司机';
  return getPlayerEntities(variables).find(entity => entity.id === entityId)?.displayName ?? '？？？';
}

const locationStageRank: Record<LocationKnowledgeStage, number> = { hidden: 0, rumored: 1, located: 2, visited: 3 };

export function getKnowledgeVisualUpdates(
  previousVariables: Record<string, unknown>,
  nextVariables: Record<string, unknown>,
): KnowledgeVisualUpdate[] {
  const updates: KnowledgeVisualUpdate[] = [];
  const previousPeople = new Map(getPlayerEntities(previousVariables).map(person => [person.id, person]));
  const nextPeople = getPlayerEntities(nextVariables);
  for (const person of nextPeople) {
    const previous = previousPeople.get(person.id);
    if (!previous) {
      updates.push({
        id: `character-new:${person.id}:${person.stage}`,
        kind: 'character-new', target: 'characters', eyebrow: 'NEW PROFILE / 新人物',
        title: person.displayName, description: person.subtitle, portrait: person.portrait,
      });
    } else if (
      previous.stage !== person.stage
      || previous.displayName !== person.displayName
      || previous.subtitle !== person.subtitle
      || previous.profile !== person.profile
      || previous.facts.join('\n') !== person.facts.join('\n')
    ) {
      updates.push({
        id: `character-updated:${person.id}:${person.stage}:${person.facts.length}`,
        kind: 'character-updated', target: 'characters', eyebrow: 'PROFILE UPDATED / 人物档案更新',
        title: person.displayName, description: person.profile, portrait: person.portrait,
      });
    }
  }

  const previousLocations = new Map(getVisibleLocationPresentations(previousVariables).map(location => [location.id, location]));
  for (const location of getVisibleLocationPresentations(nextVariables)) {
    const previous = previousLocations.get(location.id);
    if (previous && locationStageRank[location.stage] <= locationStageRank[previous.stage]) continue;
    if (!previous || previous.stage !== location.stage) {
      const kind = location.stage === 'rumored' ? 'location-rumored' : location.stage === 'visited' ? 'location-visited' : 'location-located';
      updates.push({
        id: `${kind}:${location.id}`,
        kind,
        target: 'map',
        eyebrow: location.stage === 'rumored' ? 'NEW RUMOR / 新地点传闻' : location.stage === 'visited' ? 'LOCATION UPDATED / 地点信息更新' : 'NEW LOCATION / 新地点',
        title: location.name,
        description: location.description,
      });
    }
  }
  return updates;
}

export function buildPlayerKnowledgeBrief(variables: Record<string, unknown>): PlayerKnowledgeBrief {
  const currentLocation = typeof variables.location === 'string' ? variables.location : DEFAULT_LOCATION_ID;
  const events = new Set(normalizeKnowledgeEvents(variables.knowledgeEvents, variables.unlockedClues));
  return {
    locations: getVisibleLocationPresentations(variables).map(({ id, stage, name, canTravel }) => ({ id, stage, name, canTravel })),
    entities: getPlayerEntities(variables),
    namingRules: [
      '只能使用本简报中的玩家可见名称；本回合经审查授权的 discovery 可在其 evidence 实际发生后引入对应新称呼。不得输出内部 ID、正典名称或其他尚未出现的角色身份。',
      '人物了解只能由 allowedDiscoveries 中的离散事件增长，不能按聊天次数、好感度、怀疑度或外貌自动升级。姓名、职业、行为观察和人物关系必须分别取得对应证据。',
      'personal-fact/behavior/relationship 事件必须把 evidenceStandard 要求的具体行为或可核验依据真正写进正文；不能把性格结论、案件嫌疑或“玩家觉得”本身当作证据。',
      'rumored 地点只能作为模糊方向或调查目标，不能让玩家直接前往。',
      'detective-a / detective-b 是内部 ID，玩家识别身份前必须分别称为“寸头男人”和“陌生女人”。',
    ],
    allowedDiscoveries: discoveryRules
      .filter(rule => !events.has(rule.eventId))
      .filter(rule => !rule.requires?.some(required => !events.has(required)))
      .filter(rule => !rule.locations || rule.locations.includes(currentLocation))
      .map(({ eventId, kind, subjectId, meaning, evidenceStandard }) => ({
        eventId, kind, subjectId, meaning, evidenceStandard,
      })),
  };
}

export function isAllowedKnowledgeDiscovery(
  brief: PlayerKnowledgeBrief,
  eventId: string,
): eventId is PlayerKnowledgeEvent {
  return brief.allowedDiscoveries.some(discovery => discovery.eventId === eventId);
}
