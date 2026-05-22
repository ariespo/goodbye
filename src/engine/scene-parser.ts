import type { Scene, SceneLine, Mood } from '../sillytavern/types';

/**
 * GalGame 风格的 maintext 解析器。
 *
 * 输入格式(每行一个指令,字段用全角或半角 | 分隔):
 *   场景|<场景名>
 *   音乐|<音乐名>
 *   对话|<人物名>|<情绪>|<对话内容>
 *
 * 同一组场景/音乐下可有多段对话(只在变化时声明)。
 * 人物名 = "旁白" 时,渲染时不显示角色名和立绘。
 *
 * 支持 XML 标签提取:
 *   <observe> 五感观察内容 </observe>
 *   <investigate> 调查列表 (desc|suspect|style|time|stamina|sanity) </investigate>
 *   <action> 行动列表 (desc|style|time|stamina|sanity) </action>
 */

const EMOTION_MAP: Record<string, Mood> = {
  calm: 'calm', 平静: 'calm', 普通: 'calm', 正常: 'calm', 中性: 'calm',
  horror: 'horror', 恐惧: 'horror', 惊恐: 'horror', 害怕: 'horror', 惊吓: 'horror',
  insane: 'insane', 疯狂: 'insane', 癫狂: 'insane', 错乱: 'insane',
  sad: 'sad', 悲伤: 'sad', 难过: 'sad', 沮丧: 'sad', 哭泣: 'sad',
  angry: 'angry', 愤怒: 'angry', 生气: 'angry', 暴怒: 'angry',
  happy: 'happy', 开心: 'happy', 高兴: 'happy', 喜悦: 'happy', 微笑: 'happy',
};

function normalizeEmotion(raw: string | undefined): Mood {
  if (!raw) return 'calm';
  const key = raw.trim().toLowerCase();
  return EMOTION_MAP[key] || EMOTION_MAP[raw.trim()] || 'calm';
}

function splitFields(line: string): string[] {
  // 支持半角 | 和全角 |
  return line.split(/[|｜]/).map(s => s.trim());
}

/** 从文本中提取 XML 标签内容，返回清理后的文本和提取的标签数据 */
function extractXmlTags(text: string): {
  cleanText: string;
  observe?: string;
  investigateItems?: Scene['investigateItems'];
  actionItems?: Scene['actionItems'];
} {
  const result: ReturnType<typeof extractXmlTags> = { cleanText: text };

  // <observe>...内容...</observe>
  const observeMatch = text.match(/<observe>([\s\S]*?)<\/observe>/);
  if (observeMatch) {
    result.observe = observeMatch[1].trim();
  }

  // <investigate>...内容...</investigate>
  const investigateMatch = text.match(/<investigate>([\s\S]*?)<\/investigate>/);
  if (investigateMatch) {
    result.investigateItems = investigateMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [desc, suspect, style, time, stamina, sanity] = splitFields(line);
        return {
          desc: desc || '',
          suspect: suspect || '无',
          style: style || '现实',
          time: time || '0分钟',
          stamina: parseInt(stamina, 10) || 0,
          sanity: parseInt(sanity, 10) || 0,
        };
      });
  }

  // <action>...内容...</action>
  const actionMatch = text.match(/<action>([\s\S]*?)<\/action>/);
  if (actionMatch) {
    result.actionItems = actionMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [desc, style, time, stamina, sanity] = splitFields(line);
        return {
          desc: desc || '',
          style: style || '现实',
          time: time || '0分钟',
          stamina: parseInt(stamina, 10) || 0,
          sanity: parseInt(sanity, 10) || 0,
        };
      });
  }

  // 移除 XML 标签得到干净文本
  result.cleanText = text
    .replace(/<observe>[\s\S]*?<\/observe>/g, '')
    .replace(/<investigate>[\s\S]*?<\/investigate>/g, '')
    .replace(/<action>[\s\S]*?<\/action>/g, '')
    .trim();

  return result;
}

export function maintextToScene(maintext: string): Scene {
  // 先提取 XML 标签
  const { cleanText, observe, investigateItems, actionItems } = extractXmlTags(maintext);

  const lines: SceneLine[] = [];

  // 当前上下文(被后续 对话| 行继承)
  let currentBackground: string | undefined;
  let currentBgm: string | undefined;

  for (const rawLine of cleanText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = splitFields(line);
    const head = fields[0];

    if (head === '场景' || head === 'scene') {
      if (fields[1]) currentBackground = fields[1];
      continue;
    }

    if (head === '音乐' || head === 'bgm' || head === 'music') {
      if (fields[1]) currentBgm = fields[1];
      continue;
    }

    if (head === '对话' || head === 'dialog' || head === 'dialogue') {
      const speaker = fields[1] || '旁白';
      const emotion = normalizeEmotion(fields[2]);
      const text = fields.slice(3).join('|').trim() || '';
      if (!text) continue;
      lines.push({
        background: currentBackground,
        bgm: currentBgm,
        speaker,
        emotion,
        text,
        character: speaker === '旁白' ? undefined : speakerToCharacterAsset(speaker, emotion),
      });
      continue;
    }

    // 兼容:如果不是指令前缀,把整行当旁白
    lines.push({
      background: currentBackground,
      bgm: currentBgm,
      speaker: '旁白',
      emotion: 'calm',
      text: line,
    });
  }

  return {
    id: crypto.randomUUID(),
    lines,
    background: lines[0]?.background,
    bgm: lines[0]?.bgm,
    character: lines[0]?.character,
    mood: lines[0]?.emotion,
    observe,
    investigateItems,
    actionItems,
  };
}

const SPEAKER_SPRITE_MAP: Record<string, string> = {
  '文穂': 'fumi',
  'fumi': 'fumi',
  '緋室灯織': 'touko',
  'touko': 'touko',
};

/** 有独立立绘的情绪列表 */
const EMOTION_SPRITES: Mood[] = ['angry', 'happy', 'horror', 'insane', 'sad'];

/** 角色名 + 情绪 → 立绘文件名(无情绪立绘则回退到默认) */
function speakerToCharacterAsset(speaker: string, emotion?: Mood): string | undefined {
  const base = SPEAKER_SPRITE_MAP[speaker];
  if (!base) return undefined;
  if (emotion && EMOTION_SPRITES.includes(emotion)) {
    return `${base}-${emotion}.png`;
  }
  return `${base}-normal.png`;
}
