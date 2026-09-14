import { describe, expect, it } from 'vitest';
import { buildActionAuditRequirements, validateActionAudit, type ActionAudit } from './action-audit';
import { resolveAction } from '../../engine/action-resolution';
import type { WriterPacket } from './types';

function packet(extra = false): WriterPacket {
  const steps = [{ id: 'ask', kind: 'inquiry' as const, scope: 'normal' as const, locationId: 'senpai-building' },
    ...(extra ? [{ id: 'follow', kind: 'investigation' as const, scope: 'normal' as const, locationId: 'school' }] : [])];
  return { actionIntentAudit: { originalInput: '问灯织，文穗有没有回复她', startLocationId: 'senpai-building',
    planGoal: '询问回复情况', plannedLocations: ['senpai-building'], plannedNpcIds: ['touko'], approvedSteps: steps,
    requestedStepCount: 1, extensionStepCount: extra ? 1 : 0, executedSteps: [] },
    resolvedAction: resolveAction({ id: 'action', cycleCount: 1, startTime: '2024-09-09T08:00:00', currentLocationId: 'senpai-building',
      stamina: 100, sanity: 70, steps: steps.map(step => ({ ...step, completionSourceIds: [] })) }) } as WriterPacket;
}
const text = '文穗有没有回复你？\n我不想回答这个问题。\n你没有得到回答，只能暂时收起手机。';
function passing(requirements: NonNullable<ReturnType<typeof buildActionAuditRequirements>>): ActionAudit {
  return { originalRequest: { status: requirements.originalRequest.applicable ? 'pass' : 'not-applicable', quote: requirements.originalRequest.applicable ? text : '', reason: '原问题已提出，拒答清楚可见。' },
    followThrough: { status: requirements.followThrough.applicable ? 'pass' : 'not-applicable', quote: requirements.followThrough.applicable ? text : '', reason: '按实际执行适用。' },
    segments: requirements.segments.map(segment => ({ segmentId: segment.segmentId, status: segment.applicable ? 'pass' : 'not-applicable', quote: segment.applicable ? text : '', reason: '只核实际过程。' })) };
}
describe('structured action audit', () => {
  it.each(['originalRequest', 'followThrough', 'segment'])('rejects a non-string status in %s as invalid report metadata', field => {
    const requirements = buildActionAuditRequirements(packet(true))!;
    const malformed = { status: ['pass'], quote: '', reason: 'Malformed model output must be corrected.' };
    const audit = { ...passing(requirements),
      ...(field === 'segment'
        ? { segments: passing(requirements).segments.map(segment => ({ ...segment, ...malformed })) }
        : { [field]: malformed }) };
    expect(validateActionAudit(audit, requirements, text)).toMatchObject({ approved: false, metadataValid: false });
  });
  it('requires explicit request coverage even when every written assertion passed', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    expect(validateActionAudit(undefined, requirements, text).approved).toBe(false);
    const audit = passing(requirements);
    audit.originalRequest = { status: 'fail', quote: '', reason: '正文只有安抚，没有提出原问题，也没有回答。' };
    expect(validateActionAudit(audit, requirements, text).violations).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'scene-contract-violation' })]));
  });
  it('accepts an evidenced refusal without demanding an invented reply', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    expect(validateActionAudit(passing(requirements), requirements, text).approved).toBe(true);
  });
  it('rejects invented quotations and inapplicable status used to skip requested work', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = passing(requirements);
    audit.originalRequest.quote = '她今天没有回复。';
    expect(validateActionAudit(audit, requirements, text).approved).toBe(false);
    audit.originalRequest = { status: 'not-applicable', quote: '', reason: '只有普通聊天。' };
    expect(validateActionAudit(audit, requirements, text).approved).toBe(false);
  });
  it('requires complete nonduplicated program segment IDs', () => {
    const requirements = buildActionAuditRequirements(packet(true))!;
    for (const segments of [[], [passing(requirements).segments[0], passing(requirements).segments[0]],
      [...passing(requirements).segments, { ...passing(requirements).segments[0], segmentId: 'invented' }]]) {
      expect(validateActionAudit({ ...passing(requirements), segments }, requirements, text).approved).toBe(false);
    }
  });
  it('associates automatic travel with the executed follow-up source step', () => {
    const requirements = buildActionAuditRequirements(packet(true))!;
    expect(requirements.followThrough).toMatchObject({ applicable: true, segmentIds: ['segment:1', 'segment:2'] });
    expect(requirements.segments.map(segment => segment.isExtension)).toEqual([false, true, true]);
  });
  it('does not require an unexecuted follow-up or a completed result from partial work', () => {
    const value = packet(true);
    value.resolvedAction = resolveAction({ id: 'short', cycleCount: 1, startTime: '2024-09-09T08:00:00', currentLocationId: 'senpai-building',
      stamina: 100, sanity: 70, explicitBudgetMinutes: 5,
      steps: value.actionIntentAudit!.approvedSteps!.map(step => ({ ...step, completionSourceIds: [] })) });
    const requirements = buildActionAuditRequirements(value)!;
    expect(requirements.followThrough.applicable).toBe(false);
    expect(requirements.originalRequest.hasCompletedRequestedWork).toBe(false);
    expect(requirements.segments[0]).toMatchObject({ applicable: true, completed: false, executedMinutes: 5 });
  });
  it('associates a program arrival interrupted before follow-up work with that extension', () => {
    const value = packet(true);
    const steps = value.actionIntentAudit!.approvedSteps!;
    value.resolvedAction = resolveAction({ id: 'arrival', cycleCount: 1, startTime: '2024-09-09T08:00:00', currentLocationId: 'senpai-building',
      stamina: 100, sanity: 70, explicitBudgetMinutes: 56,
      steps: [steps[0], { id: 'arrival:1:school', kind: 'travel' as const, scope: 'normal' as const, locationId: 'school' }, steps[1]]
        .map(step => ({ ...step, completionSourceIds: [] })) });
    const requirements = buildActionAuditRequirements(value)!;
    expect(requirements.followThrough).toEqual({ applicable: true, segmentIds: ['segment:1'] });
    expect(requirements.segments[1]).toMatchObject({ kind: 'travel', completed: false, isExtension: true });
  });
  it('does not force action audits for auxiliary or legacy packets', () => {
    expect(buildActionAuditRequirements(packet(), 'auxiliary')).toBeNull();
    expect(buildActionAuditRequirements({ resolvedAction: packet().resolvedAction } as WriterPacket)).toBeNull();
    expect(validateActionAudit(undefined, null, text).approved).toBe(true);
  });
  it('requires not-applicable for an event and zero-minute segments', () => {
    const value = packet();
    value.resolvedAction = resolveAction({ id: 'event', cycleCount: 1, startTime: '2024-09-09T16:00:00', currentLocationId: 'senpai-building', stamina: 100, sanity: 70,
      steps: [{ id: 'death', kind: 'event', scope: 'normal', locationId: 'senpai-building', eventId: 'death-news', completionSourceIds: [] }] });
    const requirements = buildActionAuditRequirements(value)!;
    expect(requirements.originalRequest.applicable).toBe(false);
    expect(requirements.segments[0].applicable).toBe(false);
    expect(validateActionAudit(passing(requirements), requirements, '').approved).toBe(true);
    const invalid = passing(requirements);
    invalid.segments[0] = { ...invalid.segments[0], status: 'pass', quote: text };
    expect(validateActionAudit(invalid, requirements, text).approved).toBe(false);
  });
});
