import { getLocationById } from '../data/locations';
import { resolveActionNarrativeContext, hasExplicitTravelIntent, isTravelOnlyIntent, splitPlayerActionClauses } from './action-narrative-context';

export interface ActionIntentSnapshot {
  version: 1;
  originalInput: string;
  startLocationId: string;
  steps: Array<{ kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait';
    scope: 'short' | 'normal' | 'deep'; locationId: string; targetNpcIds?: string[] }>;
}

export function resolvePlayerActionIntent(input: string, locationId: string, time: Date): ActionIntentSnapshot | null {
  if (!input.trim() || !getLocationById(locationId) || Number.isNaN(time.getTime())) return null;
  const clauses = splitPlayerActionClauses(input);
  if (!clauses.length || clauses.length > 8) return null;
  const steps: ActionIntentSnapshot['steps'] = [];
  let current = locationId;
  for (const clause of clauses) {
    if (clause.split(/[，,。；;！!\n]/u).some(part => hasExplicitTravelIntent(part)
      && !resolveActionNarrativeContext(part, time, 0, { currentLocationId: current }))) return null;
    const scene = resolveActionNarrativeContext(clause, time, 0, { currentLocationId: current });
    if (!scene && hasExplicitTravelIntent(clause)) return null;
    const destination = scene?.locationId ?? current;
    const actionText = clause.replace(/^(?:再|先)?(?:只用|只花|用|花)?[半一二两三四五六七八九十\d]+(?:分钟|小时)(?:来)?/u, '');
    const quietKind = actionText.match(/休息(?!室|时间|记录|地点|区|安排)|小睡|躺下|睡觉|等待(?!时间|记录)|等到|等[半一二两三四五六七八九十\d]/u);
    const quietAttempt = quietKind && !/不|别|没|取消|是否|能否|问|电话|回忆|调查|查看|检查|观察|搜查|翻找|了解|讨论|听说/u.test(actionText.slice(0, quietKind.index));
    const kind = quietAttempt && /休息|小睡|躺下|睡觉/.test(quietKind[0]) ? 'rest'
      : quietAttempt ? 'wait'
      : /搜查|翻找|搜寻/u.test(clause) ? 'search'
      : /调查|查看|检查|观察/u.test(clause) ? 'investigation'
      : /询问|打听|问|交谈|对话|聊|拜访|探访|找/u.test(clause) ? 'inquiry'
      : isTravelOnlyIntent(actionText) ? 'travel' : 'inquiry';
    const scope = /深入|彻底|全面|长时间|仔细搜查/u.test(clause) ? 'deep' : /简短|问一句|简单问|短暂/u.test(clause) ? 'short' : 'normal';
    const targetNpcIds = [
      [/周大爷|周德明/u, 'old-man'], [/陈慧慧/u, 'chen-huihui'], [/灯织|学姐/u, 'touko'],
      [/刘仁光|体育老师/u, 'liu-renguang'], [/门卫|老张/u, 'school-guard'],
    ].filter(([pattern]) => (pattern as RegExp).test(clause)).map(([, id]) => id as string);
    steps.push({ kind, scope, locationId: destination, ...(targetNpcIds.length ? { targetNpcIds } : {}) });
    current = destination;
  }
  return { version: 1, originalInput: input, startLocationId: locationId, steps };
}

/** Persisted bindings contain only intentions, never prices or earned outcomes. */
export function readActionIntentSnapshot(value: unknown): ActionIntentSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !['version', 'originalInput', 'startLocationId', 'steps'].includes(key))
    || v.version !== 1 || typeof v.originalInput !== 'string' || typeof v.startLocationId !== 'string'
    || !getLocationById(v.startLocationId) || !Array.isArray(v.steps) || !v.steps.length || v.steps.length > 8) return null;
  for (const raw of v.steps) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const step = raw as Record<string, unknown>;
    if (Object.keys(step).some(key => !['kind', 'scope', 'locationId', 'targetNpcIds'].includes(key))
      || !['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait'].includes(String(step.kind))
      || !['short', 'normal', 'deep'].includes(String(step.scope)) || !getLocationById(step.locationId)
      || (step.targetNpcIds !== undefined && (!Array.isArray(step.targetNpcIds) || step.targetNpcIds.some(id => typeof id !== 'string')))) return null;
  }
  const resolved = resolvePlayerActionIntent(v.originalInput, v.startLocationId, new Date('2024-09-09T08:00:00'));
  if (!resolved || resolved.steps.length !== v.steps.length) return null;
  return resolved.steps.every((step, index) => {
    const stored = (v.steps as Array<Record<string, unknown>>)[index];
    return step.kind === stored.kind && step.scope === stored.scope && step.locationId === stored.locationId
      && JSON.stringify(step.targetNpcIds ?? []) === JSON.stringify(stored.targetNpcIds ?? []);
  }) ? resolved : null;
}
