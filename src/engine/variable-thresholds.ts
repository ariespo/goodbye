import { getVariablePath } from '../sillytavern/vars-merger';

export interface SanityConstraint {
  optionCount: number;
  anomalyOptionCount: number;
}

interface SanityBand {
  min: number;
  writerDirective: string;
  directorDirective: string;
  constraint: SanityConstraint;
}

const SANITY_BANDS: SanityBand[] = [
  {
    min: 70,
    writerDirective: '理智正常：叙述冷静克制，客观描写环境与人物，不出现幻觉。',
    directorDirective: '理智正常：提供 4 个常规选项，不安排异常选项。',
    constraint: { optionCount: 4, anomalyOptionCount: 0 },
  },
  {
    min: 40,
    writerDirective: '理智下滑：叙述带明显主观色彩，偶尔穿插一闪而过的幻觉或错觉，但主角仍能分辨现实。',
    directorDirective: '理智下滑：提供 4 个选项，其中恰好 1 个是受幻觉/执念驱动的异常选项。',
    constraint: { optionCount: 4, anomalyOptionCount: 1 },
  },
  {
    min: 20,
    writerDirective: '理智濒危：叙述破碎、跳跃，频繁出现幻觉，现实与幻觉边界模糊，句式短促不连贯。',
    directorDirective: '理智濒危：只提供 3 个选项，其中 1 个是异常选项；选项措辞可带有不安感。',
    constraint: { optionCount: 3, anomalyOptionCount: 1 },
  },
  {
    min: 0,
    writerDirective: '理智崩溃：采用意识流写法，时间感错乱，幻觉与记忆碎片交织，几乎无法客观叙事。',
    directorDirective: '理智崩溃：只提供 3 个选项，其中 1 个是异常选项；整体节奏应逼近失控。',
    constraint: { optionCount: 3, anomalyOptionCount: 1 },
  },
];

const DEFAULTS = {
  sanity: 80,
  'affinity.fumi': 70,
  'affinity.touko': 40,
};

const SUSPICION_FOCUS = 26;
const SUSPICION_LOCK = 50;

const INVESTIGATION_LABELS: Record<string, string> = {
  psych: '心理侧写',
  crime: '刑侦推理',
  occult: '神秘学',
  science: '科学取证',
};

function readNumber(variables: Record<string, unknown>, path: string, fallback: number): number {
  const value = Number(getVariablePath(variables as Record<string, any>, path));
  return Number.isFinite(value) ? value : fallback;
}

function readRecord(variables: Record<string, unknown>, path: string): Record<string, number> {
  const raw = getVariablePath(variables as Record<string, any>, path);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    const num = Number(value);
    if (Number.isFinite(num)) result[key] = num;
  }
  return result;
}

function sanityBand(variables: Record<string, unknown>): SanityBand {
  const sanity = readNumber(variables, 'sanity', DEFAULTS.sanity);
  return SANITY_BANDS.find(band => sanity >= band.min) ?? SANITY_BANDS[SANITY_BANDS.length - 1];
}

export function getSanityConstraint(variables: Record<string, unknown>): SanityConstraint {
  return sanityBand(variables).constraint;
}

function fumiDirective(value: number): string {
  if (value >= 80) return '文穗对主角态度温情，主动关心，愿意袒露心事。';
  if (value >= 40) return '文穗对主角态度中性，日常相处但保留距离。';
  return '文穗对主角态度冷淡，回避交流，对话简短敷衍。';
}

function toukoDirective(value: number): string {
  if (value >= 80) return '灯织信任主角，会主动暗示"问题可能不在外面"，引导主角向内审视。';
  if (value >= 40) return '灯织对主角有所保留，言行透出"她在躲什么人"的痕迹，但不会明说。';
  return '灯织只维持表面客套，不透露任何私人信息。';
}

export function translateForWriter(variables: Record<string, unknown>): string {
  const lines = [
    sanityBand(variables).writerDirective,
    fumiDirective(readNumber(variables, 'affinity.fumi', DEFAULTS['affinity.fumi'])),
    toukoDirective(readNumber(variables, 'affinity.touko', DEFAULTS['affinity.touko'])),
  ];
  return `[叙事状态指令]\n${lines.map(line => `- ${line}`).join('\n')}`;
}

function suspicionLines(variables: Record<string, unknown>): string[] {
  const suspicion = readRecord(variables, 'suspicion');
  const focused = Object.entries(suspicion)
    .filter(([, value]) => value >= SUSPICION_FOCUS)
    .sort((a, b) => b[1] - a[1]);
  if (focused.length === 0) return ['嫌疑状态：尚无重点怀疑对象。'];
  return focused.map(([key, value]) =>
    value >= SUSPICION_LOCK
      ? `嫌疑状态：${key} 嫌疑值 ${value}，已达锁线门槛，可安排指认与路线收束节奏。`
      : `嫌疑状态：${key} 是重点怀疑对象（嫌疑值 ${value}）。`
  );
}

function investigationLines(variables: Record<string, unknown>): string[] {
  const investigation = readRecord(variables, 'investigation');
  const lines: string[] = [];
  for (const [key, value] of Object.entries(investigation)) {
    const label = INVESTIGATION_LABELS[key] ?? key;
    if (value >= 100) {
      lines.push(`调查进度：${label} 已达 100，可揭示该方向的完整动机。`);
    } else if (value >= 60) {
      lines.push(`调查进度：${label} 已达 ${value}，可触及笔记本深层内容。`);
    } else if (value >= 30) {
      lines.push(`调查进度：${label} 已达 ${value}，可解锁该方向的复盘视角。`);
    }
  }
  return lines;
}

export function translateForDirector(variables: Record<string, unknown>): string {
  const lines = [
    sanityBand(variables).directorDirective,
    ...suspicionLines(variables),
    ...investigationLines(variables),
  ];
  return lines.map(line => `- ${line}`).join('\n');
}
