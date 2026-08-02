export type ItemAssetPriority = 'P0' | 'P1' | 'P2';

export interface ItemAsset {
  id: string;
  scene: string;
  object: string;
  file: string;
  displayName: string;
  description: string;
  size: {
    width: number;
    height: number;
  };
  priority: ItemAssetPriority;
  round?: string;
  tags: string[];
}

export const itemAssets: ItemAsset[] = [
  {
    id: 'opening-note',
    scene: 'opening',
    object: 'note',
    file: 'item-opening-note.png',
    displayName: '文穗的纸条',
    description: '横线纸上的圆润字迹，末尾有歪歪扭扭的小猫。',
    size: { width: 120, height: 80 },
    priority: 'P0',
    round: '开局/每轮回变化',
    tags: ['opening', 'fumi', 'note', 'anchor'],
  },
  {
    id: 'opening-mug',
    scene: 'opening',
    object: 'mug',
    file: 'item-opening-mug.png',
    displayName: '星月夜马克杯',
    description: '黑白像素风马克杯，杯身有两个小人手拉手。',
    size: { width: 100, height: 120 },
    priority: 'P0',
    round: '开局',
    tags: ['opening', 'home', 'mug', 'memory'],
  },
  {
    id: 'bedroom-medicine-bottle',
    scene: 'bedroom',
    object: 'medicine-bottle',
    file: 'item-bedroom-medicine-bottle.png',
    displayName: '模糊标签药瓶',
    description: '床头柜上的药瓶，标签模糊，只能隐约看到“利”字。',
    size: { width: 60, height: 100 },
    priority: 'P0',
    round: '开局',
    tags: ['bedroom', 'medicine', 'clue'],
  },
  {
    id: 'opening-phone',
    scene: 'opening',
    object: 'phone',
    file: 'item-opening-phone.png',
    displayName: '手机',
    description: '手机屏幕显示文穗消息和太阳表情。',
    size: { width: 80, height: 140 },
    priority: 'P0',
    round: '开局',
    tags: ['opening', 'phone', 'message'],
  },
  {
    id: 'opening-weather-alert',
    scene: 'opening',
    object: 'weather-alert',
    file: 'item-opening-weather-alert.png',
    displayName: '天气预警推送',
    description: '手机上的暴雨天气预警画面，是开局时间锚。',
    size: { width: 120, height: 80 },
    priority: 'P0',
    round: '开局',
    tags: ['opening', 'phone', 'weather', 'anchor'],
  },
  {
    id: 'convenience-store-receipt',
    scene: 'convenience-store',
    object: 'receipt',
    file: 'item-convenience-store-receipt.png',
    displayName: '便利店小票',
    description: '07:30 的收银小票，记录了创可贴和矿泉水。',
    size: { width: 100, height: 60 },
    priority: 'P1',
    round: '第1轮',
    tags: ['convenience-store', 'receipt', 'time-anchor'],
  },
  {
    id: 'convenience-store-bandaid',
    scene: 'convenience-store',
    object: 'bandaid',
    file: 'item-convenience-store-bandaid.png',
    displayName: '创可贴',
    description: '未拆封的创可贴包装纸。',
    size: { width: 40, height: 30 },
    priority: 'P1',
    round: '第1轮',
    tags: ['convenience-store', 'bandaid', 'injury'],
  },
  {
    id: 'water-tower-notebook',
    scene: 'water-tower',
    object: 'notebook',
    file: 'item-water-tower-notebook.png',
    displayName: '文穗的秘密笔记本',
    description: '封面磨损的笔记本，内页隐约有字。',
    size: { width: 100, height: 80 },
    priority: 'P1',
    round: '第2轮水塔',
    tags: ['water-tower', 'notebook', 'fumi', 'clue'],
  },
  {
    id: 'water-tower-notebook-open',
    scene: 'water-tower',
    object: 'notebook-open',
    file: 'item-water-tower-notebook-open.png',
    displayName: '展开的秘密笔记本',
    description: '展开页写着孤儿院地址和院长名字。',
    size: { width: 140, height: 100 },
    priority: 'P1',
    round: '第2轮+',
    tags: ['water-tower', 'notebook', 'orphanage', 'truth'],
  },
  {
    id: 'water-tower-flashlight',
    scene: 'water-tower',
    object: 'flashlight',
    file: 'item-water-tower-flashlight.png',
    displayName: '旧手电筒',
    description: '旧款手电筒，电池耗尽标记清晰可见。',
    size: { width: 80, height: 30 },
    priority: 'P1',
    round: '第2轮水塔',
    tags: ['water-tower', 'flashlight', 'tool'],
  },
  {
    id: 'water-tower-old-photo',
    scene: 'water-tower',
    object: 'old-photo',
    file: 'item-water-tower-old-photo.png',
    displayName: '孤儿院老照片',
    description: '模糊的孤儿院时期合影。',
    size: { width: 80, height: 60 },
    priority: 'P1',
    round: '第2轮水塔',
    tags: ['water-tower', 'photo', 'orphanage', 'past'],
  },
  {
    id: 'water-tower-engraving',
    scene: 'water-tower',
    object: 'engraving',
    file: 'item-water-tower-engraving.png',
    displayName: '水塔墙刻痕',
    description: '墙上的刻痕写着“文穗 第X次来”。',
    size: { width: 120, height: 80 },
    priority: 'P1',
    round: '第2轮+',
    tags: ['water-tower', 'engraving', 'loop', 'fumi'],
  },
  {
    id: 'bedroom-medicine-bottle-clear',
    scene: 'bedroom',
    object: 'medicine-bottle-clear',
    file: 'item-bedroom-medicine-bottle-clear.png',
    displayName: '清晰标签药瓶',
    description: '标签清晰可见“利培酮”。',
    size: { width: 60, height: 100 },
    priority: 'P2',
    round: '第4轮+',
    tags: ['bedroom', 'medicine', 'truth'],
  },
  {
    id: 'bedroom-strawberry-hairtie',
    scene: 'bedroom',
    object: 'strawberry-hairtie',
    file: 'item-bedroom-strawberry-hairtie.png',
    displayName: '草莓发绳',
    description: '粉色发绳，带小草莓装饰。',
    size: { width: 80, height: 60 },
    priority: 'P2',
    round: '文穗房间',
    tags: ['bedroom', 'fumi', 'hairtie', 'memory'],
  },
  {
    id: 'bedroom-apron',
    scene: 'bedroom',
    object: 'apron',
    file: 'item-bedroom-apron.png',
    displayName: '绿色围裙',
    description: '有补丁的绿色围裙，开局衣柜中缺少。',
    size: { width: 100, height: 140 },
    priority: 'P2',
    round: '文穗衣柜',
    tags: ['bedroom', 'apron', 'absence'],
  },
  {
    id: 'player-line-torn-letter',
    scene: 'player-line',
    object: 'torn-letter',
    file: 'item-player-line-torn-letter.png',
    displayName: '文穗的碎信',
    description: '被撕碎的纸片，碎片可以拼合。',
    size: { width: 120, height: 80 },
    priority: 'P2',
    round: '第4轮玩家线',
    tags: ['player-line', 'letter', 'fumi', 'truth'],
  },
  {
    id: 'old-man-room-altar-list',
    scene: 'old-man-room',
    object: 'altar-list',
    file: 'item-old-man-room-altar-list.png',
    displayName: '阳极地名单',
    description: '祭坛旁的手写名单，文穗名字在列。',
    size: { width: 100, height: 140 },
    priority: 'P2',
    round: '第4轮老头线',
    tags: ['old-man-room', 'altar', 'occult', 'truth'],
  },
  {
    id: 'detective-inn-scratch-mark',
    scene: 'detective-inn',
    object: 'scratch-mark',
    file: 'item-detective-inn-scratch-mark.png',
    displayName: '侦探A手上的抓痕',
    description: '侦探A手上的抓痕特写。',
    size: { width: 60, height: 80 },
    priority: 'P2',
    round: '第4轮侦探线',
    tags: ['detective-inn', 'injury', 'detective-a'],
  },
];

export function getItemsForScene(scene: string): ItemAsset[] {
  return itemAssets.filter(item => item.scene === scene);
}

export function getItemScenes(): string[] {
  return [...new Set(itemAssets.map(item => item.scene))];
}

export function getItemPromptCatalog(scene?: string): string {
  const source = scene ? getItemsForScene(scene) : itemAssets;
  return source
    .map(item => `- ${item.id}: ${item.displayName} (${item.file}) - ${item.description}`)
    .join('\n');
}

export function getItemById(id: string): ItemAsset | undefined {
  return itemAssets.find(item => item.id === id);
}

export function getItemByReference(reference: string | null | undefined): ItemAsset | undefined {
  if (!reference) return undefined;
  const normalized = normalizeItemReference(reference);
  return itemAssets.find(item => {
    return [
      item.id,
      item.file,
      item.file.replace(/\.[^.]+$/, ''),
      item.object,
      item.displayName,
    ].some(value => normalizeItemReference(value) === normalized);
  });
}

function normalizeItemReference(value: string): string {
  return value.trim().toLowerCase().replace(/\.[^.]+$/, '').replace(/^item-/, '').replace(/\s+/g, '');
}
