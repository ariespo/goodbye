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
  'observe:unknown-woman',
  'identify:lin-jing',
  'find:medical-record',
  'hear:accident-site',
  'locate:observation-deck',
] as const;

export type PlayerKnowledgeEvent = (typeof PLAYER_KNOWLEDGE_EVENTS)[number] | `visit:${string}`;

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
  stage: 'unknown' | 'observed' | 'introduced' | 'identified';
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
  allowedDiscoveries: Array<{ eventId: PlayerKnowledgeEvent; meaning: string }>;
}

const INITIAL_EVENTS: PlayerKnowledgeEvent[] = ['know:home', 'know:school', 'know:supermarket'];
const knownEventIds = new Set<string>(PLAYER_KNOWLEDGE_EVENTS);

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
  meaning: string;
  requires?: PlayerKnowledgeEvent[];
  locations?: string[];
}> = [
  { eventId: 'meet:chen-huihui', meaning: '陈慧慧本人在便利店与玩家交谈，或经可靠当面介绍；玩家获得她的人物简介。', locations: ['supermarket'] },
  { eventId: 'meet:liu-renguang', meaning: '刘仁光本人在中学与玩家交谈，或经可靠当面介绍；玩家获得他的人物简介。', locations: ['school'] },
  { eventId: 'meet:touko', meaning: '灯织本人出场、来电或被可靠地介绍；玩家获得“灯织学姐”的人物简介与住处。', locations: ['home', 'school', 'supermarket'] },
  { eventId: 'meet:old-man', meaning: '周大爷本人出场并与玩家交谈；玩家获得人物简介与住处。', locations: ['home', 'school', 'supermarket'] },
  { eventId: 'find:water-tower-fragment', meaning: '玩家获得文穗留下的残页、草图或等价证据，只形成“山中旧设施”的传闻。', locations: ['home', 'school'] },
  { eventId: 'locate:water-tower-route', meaning: '玩家用路线、地标或可靠证词确认山脚入口与废弃水塔坐标。', requires: ['find:water-tower-fragment'] },
  { eventId: 'observe:shaved-man', meaning: '寸头陌生男人直接进入玩家视野；不得称其为侦探A。' },
  { eventId: 'follow:shaved-man-to-inn', meaning: '玩家实际跟踪寸头男人，或获得明确地址证据，确认其进入黔灵旅社。', requires: ['observe:shaved-man'] },
  { eventId: 'identify:zhao-gang', meaning: '玩家从登记、证件或本人说明中确认寸头男人名叫赵刚。', requires: ['follow:shaved-man-to-inn'] },
  { eventId: 'observe:unknown-woman', meaning: '陌生女人直接进入玩家视野；不得称其为侦探B。', locations: ['detective-inn', 'mountain-trail', 'observation-deck'] },
  { eventId: 'identify:lin-jing', meaning: '玩家从可靠来源确认陌生女人名叫林静。', requires: ['observe:unknown-woman'] },
  { eventId: 'find:medical-record', meaning: '玩家看到药单、预约或就诊记录，因此确认社区医院与调查有关。', locations: ['home', 'school'] },
  { eventId: 'hear:accident-site', meaning: '玩家获得山腰事故区域的模糊信息，但还不能前往。' },
  { eventId: 'locate:observation-deck', meaning: '玩家以路线、现场图或可靠证词确认废弃观景台坐标。', requires: ['hear:accident-site'] },
];

export function normalizeKnowledgeEvents(value: unknown, unlockedClues: unknown = []): PlayerKnowledgeEvent[] {
  const events = new Set<string>(INITIAL_EVENTS);
  if (Array.isArray(value)) {
    for (const event of value) {
      if (typeof event !== 'string') continue;
      if (knownEventIds.has(event) || (event.startsWith('visit:') && !!getLocationById(event.slice(6)))) events.add(event);
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
    stage: 'introduced',
    displayName: '文穗',
    subtitle: '与你同住、如今失去联系的少女',
    profile: '与你共同生活的重要家人。她在暴雨中的清晨留下早餐和纸条后出门，此后一直无法取得联系。',
    portrait: 'fumi-normal.png',
    facts: ['与你共同居住', '今天早晨独自出门', '手机始终无人接听'],
  }];
  if (events.has('meet:touko')) entities.push({
    id: 'touko', stage: 'introduced', displayName: '灯织学姐',
    subtitle: '住在对面商住楼的学姐',
    profile: '与你相识的学姐。她观察敏锐，似乎知道一些与你和文穗有关、却没有立刻说出口的往事。',
    portrait: 'touko-normal.png',
    facts: ['住在公寓对面的商住楼', '与你和文穗都认识', '对你的状态格外留意'],
  });
  if (events.has('meet:old-man')) entities.push({
    id: 'old-man', stage: 'introduced', displayName: '周大爷',
    subtitle: '独自住在麻将馆楼上的老人',
    profile: '在附近独居的老人。第一次正式出现在玩家面前时主动与你打了招呼，态度显得熟稔而亲切。',
    portrait: 'old-man-normal.png',
    facts: ['住在麻将馆楼上的旧居民楼', '似乎早就认识主角', '真实立场仍不明确'],
  });
  if (events.has('meet:chen-huihui')) entities.push({
    id: 'chen-huihui', stage: 'introduced', displayName: '陈慧慧',
    subtitle: '社区便利店的店员',
    profile: '便利店的店员。她不太擅长与人相处，努力表现出的热情和固定笑容反而常让人感到不自在。她记得文穗来店时买过的东西。',
    portrait: 'chen-huihui-normal.png',
    facts: ['在社区便利店工作', '记得文穗近期来店的情况', '待人方式有些笨拙'],
  });
  if (events.has('meet:liu-renguang')) entities.push({
    id: 'liu-renguang', stage: 'introduced', displayName: '刘仁光',
    subtitle: '文穗中学的体育老师',
    profile: '文穗学校的体育老师。他言谈自信，靠近人时却缺乏应有的分寸；关于他和文穗的接触，仍需要进一步查证。',
    portrait: 'liu-renguang-normal.png',
    facts: ['在文穗的中学任教', '对学生的接触方式值得警惕', '与文穗的关系尚待调查'],
  });
  if (events.has('observe:shaved-man')) {
    entities.push(events.has('identify:zhao-gang')
      ? {
          id: 'detective-a', stage: 'identified', displayName: '赵刚', subtitle: '身份与来意仍需继续核实',
          profile: '此前被你称作“寸头男人”的外地男人。你已经从可靠信息中确认了他的姓名，但他在调查什么仍未完全明朗。',
          portrait: 'detective-a-normal.png', facts: ['此前被称为“寸头男人”', '姓名已确认：赵刚', '曾进入黔灵旅社'],
        }
      : {
          id: 'detective-a', stage: 'observed', displayName: '寸头男人', subtitle: '身份不明的陌生男人',
          profile: '行迹可疑的陌生男人。你目前只能根据外貌暂时称呼他，真实姓名、职业与来意均不明确。',
          portrait: 'detective-a-normal.png', facts: ['留着寸头', '行踪值得怀疑', '姓名与来意未知'],
        });
  }
  if (events.has('observe:unknown-woman')) {
    entities.push(events.has('identify:lin-jing')
      ? {
          id: 'detective-b', stage: 'identified', displayName: '林静', subtitle: '与赵刚有关联的女人',
          profile: '曾到黔灵旅社见过赵刚的女人。姓名已经确认，但她与赵刚的完整关系和目的仍需调查。',
          portrait: 'detective-b-normal.png', facts: ['姓名已确认：林静', '与赵刚有联系', '真实目的尚未确认'],
        }
      : {
          id: 'detective-b', stage: 'observed', displayName: '陌生女人', subtitle: '身份不明的女性',
          profile: '出现在调查视野中的陌生女人。你尚不知道她的姓名，也不能确认她与寸头男人之间的关系。',
          portrait: 'detective-b-normal.png', facts: ['曾出现在调查视野中', '可能与寸头男人有关', '姓名与目的未知'],
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
    } else if (previous.stage !== person.stage || previous.displayName !== person.displayName || previous.profile !== person.profile) {
      updates.push({
        id: `character-updated:${person.id}:${person.stage}`,
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
      'rumored 地点只能作为模糊方向或调查目标，不能让玩家直接前往。',
      'detective-a / detective-b 是内部 ID，玩家识别身份前必须分别称为“寸头男人”和“陌生女人”。',
    ],
    allowedDiscoveries: discoveryRules
      .filter(rule => !events.has(rule.eventId))
      .filter(rule => !rule.requires?.some(required => !events.has(required)))
      .filter(rule => !rule.locations || rule.locations.includes(currentLocation))
      .map(({ eventId, meaning }) => ({ eventId, meaning })),
  };
}

export function isAllowedKnowledgeDiscovery(
  brief: PlayerKnowledgeBrief,
  eventId: string,
): eventId is PlayerKnowledgeEvent {
  return brief.allowedDiscoveries.some(discovery => discovery.eventId === eventId);
}
