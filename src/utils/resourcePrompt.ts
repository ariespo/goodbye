import { backgroundAssets, getCanonicalBackgroundId } from '../data/backgroundAssets';
import { characterCatalog } from '../data/characterCatalog';
import {
  buildPlayerKnowledgeBrief,
  getPlayerEntities,
  type PlayerEntityPresentation,
} from '../data/playerKnowledge';
import { getItemsForBackground } from './itemAssetMatch';

/** 每个地点可解锁的背景 id(含昼夜与内部场景) */
const LOCATION_BACKGROUND_IDS: Record<string, string[]> = {
  home: ['home', 'home-day', 'home-night', 'bedroom1', 'bedroom1-day', 'bedroom1-night'],
  school: ['school', 'school-day', 'school-night'],
  supermarket: ['supermarket', 'supermarket-day', 'supermarket-night'],
  'senpai-building': ['senpai-building', 'senpai-room'],
  'old-man-building': ['old-man-building', 'old-man-room'],
  'mountain-trail': ['mountain-trail'],
  'detective-inn': ['detective-inn'],
  'water-tower': ['water-tower-exterior', 'water-tower'],
  'community-hospital': ['community-hospital'],
  'observation-deck': ['observation-deck'],
};

/** 与具体地点无关、始终可用的背景 */
const ALWAYS_AVAILABLE_BACKGROUND_IDS = ['black', 'opening-rain-black', 'street'];

/** 本回合可通过 discovery 首次登场的角色及其初始称呼 */
const DISCOVERY_ENTITY: Record<string, { entityId: string; name: string; subtitle: string }> = {
  'meet:touko': { entityId: 'touko', name: '灯织学姐', subtitle: '住在对面商住楼的学姐' },
  'meet:old-man': { entityId: 'old-man', name: '周大爷', subtitle: '独自住在麻将馆楼上的老人' },
  'meet:chen-huihui': { entityId: 'chen-huihui', name: '陈慧慧', subtitle: '社区便利店的店员' },
  'meet:liu-renguang': { entityId: 'liu-renguang', name: '刘仁光', subtitle: '文穗中学的体育老师' },
  'observe:shaved-man': { entityId: 'detective-a', name: '寸头男人', subtitle: '身份不明的陌生男人' },
  'observe:unknown-woman': { entityId: 'detective-b', name: '陌生女人', subtitle: '身份不明的女性' },
};

function spriteEntityId(spriteId: string): string | null {
  for (const entityId of ['fumi', 'touko', 'old-man', 'detective-a', 'detective-b', 'chen-huihui', 'liu-renguang']) {
    if (spriteId === entityId || spriteId.startsWith(`${entityId}-`)) return entityId;
  }
  return null;
}

function buildLocationLines(variables: Record<string, unknown>): string {
  const brief = buildPlayerKnowledgeBrief(variables);
  return brief.locations
    .map(location => {
      const note = location.stage === 'rumored'
        ? '(传闻，位置未确认，玩家不可前往)'
        : '';
      return `- ${location.id}: ${location.name}${note}`;
    })
    .join('\n');
}

function buildBackgroundLines(variables: Record<string, unknown>, currentBackground?: string | null): string {
  const brief = buildPlayerKnowledgeBrief(variables);
  const allowed = new Set(ALWAYS_AVAILABLE_BACKGROUND_IDS);
  for (const location of brief.locations) {
    if (!location.canTravel) continue;
    for (const id of LOCATION_BACKGROUND_IDS[location.id] ?? []) allowed.add(id);
  }
  if (currentBackground) allowed.add(currentBackground.replace(/\.[^.]+$/, ''));

  const canonicalIds = new Set<string>();
  return backgroundAssets
    .filter(background => allowed.has(background.id))
    .filter(background => {
      const canonical = getCanonicalBackgroundId(background.id);
      if (canonicalIds.has(canonical)) return false;
      canonicalIds.add(canonical);
      return true;
    })
    .map(background => {
      const canonical = getCanonicalBackgroundId(background.id);
      const displayName = background.displayName.replace(/（(?:默认)?(?:日间|夜间)）/g, '');
      const description = background.description.replace(/[；。]?兼容旧场景文本。?/g, '。');
      return `- ${canonical}: ${displayName} - ${description}`;
    })
    .join('\n');
}

function buildCharacterLines(variables: Record<string, unknown>): string {
  const entities = new Map<string, Pick<PlayerEntityPresentation, 'stage' | 'displayName' | 'subtitle'>>(
    getPlayerEntities(variables).map(entity => [entity.id, entity]),
  );
  const brief = buildPlayerKnowledgeBrief(variables);
  for (const discovery of brief.allowedDiscoveries) {
    const intro = DISCOVERY_ENTITY[discovery.eventId];
    if (intro && !entities.has(intro.entityId)) {
      entities.set(intro.entityId, { stage: 'observed', displayName: intro.name, subtitle: intro.subtitle });
    }
  }

  const lines: string[] = [];
  for (const sprite of characterCatalog) {
    const entityId = spriteEntityId(sprite.id);
    if (!entityId) continue;
    const entity = entities.get(entityId);
    if (!entity) continue;
    const revealed = entity.stage === 'introduced' || entity.stage === 'identified';
    const description = revealed ? sprite.description : `${entity.subtitle}。玩家未确认其身份，只能以“${entity.displayName}”称呼。`;
    lines.push(`- ${sprite.id}: ${entity.displayName} (${sprite.file}) - ${description}`);
  }
  return lines.length ? lines.join('\n') : '- 当前没有可登场的角色立绘。';
}

export function appendResourcePrompt(
  userInput: string,
  currentBackground?: string | null,
  variables: Record<string, unknown> = {},
): string {
  const scene = currentBackground || 'unknown';
  const sceneItems = getItemsForBackground(currentBackground);
  const itemLines = sceneItems.length
    ? sceneItems.map(item => `- ${item.id}: ${item.displayName} (${item.file}) - ${item.description}`).join('\n')
    : '- 当前场景没有登记物品。';

  return `${userInput}

[系统资源清单]
当前空间名：${getCanonicalBackgroundId(scene)}
如需切换场景，只能输出下面的空间名，格式为：场景|<空间名>。
不要输出图片文件名，也不要添加 -day 或 -night；程序会读取游戏时间自动选择昼夜背景：08:00-18:30 为白天，18:31-00:00 为黑夜。
清单只包含玩家当前已知晓的地点资源；未列出的场景一律不得切换或提及具体细节。
${buildBackgroundLines(variables, currentBackground)}

玩家当前已知的地图地点 id 如下。玩家所在地点保存在 location 变量中，必须使用这些精确 id。标注"传闻"的地点只能作为调查目标提及，不能让玩家前往；未列出的地点对玩家不存在：
${buildLocationLines(variables)}

当前场景可调用物品遵循 item-场景-物品 命名，调查或描述道具时优先使用下面文件名：
${itemLines}

可调用角色立绘如下(仅含玩家已认识或本回合允许登场的角色)；如需切换角色，输出格式为：角色|<立绘文件名>。必须使用清单中的玩家可见称呼，不得提前透露真实姓名或身份：
${buildCharacterLines(variables)}

对话行可选附带物品展示：对话|<人物>|<情绪>|<文本>|<物品id或文件名>。物品只在这一行居中显示，下一行自动消失；提到关键道具、照片、纸条、杯子等重要物品时优先使用。

可调用一次性全屏动效：lightning-flash、loop-transition。输出格式为：效果|<动效id>
[/系统资源清单]`;
}
