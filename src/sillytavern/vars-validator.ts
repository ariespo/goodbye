import { getVariablePath, mergeVariables } from './vars-merger';

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
const FREE_KEYS = new Set(['location', 'time', 'finalChoice', 'mysteryKnowledge']);

/** 程序专有字段: LLM 输出中一律剥除(由轮回结算/程序逻辑维护) */
const PROGRAM_OWNED_KEYS = new Set([
  'cycleCount',
  'stayStreak',
  'stayedEver',
  'routesLockedEver',
  'endingsSeen',
  'knowledgeEvents',
]);

/** 需前置条件验证的字段 */
const GATED_KEYS = new Set(['lockedRoute', 'overlay']);

const ROUTE_LOCK_REQUIREMENTS: Record<string, (state: Record<string, any>) => boolean> = {
  A: state => Number(getVariablePath(state, 'suspicion.old-man') ?? 0) >= 50,
  B: state => Number(getVariablePath(state, 'suspicion.detective-a') ?? 0) >= 50
    || Number(getVariablePath(state, 'suspicion.detective-b') ?? 0) >= 50,
  C: state => Number(getVariablePath(state, 'suspicion.self') ?? 0) >= 50,
  NONE: state => arrayLen(state.letterFragments) >= 3
    && Number(state.tripProgress ?? 0) >= 100
    && ['old-man', 'detective-a', 'detective-b', 'self']
      .every(actor => Number(getVariablePath(state, `suspicion.${actor}`) ?? 0) < 50),
  FAKE: state => arrayLen(state.fakeEvidence) >= 3,
};

const OVERLAY_REQUIREMENTS: Record<string, (state: Record<string, any>) => boolean> = {
  CULT: state => state.lockedRoute === 'A'
    && Number(state.cycleCount ?? 1) >= 4
    && arrayLen(state.cultClues) >= 3,
  PSYCH: state => state.lockedRoute === 'C'
    && Number(state.sanity ?? 100) < 20
    && arrayLen(state.worldGlitchClues) >= 3,
};

function arrayLen(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

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
 * 白名单过滤 → 数值范围/增幅钳制 → lockedRoute/overlay 前置条件验证。
 */
export function sanitizeVarsPatch(
  patch: Record<string, any>,
  current: Record<string, any>,
): SanitizeResult {
  const flat = flatten(patch ?? {});
  const vars: Record<string, any> = {};
  const rejected: SanitizeResult['rejected'] = [];
  const clamped: SanitizeResult['clamped'] = [];
  const gated: Record<string, any> = {};

  for (const [path, value] of Object.entries(flat)) {
    const root = path.split('.')[0];

    if (PROGRAM_OWNED_KEYS.has(root)) {
      rejected.push({ path, reason: '程序专有字段，禁止编剧写入' });
      continue;
    }
    if (GATED_KEYS.has(path)) {
      gated[path] = value;
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

  // 锁路线/解释层验证: 基于"当前状态 + 本回合已接受的字段"判断前置条件
  if (Object.keys(gated).length > 0) {
    const candidate = mergeVariables(current, vars);

    const route = gated.lockedRoute;
    if (route !== undefined) {
      if (candidate.lockedRoute && candidate.lockedRoute !== route) {
        rejected.push({ path: 'lockedRoute', reason: `路线 ${candidate.lockedRoute} 已锁定，不可改写` });
      } else if (typeof route === 'string' && ROUTE_LOCK_REQUIREMENTS[route]) {
        if (ROUTE_LOCK_REQUIREMENTS[route](candidate)) {
          vars.lockedRoute = route;
          candidate.lockedRoute = route;
        } else {
          rejected.push({ path: 'lockedRoute', reason: `路线 ${route} 的锁定前置条件未满足` });
        }
      } else {
        rejected.push({ path: 'lockedRoute', reason: `未知路线 ${String(route)}` });
      }
    }

    const overlay = gated.overlay;
    if (overlay !== undefined) {
      if (typeof overlay === 'string' && OVERLAY_REQUIREMENTS[overlay]) {
        if (OVERLAY_REQUIREMENTS[overlay](candidate)) {
          vars.overlay = overlay;
        } else {
          rejected.push({ path: 'overlay', reason: `解释层 ${overlay} 的叠加条件未满足` });
        }
      } else {
        rejected.push({ path: 'overlay', reason: `未知解释层 ${String(overlay)}` });
      }
    }
  }

  return { vars, rejected, clamped };
}
