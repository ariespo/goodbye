import { itemAssets, type ItemAsset } from '../data/itemAssets';

const sceneAliases: Record<string, string[]> = {
  opening: ['black', 'home', 'apartment', 'bedroom1'],
  bedroom: ['bedroom1'],
  'water-tower': ['water-tower', 'water-tower-exterior'],
  'convenience-store': ['supermarket', 'convenience-store'],
  'player-line': ['player-line', 'community-hospital'],
  'old-man-room': ['old-man-room', 'old-man-building'],
  'detective-inn': ['detective-inn'],
};

const itemKeywords: Record<string, string[]> = {
  'opening-note': ['纸条', '便条', '留言', 'note'],
  'opening-mug': ['马克杯', '杯', '牛奶', '早餐', 'mug'],
  'bedroom-medicine-bottle': ['药瓶', '药', '床头柜', 'medicine', 'bottle'],
  'opening-phone': ['手机', '消息', '通话', '拨', 'phone', 'message'],
  'opening-weather-alert': ['天气', '预警', '暴雨', '推送', 'weather', 'alert'],
  'convenience-store-receipt': ['小票', '收银', '便利店', 'receipt', '07:30'],
  'convenience-store-bandaid': ['创可贴', '伤', 'bandaid'],
  'water-tower-notebook': ['笔记本', '秘密', 'notebook'],
  'water-tower-notebook-open': ['展开', '孤儿院', '院长', 'notebook'],
  'water-tower-flashlight': ['手电', '电池', 'flashlight'],
  'water-tower-old-photo': ['照片', '合影', '孤儿院', 'photo'],
  'water-tower-engraving': ['刻痕', '墙', '第', 'engraving'],
  'bedroom-medicine-bottle-clear': ['利培酮', '清晰', '药瓶', 'medicine'],
  'bedroom-strawberry-hairtie': ['草莓', '发绳', 'hairtie'],
  'bedroom-apron': ['围裙', '衣柜', 'apron'],
  'player-line-torn-letter': ['碎信', '撕碎', '纸片', 'letter'],
  'old-man-room-altar-list': ['名单', '祭坛', '阳极地', 'altar', 'list'],
  'detective-inn-scratch-mark': ['抓痕', '手上', '侦探', 'scratch'],
};

export function getItemsForBackground(background?: string | null): ItemAsset[] {
  if (!background) return itemAssets.filter(item => item.priority === 'P0');
  const normalized = normalizeScene(background.replace(/\.[^.]+$/, ''));
  return itemAssets.filter(item => {
    if (normalizeScene(item.scene) === normalized) return true;
    return sceneAliases[item.scene]?.some(alias => normalizeScene(alias) === normalized) ?? false;
  });
}

export function findItemForInvestigation(desc: string, background?: string | null): ItemAsset | undefined {
  const candidates = getItemsForBackground(background);
  const normalizedDesc = normalize(desc);
  return candidates.find(item => {
    const keywords = itemKeywords[item.id] ?? [item.object, item.displayName];
    return keywords.some(keyword => normalizedDesc.includes(normalize(keyword)));
  });
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function normalizeScene(value: string): string {
  return normalize(value).replace(/-(?:day|night)$/, '');
}
