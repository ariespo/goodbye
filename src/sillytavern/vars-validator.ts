import { getVariablePath } from './vars-merger';

/** 数值字段规则: [最小值, 最大值, 单回合最大变化幅度] */
type NumericRule = { min: number; max: number; maxDelta: number; noDecrease?: boolean };

const NUMERIC_RULES: Record<string, NumericRule> = {
  stamina: { min: 0, max: 120, maxDelta: 30 },
  sanity: { min: 0, max: 100, maxDelta: 15 },
  tripProgress: { min: 0, max: 100, maxDelta: 25, noDecrease: true },
  'suspicion.old-man': { min: 0, max: 50, maxDelta: 15 },
  'suspicion.detective-a': { min: 0, max: 50, maxDelta: 15 },
  'suspicion.detective-b': { min: 0, max: 50, maxDelta: 15 },
  'suspicion.self': { min: 0, max: 50, maxDelta: 15 },
  'suspicion.clerk': { min: 0, max: 25, maxDelta: 15 },
  'suspicion.teacher': { min: 0, max: 25, maxDelta: 15 },
  'suspicion.senpai': { min: 0, max: 49, maxDelta: 15 },
  'affinity.fumi': { min: 0, max: 100, maxDelta: 15 },
  'affinity.touko': { min: 0, max: 100, maxDelta: 15 },
  'investigation.psych': { min: 0, max: 100, maxDelta: 25 },
  'investigation.crime': { min: 0, max: 100, maxDelta: 25 },
  'investigation.occult': { min: 0, max: 100, maxDelta: 25 },
  'investigation.science': { min: 0, max: 100, maxDelta: 25 },
};

/** 字符串数组字段(合并时去重并集,LLM 无法删除已有条目) */
const STRING_ARRAY_KEYS = new Set([
  'unlockedClues',
  'organizedClues',
  'cultClues',
  'worldGlitchClues',
  'fakeEvidence',
  'letterFragments',
]);

/** 自由写入字段 */
const FREE_KEYS = new Set(['location', 'time', 'mysteryKnowledge']);

/** 程序专有字段: LLM 输出中一律剥除(由轮回结算/程序逻辑维护) */
const PROGRAM_OWNED_KEYS = new Set([
  'cycleCount',
  'stayStreak',
  'stayedEver',
  'routesLockedEver',
  'endingsSeen',
  'knowledgeEvents',
  'playerNameKnownByNpcIds',
  'worldMemory',
  'lockedRoute',
  'overlay',
  'finalChoice',
  'loopSuspicionStart',
]);

export interface SanitizeResult {
  /** 校验后的安全 patch(扁平 dot-path 键) */
  vars: Record<string, any>;
  /** 被拒绝的键及原因 */
  rejected: { path: string; reason: string }[];
  /** 被钳制的键(值被修正) */
  clamped: { path: string; from: number; to: number }[];
}

/** 将嵌套对象展开为 dot-path 扁平结构(数组视为叶子) */
function flatten(patch: Record<string, any>, prefix = '', out: Record<string, any> = {}): Record<string, any> {
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * 校验 LLM 输出的 <vars> patch。
 * 白名单过滤 → 数值范围/增幅钳制；路线、解释层与最终选择只允许程序写入。
 */
export function sanitizeVarsPatch(
  patch: Record<string, any>,
  current: Record<string, any>,
): SanitizeResult {
  const flat = flatten(patch ?? {});
  const vars: Record<string, any> = {};
  const rejected: SanitizeResult['rejected'] = [];
  const clamped: SanitizeResult['clamped'] = [];

  for (const [path, value] of Object.entries(flat)) {
    const root = path.split('.')[0];

    if (PROGRAM_OWNED_KEYS.has(root)) {
      rejected.push({ path, reason: '程序专有字段，禁止编剧写入' });
      continue;
    }
    if (NUMERIC_RULES[path]) {
      const rule = NUMERIC_RULES[path];
      const next = Number(value);
      if (!Number.isFinite(next)) {
        rejected.push({ path, reason: '不是有效数值' });
        continue;
      }
      const prev = Number(getVariablePath(current, path) ?? 0);
      let result = next;
      if (Math.abs(next - prev) > rule.maxDelta) {
        result = prev + Math.sign(next - prev) * rule.maxDelta;
      }
      if (path.startsWith('suspicion.') && result > prev) {
        const actorId = path.slice('suspicion.'.length);
        const rawBaseline = Number(getVariablePath(current, `loopSuspicionStart.${actorId}`));
        const baseline = Number.isFinite(rawBaseline) ? rawBaseline : prev;
        // Never reduce a migrated save that already exceeds the new budget.
        result = Math.min(result, Math.max(prev, baseline + 15));
      }
      if (rule.noDecrease && result < prev) result = prev;
      result = Math.min(rule.max, Math.max(rule.min, result));
      if (result !== next) clamped.push({ path, from: next, to: result });
      vars[path] = result;
      continue;
    }
    if (STRING_ARRAY_KEYS.has(path)) {
      if (!Array.isArray(value)) {
        rejected.push({ path, reason: '必须是字符串数组' });
        continue;
      }
      vars[path] = value.filter(item => typeof item === 'string');
      continue;
    }
    if (FREE_KEYS.has(path)) {
      vars[path] = value;
      continue;
    }
    rejected.push({ path, reason: '不在字段白名单中' });
  }

  return { vars, rejected, clamped };
}
