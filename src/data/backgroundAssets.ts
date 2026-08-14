export type BackgroundAssetPriority = 'existing' | 'P1' | 'P2';
export type SceneEnvironment =
  | 'none'
  | 'indoor-muted-rain'
  | 'indoor-audible-rain'
  | 'outdoor-light-rain'
  | 'outdoor-heavy-rain';

export interface BackgroundAsset {
  id: string;
  file: string;
  displayName: string;
  description: string;
  usage: string;
  priority: BackgroundAssetPriority;
  tags: string[];
  environment: SceneEnvironment;
}

export const backgroundAssets: BackgroundAsset[] = [
  {
    id: 'black',
    file: 'black.png',
    displayName: '黑屏',
    description: '用于失去意识、转场、梦境和不可见场景。',
    usage: '通用转场',
    priority: 'existing',
    tags: ['transition', 'void'],
    environment: 'none',
  },
  {
    id: 'opening-rain-black',
    file: 'black.png',
    displayName: '开局黑屏暴雨',
    description: '开场特殊演出：黑屏中只有雨层和雨声。',
    usage: '开局一次性演出',
    priority: 'existing',
    tags: ['opening', 'transition', 'rain'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'bedroom1',
    file: 'bedroom1.png',
    displayName: '玩家卧室（默认日间）',
    description: '玩家公寓卧室的雨天日间状态；兼容旧场景文本。',
    usage: '开局/玩家卧室',
    priority: 'existing',
    tags: ['bedroom', 'opening', 'day'],
    environment: 'indoor-audible-rain',
  },
  {
    id: 'bedroom1-day',
    file: 'bedroom1.png',
    displayName: '玩家卧室（日间）',
    description: '玩家公寓卧室的雨天日间状态。',
    usage: '开局/玩家卧室日间',
    priority: 'existing',
    tags: ['bedroom', 'opening', 'day'],
    environment: 'indoor-audible-rain',
  },
  {
    id: 'bedroom1-night',
    file: 'bedroom1-night.png',
    displayName: '玩家卧室（夜间）',
    description: '同一玩家卧室的雨夜状态，家具与线索位置保持一致。',
    usage: '玩家卧室夜间/终幕',
    priority: 'existing',
    tags: ['bedroom', 'night'],
    environment: 'indoor-audible-rain',
  },
  {
    id: 'home',
    file: 'home.png',
    displayName: '玩家客餐厅（默认日间）',
    description: '玩家公寓客餐厅的雨天日间状态；兼容旧场景文本。',
    usage: '开局早餐/日常回忆',
    priority: 'existing',
    tags: ['home', 'memory', 'day'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'home-day',
    file: 'home.png',
    displayName: '玩家客餐厅（日间）',
    description: '玩家公寓客餐厅的雨天日间状态。',
    usage: '开局早餐/日间调查',
    priority: 'existing',
    tags: ['home', 'memory', 'day'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'home-night',
    file: 'home-night.png',
    displayName: '玩家客餐厅（夜间）',
    description: '同一客餐厅的雨夜状态，早餐与家具位置保持一致。',
    usage: '夜间回家/终幕',
    priority: 'existing',
    tags: ['home', 'memory', 'night'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'school',
    file: 'school.png',
    displayName: '中学门口（默认日间）',
    description: '中学门口、门卫室和操场的雨天日间状态；兼容旧场景文本。',
    usage: '中学线索/门卫证词',
    priority: 'existing',
    tags: ['school', 'gate', 'day'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'school-day',
    file: 'school.png',
    displayName: '中学门口（日间）',
    description: '中学门口、门卫室和操场的雨天日间状态。',
    usage: '中学日间调查',
    priority: 'existing',
    tags: ['school', 'gate', 'day'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'school-night',
    file: 'school-night.png',
    displayName: '中学门口（夜间）',
    description: '同一中学门口的雨夜状态，校门和门卫室位置保持一致。',
    usage: '中学夜间/结局演出',
    priority: 'existing',
    tags: ['school', 'gate', 'night'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'street',
    file: 'street-redraw-v2.png',
    displayName: '街道（默认日间）',
    description: '老城区住宅巷道的暴雨日间状态；兼容旧场景文本。',
    usage: '城市移动/途中遭遇',
    priority: 'existing',
    tags: ['street', 'city', 'day'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'street-day',
    file: 'street-redraw-v2.png',
    displayName: '街道（日间）',
    description: '老城区住宅巷道的暴雨日间状态。',
    usage: '日间城市移动/途中遭遇',
    priority: 'existing',
    tags: ['street', 'city', 'day'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'street-night',
    file: 'street-night-redraw-v1.png',
    displayName: '街道（夜间）',
    description: '同一老城区住宅巷道的暴雨夜间状态，机位、建筑和排水口保持一致。',
    usage: '夜间城市移动/途中遭遇',
    priority: 'existing',
    tags: ['street', 'city', 'night'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'supermarket',
    file: 'supermarket.png',
    displayName: '便利店（默认日间）',
    description: '社区便利店的雨天日间状态；兼容旧场景文本。',
    usage: '便利店日间调查',
    priority: 'existing',
    tags: ['convenience-store', 'shop', 'day'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'supermarket-day',
    file: 'supermarket.png',
    displayName: '便利店（日间）',
    description: '社区便利店的雨天日间状态。',
    usage: '便利店日间调查',
    priority: 'existing',
    tags: ['convenience-store', 'shop', 'day'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'supermarket-night',
    file: 'supermarket-night.png',
    displayName: '便利店（夜间）',
    description: '同一便利店的雨夜营业状态，货架和收银台位置保持一致。',
    usage: '便利店夜间调查/结局演出',
    priority: 'existing',
    tags: ['convenience-store', 'shop', 'night'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'water-tower',
    file: 'water-tower.png',
    displayName: '废弃水塔内部',
    description: '灰暗、潮湿，墙上有刻痕，是文穗的秘密据点。',
    usage: '第2轮水塔调查',
    priority: 'P1',
    tags: ['water-tower', 'fumi', 'clue'],
    environment: 'indoor-audible-rain',
  },
  {
    id: 'water-tower-exterior',
    file: 'water-tower-exterior.png',
    displayName: '废弃水塔外部',
    description: '被树丛遮挡的水塔外观，位于黔灵山脚步道附近。',
    usage: '第2轮水塔入口',
    priority: 'P1',
    tags: ['water-tower', 'mountain', 'rain'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'mountain-trail',
    file: 'mountain-trail.png',
    displayName: '黔灵山脚步道',
    description: '湿滑石阶、树丛和通往山腰的路径。',
    usage: '第2轮山路移动',
    priority: 'P1',
    tags: ['mountain', 'trail', 'rain'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'senpai-building',
    file: 'senpai-building.png',
    displayName: '学姐商住楼外观',
    description: '高档商住楼，底层有咖啡厅。',
    usage: '第3轮学姐线',
    priority: 'P1',
    tags: ['senpai', 'building'],
    environment: 'outdoor-light-rain',
  },
  {
    id: 'detective-inn',
    file: 'detective-inn.png',
    displayName: '侦探小旅馆',
    description: '陈旧小旅馆，走廊昏暗。',
    usage: '第3轮侦探线',
    priority: 'P1',
    tags: ['detective', 'inn'],
    environment: 'indoor-audible-rain',
  },
  {
    id: 'senpai-room',
    file: 'senpai-room.png',
    displayName: '学姐公寓内部',
    description: '过于干净的极简主义房间。',
    usage: '学姐楼进入后',
    priority: 'P2',
    tags: ['senpai', 'room'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'old-man-building',
    file: 'old-man-building.png',
    displayName: '独居老头楼',
    description: '老式居民楼，底层有麻将馆。',
    usage: '老头线外部',
    priority: 'P2',
    tags: ['old-man', 'building'],
    environment: 'outdoor-light-rain',
  },
  {
    id: 'old-man-room',
    file: 'old-man-room.png',
    displayName: '老头内室',
    description: '祭坛、蜡烛、名单笔记本构成的阴暗内室。',
    usage: '老头线进入后',
    priority: 'P2',
    tags: ['old-man', 'altar', 'truth'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'community-hospital',
    file: 'community-hospital.png',
    displayName: '社区医院',
    description: '白光、简陋和值班台。',
    usage: '玩家线/医疗调查',
    priority: 'P2',
    tags: ['hospital', 'player-line'],
    environment: 'indoor-muted-rain',
  },
  {
    id: 'observation-deck',
    file: 'observation-deck.png',
    displayName: '废弃观景台',
    description: '山腰湿滑观景台，锈栏和陡坡指向死亡地点。',
    usage: '死亡地点',
    priority: 'P2',
    tags: ['mountain', 'death-site'],
    environment: 'outdoor-heavy-rain',
  },
  {
    id: 'ending-c-1',
    file: 'ending-c-1.png',
    displayName: '结局：接受·清醒',
    description: '医院诊室中的空椅、温水与逐渐淡去的文穗记忆。',
    usage: 'C-1 结局专用',
    priority: 'existing',
    tags: ['ending', 'C-1', 'hospital'],
    environment: 'none',
  },
  {
    id: 'ending-f-1',
    file: 'ending-f-1.png',
    displayName: '结局：放她走',
    description: '雨后车站的人群中，玩家选择不再靠近活着的文穗。',
    usage: 'F-1 结局专用',
    priority: 'existing',
    tags: ['ending', 'F-1', 'bus-station'],
    environment: 'none',
  },
  {
    id: 'ending-loop',
    file: 'ending-loop.png',
    displayName: '结局：困局',
    description: '记忆被轮回磨损后，只剩空白笔记本与九点整的空房间。',
    usage: 'LOOP 结局专用',
    priority: 'existing',
    tags: ['ending', 'LOOP', 'bedroom'],
    environment: 'none',
  },
  {
    id: 'ending-stay',
    file: 'ending-stay.png',
    displayName: '结局：早安·永远',
    description: '玩家主动留在永远九点整的早餐日常。',
    usage: 'STAY 结局专用',
    priority: 'existing',
    tags: ['ending', 'STAY', 'home'],
    environment: 'none',
  },
  {
    id: 'ending-true',
    file: 'ending-true-retro-v5.png',
    displayName: '结局：九点零一分',
    description: '雨停后文穗走出家门，时间第一次前进到九点零一分。',
    usage: 'TRUE 结局专用',
    priority: 'existing',
    tags: ['ending', 'TRUE', 'home'],
    environment: 'none',
  },
];

export function getBackgroundById(id: string): BackgroundAsset | undefined {
  const normalized = id.replace(/\.[^.]+$/, '');
  return backgroundAssets.find(background => background.id === normalized);
}

export function getCanonicalBackgroundId(id: string): string {
  return id.replace(/\.[^.]+$/, '').replace(/-(day|night)$/i, '');
}

/** 08:00-18:30 is day; every other playable minute uses the night variant. */
export function isDayBackgroundTime(time: Date): boolean {
  const minutes = time.getHours() * 60 + time.getMinutes();
  return minutes >= 8 * 60 && minutes <= 18 * 60 + 30;
}

export function resolveBackgroundForTime(id: string, time: Date): string {
  if (!id || /^https?:\/\//i.test(id) || Number.isNaN(time.getTime())) return id;
  const canonical = getCanonicalBackgroundId(id);
  const timedId = `${canonical}-${isDayBackgroundTime(time) ? 'day' : 'night'}`;
  return getBackgroundById(timedId)?.id ?? getBackgroundById(canonical)?.id ?? id;
}

export function getBackgroundPromptCatalog(): string {
  return backgroundAssets
    .filter(background => !background.tags.includes('ending'))
    .map(background => `- ${background.id}: ${background.displayName} (${background.file}) - ${background.description}`)
    .join('\n');
}
