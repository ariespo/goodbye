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

export function maintextToScene(maintext: string): Scene {
  const lines: SceneLine[] = [];

  // 当前上下文(被后续 对话| 行继承)
  let currentBackground: string | undefined;
  let currentBgm: string | undefined;

  for (const rawLine of maintext.split(/\r?\n/)) {
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
        character: speaker === '旁白' ? undefined : speakerToCharacterAsset(speaker),
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
  };
}

/** 角色名 → 立绘文件名的默认推导(可被显式 character 字段覆盖) */
function speakerToCharacterAsset(speaker: string): string {
  return `${speaker}.png`;
}
