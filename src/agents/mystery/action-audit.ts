import type { FactReviewViolation, WriterPacket } from './types';
import type { ActionStep } from '../../engine/action-resolution';

export type ActionAuditStatus = 'pass' | 'fail' | 'not-applicable';
export interface ActionAuditJudgment {
  status: ActionAuditStatus;
  quote: string;
  reason: string;
}
export interface ActionAudit {
  originalRequest: ActionAuditJudgment;
  followThrough: ActionAuditJudgment;
  segments: Array<ActionAuditJudgment & { segmentId: string }>;
}
export interface ActionAuditRequirements {
  originalRequest: { applicable: boolean; originalInput: string; hasCompletedRequestedWork: boolean; segmentIds: string[] };
  followThrough: { applicable: boolean; segmentIds: string[] };
  segments: Array<{ segmentId: string; stepId: string; kind: ActionStep['kind']; locationId: string;
    executedMinutes: number; completed: boolean; applicable: boolean; isExtension: boolean }>;
  interruption?: { id: string; at: string };
}

function originalStepId(step: ActionStep): string {
  if (step.kind !== 'travel' || !step.id.startsWith('__travel__:')) return step.id;
  const parts = step.id.split(':');
  if (parts.length !== 5) return step.id;
  try { return decodeURIComponent(parts[4]); } catch { return step.id; }
}

/** Requirements come from settled work, never from the critic's applicability claims. */
export function buildActionAuditRequirements(packet: WriterPacket, mode: 'playable' | 'auxiliary' = 'playable'): ActionAuditRequirements | null {
  const intent = packet.actionIntentAudit;
  const resolution = packet.resolvedAction;
  if (mode === 'auxiliary' || !intent || !resolution) return null;
  const approved = intent.approvedSteps ?? [];
  const requested = intent.requestedStepCount;
  const extensionIds = new Set((intent.extensionStepCount ?? 0) > 0 && Number.isInteger(requested) && requested! >= 0
    ? approved.slice(requested).map(step => step.id) : []);
  const logicalIds = new Set(approved.map(step => step.id));
  const segments = resolution.segments.map((segment, index) => {
    let sourceId = originalStepId(segment.step);
    // A program-inserted arrival stage points to the following work stage. It
    // may only be in the continuation when the budget stopped during travel.
    if (segment.step.kind === 'travel' && !logicalIds.has(sourceId) && sourceId.startsWith('arrival:')) {
      const remaining = resolution.continuation?.steps ?? [];
      const activeIndex = remaining.findIndex(step => step.id === segment.step.id);
      const next = [...resolution.segments.slice(index + 1).map(part => part.step),
        ...(activeIndex >= 0 ? remaining.slice(activeIndex + 1) : [])]
        .find(step => logicalIds.has(originalStepId(step)));
      if (next?.locationId === segment.step.locationId) sourceId = originalStepId(next);
    }
    return { segmentId: `segment:${index}`, stepId: segment.step.id, kind: segment.step.kind,
      locationId: segment.step.locationId, executedMinutes: segment.executedMinutes, completed: segment.completed,
      applicable: segment.executedMinutes > 0 && !['event', 'fantasy'].includes(segment.step.kind),
      isExtension: extensionIds.has(sourceId) };
  });
  const original = segments.filter(segment => segment.applicable && !segment.isExtension);
  const followThrough = segments.filter(segment => segment.applicable && segment.isExtension);
  return {
    originalRequest: { applicable: original.length > 0, originalInput: intent.originalInput,
      hasCompletedRequestedWork: original.some(segment => segment.completed && ['inquiry', 'investigation', 'search'].includes(segment.kind)),
      segmentIds: original.map(segment => segment.segmentId) },
    followThrough: { applicable: followThrough.length > 0, segmentIds: followThrough.map(segment => segment.segmentId) },
    segments, ...(resolution.interruption ? { interruption: { ...resolution.interruption } } : {}),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Checks report coverage and authentic visible-maintext quotes; meaning is reviewed by the existing critic. */
export function validateActionAudit(audit: unknown, requirements: ActionAuditRequirements | null, visibleMaintext: string): {
  approved: boolean; metadataValid: boolean; metadataErrors: string[]; violations: FactReviewViolation[]; corrections: string[];
} {
  const violations: FactReviewViolation[] = [];
  const metadataErrors: string[] = [];
  const reject = (message: string) => metadataErrors.push(`actionAudit：${message}`);
  const finish = () => ({ approved: metadataErrors.length === 0 && violations.length === 0,
    metadataValid: metadataErrors.length === 0, metadataErrors, violations, corrections: violations.map(item => item.message) });
  if (!requirements) return finish();
  if (!record(audit)) {
    reject('缺少完整 actionAudit，不能用已写句子的事实审查代替原请求与过程落实审查。');
    return finish();
  }
  const check = (value: unknown, applicable: boolean, label: string) => {
    if (!record(value) || typeof value.status !== 'string' || !['pass', 'fail', 'not-applicable'].includes(value.status)
      || typeof value.quote !== 'string' || typeof value.reason !== 'string' || !value.reason.trim()) {
      reject(`${label} 缺少合法 status、quote 或具体 reason。`);
      return;
    }
    if (applicable && value.status === 'not-applicable') reject(`${label} 已实际执行，不能跳过审查。`);
    if (!applicable && value.status !== 'not-applicable') reject(`${label} 未执行或属于事件，不应要求新的行动过程/结果。`);
    if (value.status === 'pass' && !value.quote.trim()) reject(`${label} 的 pass 缺少正文引文。`);
    if (value.quote && !visibleMaintext.includes(value.quote)) reject(`${label} 引文不在实际可见正文中，不得引用选项、摘要、计划或编造引文。`);
    if (value.status === 'fail') violations.push({ code: 'scene-contract-violation', message: `行动审查：${label} 未落实：${value.reason}` });
  };
  check(audit.originalRequest, requirements.originalRequest.applicable, 'originalRequest 原请求');
  check(audit.followThrough, requirements.followThrough.applicable, 'followThrough 后续行动');
  if (!Array.isArray(audit.segments)) {
    reject('segments 必须逐项返回程序指定的全部 segmentId。');
    return finish();
  }
  const expected = new Map(requirements.segments.map(segment => [segment.segmentId, segment]));
  const seen = new Set<string>();
  for (const item of audit.segments) {
    if (!record(item) || typeof item.segmentId !== 'string' || !expected.has(item.segmentId) || seen.has(item.segmentId)) {
      reject('segments 存在未知、缺失或重复的 segmentId。');
      continue;
    }
    seen.add(item.segmentId);
    check(item, expected.get(item.segmentId)!.applicable, item.segmentId);
  }
  for (const id of expected.keys()) if (!seen.has(id)) reject(`segments 漏审 ${id}。`);
  return finish();
}
