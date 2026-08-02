export type LocationIconKey =
  | 'home'
  | 'senpai'
  | 'school'
  | 'store'
  | 'old-building'
  | 'trail'
  | 'inn'
  | 'water-tower'
  | 'hospital'
  | 'observation';

export interface GameLocation {
  id: string;
  name: string;
  shortName: string;
  signal: string;
  description: string;
  x: number;
  y: number;
  icon: LocationIconKey;
  background: string;
  dayBackground?: string;
  nightBackground?: string;
}

export interface TravelEstimate {
  distance: number;
  distanceKm: number;
  timeMinutes: number;
  staminaCost: number;
}

export const DEFAULT_LOCATION_ID = 'home';

export const gameLocations: GameLocation[] = [
  {
    id: 'home',
    name: '玩家公寓',
    shortName: '公寓',
    signal: 'HOME',
    description: '老城区的六层居民楼。文穗的房间、早餐和药瓶都留在这里。',
    x: 44,
    y: 50,
    icon: 'home',
    background: 'home-day',
    dayBackground: 'home-day',
    nightBackground: 'home-night',
  },
  {
    id: 'senpai-building',
    name: '学姐商住楼',
    shortName: '学姐楼',
    signal: 'SENPAI',
    description: '带咖啡厅的高档商住楼。这里离玩家公寓很近，却像属于另一座城市。',
    x: 46,
    y: 39,
    icon: 'senpai',
    background: 'senpai-building',
  },
  {
    id: 'school',
    name: '中学',
    shortName: '中学',
    signal: 'SCHOOL',
    description: '文穗就读的中学。门卫、请假记录和体育课都可能留下证词。',
    x: 43,
    y: 71,
    icon: 'school',
    background: 'school-day',
    dayBackground: 'school-day',
    nightBackground: 'school-night',
  },
  {
    id: 'supermarket',
    name: '便利店',
    shortName: '便利店',
    signal: 'STORE',
    description: '二十四小时营业的社区便利店。小票和监控记录着文穗早上的行踪。',
    x: 20,
    y: 71,
    icon: 'store',
    background: 'supermarket-day',
    dayBackground: 'supermarket-day',
    nightBackground: 'supermarket-night',
  },
  {
    id: 'old-man-building',
    name: '独居老头楼',
    shortName: '老头楼',
    signal: 'OLD BLDG',
    description: '底层开着麻将馆的旧居民楼。楼上房间在暴雨天也常亮着灯。',
    x: 17,
    y: 85,
    icon: 'old-building',
    background: 'old-man-building',
  },
  {
    id: 'mountain-trail',
    name: '黔灵山脚步道',
    shortName: '山脚步道',
    signal: 'TRAIL',
    description: '通向水塔和山腰的湿滑石阶。雨越大，山路越危险。',
    x: 67,
    y: 71,
    icon: 'trail',
    background: 'mountain-trail',
  },
  {
    id: 'detective-inn',
    name: '侦探小旅馆',
    shortName: '小旅馆',
    signal: 'INN',
    description: '侦探A暂住的陈旧旅馆。老板娘记得住客的伤口和访客。',
    x: 82,
    y: 85,
    icon: 'inn',
    background: 'detective-inn',
  },
  {
    id: 'water-tower',
    name: '废弃水塔',
    shortName: '水塔',
    signal: 'WATER TOWER',
    description: '藏在北侧山林中的废弃水塔。这里是文穗不愿告诉任何人的秘密据点。',
    x: 50,
    y: 15,
    icon: 'water-tower',
    background: 'water-tower-exterior',
  },
  {
    id: 'community-hospital',
    name: '社区医院',
    shortName: '医院',
    signal: 'HOSPITAL',
    description: '白光彻夜不熄的社区医院。值班记录保存着玩家遗忘的就诊历史。',
    x: 69,
    y: 50,
    icon: 'hospital',
    background: 'community-hospital',
  },
  {
    id: 'observation-deck',
    name: '废弃观景台',
    shortName: '观景台',
    signal: 'DEATH SITE',
    description: '山腰尽头的废弃观景台。锈栏之外是被雨幕遮住的陡坡。',
    x: 88,
    y: 69,
    icon: 'observation',
    background: 'observation-deck',
  },
];

const locationById = new Map(gameLocations.map(location => [location.id, location]));

export function getLocationById(id: unknown): GameLocation | undefined {
  if (typeof id !== 'string') return undefined;
  return locationById.get(id);
}

export function normalizeLocationId(id: unknown): string {
  return getLocationById(id)?.id ?? DEFAULT_LOCATION_ID;
}

export function estimateTravel(fromId: string, toId: string): TravelEstimate | null {
  const from = getLocationById(fromId);
  const to = getLocationById(toId);
  if (!from || !to) return null;

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance === 0) {
    return { distance: 0, distanceKm: 0, timeMinutes: 0, staminaCost: 0 };
  }

  return {
    distance: Math.round(distance * 10) / 10,
    distanceKm: Math.max(0.2, Math.round(distance * 0.4) / 10),
    timeMinutes: Math.max(5, Math.ceil(distance / 13) * 5),
    staminaCost: Math.max(1, Math.ceil(distance / 7)),
  };
}

export function getLocationBackground(location: GameLocation, time: Date): string {
  const hour = time.getHours();
  const isNight = hour >= 18 || hour < 6;
  if (isNight && location.nightBackground) return location.nightBackground;
  if (!isNight && location.dayBackground) return location.dayBackground;
  return location.background;
}

export function addMinutes(time: Date, minutes: number): Date {
  return new Date(time.getTime() + minutes * 60_000);
}

export function getLocationPromptCatalog(): string {
  return gameLocations
    .map(location => `- ${location.id}: ${location.name} - ${location.description}`)
    .join('\n');
}
