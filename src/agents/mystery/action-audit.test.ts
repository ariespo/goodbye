import { describe, expect, it } from 'vitest';
import { buildActionAuditRequirements, resolveActionAuditReferences, validateActionAudit, type ActionAudit } from './action-audit';
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

const visibleLines = text.split('\n');
const nonadjacentQuote = '文穗有没有回复你？\n你没有得到回答，只能暂时收起手机。';
function compactPassing(requirements: NonNullable<ReturnType<typeof buildActionAuditRequirements>>) {
  const audit = passing(requirements);
  const compact = (judgment: ActionAudit['originalRequest']) => ({ status: judgment.status,
    evidenceLineIndices: judgment.status === 'pass' ? [0, 2] : [], reason: judgment.reason });
  return { originalRequest: compact(audit.originalRequest), followThrough: compact(audit.followThrough),
    segments: audit.segments.map(segment => ({ ...compact(segment), segmentId: segment.segmentId })) };
}
describe('structured action audit', () => {
  it('hydrates non-adjacent current lines for every judgment without changing the wire report', () => {
    const requirements = buildActionAuditRequirements(packet(true))!;
    const compact = compactPassing(requirements);
    const normalized = resolveActionAuditReferences(compact, visibleLines) as ActionAudit;
    expect(normalized.originalRequest).toMatchObject({ status: 'pass', evidenceLineIndices: [0, 2], quote: nonadjacentQuote });
    expect(normalized.followThrough.quote).toBe(nonadjacentQuote);
    expect(normalized.segments.map(segment => segment.quote)).toEqual([nonadjacentQuote, nonadjacentQuote, nonadjacentQuote]);
    expect(compact.originalRequest).not.toHaveProperty('quote');
    expect(validateActionAudit(normalized, requirements, text, visibleLines)).toMatchObject({ approved: true, metadataValid: true });
  });
  it('validates indexed evidence per line instead of requiring a contiguous quotation', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = passing(requirements);
    audit.originalRequest = { ...audit.originalRequest, quote: nonadjacentQuote, evidenceLineIndices: [0, 2] };
    expect(validateActionAudit(audit, requirements, text, visibleLines)).toMatchObject({ approved: true, metadataValid: true });
  });
  it.each([
    ['non-array', '0'], ['negative', [-1]], ['fractional', [0.5]], ['string', ['0']],
    ['unsafe integer', [Number.MAX_SAFE_INTEGER + 1]], ['out of range', [3]],
    ['duplicate', [0, 0]], ['descending', [2, 0]], ['empty pass', []],
  ])('rejects %s line references during normalization and validation', (_label, evidenceLineIndices) => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '必须由当前正文支持。', quote: text, evidenceLineIndices,
    } };
    expect(validateActionAudit(audit, requirements, text, visibleLines)).toMatchObject({ approved: false, metadataValid: false });
    expect(() => resolveActionAuditReferences(audit, visibleLines)).toThrow(/actionAudit\.originalRequest\.evidenceLineIndices/);
  });
  it.each(['originalRequest', 'followThrough', 'segment'])('rejects malformed references in %s', field => {
    const requirements = buildActionAuditRequirements(packet(true))!;
    const audit = compactPassing(requirements);
    if (field === 'segment') audit.segments[0].evidenceLineIndices = [3];
    else audit[field as 'originalRequest' | 'followThrough'].evidenceLineIndices = [3];
    expect(() => resolveActionAuditReferences(audit, visibleLines)).toThrow(/evidenceLineIndices/);
  });
  it('rejects a fabricated quote even when valid indices are also supplied', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '不能让回填覆盖矛盾证据。', evidenceLineIndices: [0], quote: '她今天没有回复。',
    } };
    expect(() => resolveActionAuditReferences(audit, visibleLines)).toThrow(/actionAudit\.originalRequest\.quote/);
    expect(validateActionAudit(audit, requirements, text, visibleLines)).toMatchObject({ approved: false, metadataValid: false });
  });
  it('rejects authentic text that does not match the supplied line indices', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '引用行号必须对应引文。', evidenceLineIndices: [0], quote: '我不想回答这个问题。',
    } };
    expect(validateActionAudit(audit, requirements, text, visibleLines)).toMatchObject({ approved: false, metadataValid: false });
    expect(() => resolveActionAuditReferences(audit, visibleLines)).toThrow(/actionAudit\.originalRequest\.quote/);
  });
  it('accepts an already normalized quotation only when it exactly matches the indexed lines', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '已按行回填。', evidenceLineIndices: [0, 2], quote: nonadjacentQuote,
    } };
    const normalized = resolveActionAuditReferences(audit, visibleLines);
    expect(validateActionAudit(normalized, requirements, text, visibleLines)).toMatchObject({ approved: true, metadataValid: true });
  });
  it('rejects a line reference from another scene even if its quote occurs elsewhere in the current scene', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const currentLines = ['我不想回答这个问题。', '文穗有没有回复你？', '你没有得到回答，只能暂时收起手机。'];
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '必须验证当前行，而非正文中任意位置。', evidenceLineIndices: [0], quote: '文穗有没有回复你？',
    } };
    audit.segments = audit.segments.map(segment => ({ ...segment, quote: currentLines.join('\n') }));
    expect(validateActionAudit(audit, requirements, currentLines.join('\n'), currentLines))
      .toMatchObject({ approved: false, metadataValid: false });
  });
  it('rejects mismatched scene context even when the selected line itself is unchanged', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...passing(requirements), originalRequest: {
      status: 'pass', reason: '全部行必须属于当前正文。', evidenceLineIndices: [0], quote: '文穗有没有回复你？',
    } };
    expect(validateActionAudit(audit, requirements, text, [visibleLines[0], '来自另一幕的叙述。']))
      .toMatchObject({ approved: false, metadataValid: false });
    expect(validateActionAudit(audit, requirements, text)).toMatchObject({ approved: false, metadataValid: false });
  });
  it('preserves empty evidence for a real missing-action failure and propagates its violation', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = compactPassing(requirements);
    audit.originalRequest = { status: 'fail', evidenceLineIndices: [], reason: '正文没有提出原问题。' };
    const normalized = resolveActionAuditReferences(audit, visibleLines) as ActionAudit;
    expect(normalized.originalRequest).toEqual({ status: 'fail', evidenceLineIndices: [], quote: '', reason: '正文没有提出原问题。' });
    expect(normalized.followThrough).toMatchObject({ status: 'not-applicable', evidenceLineIndices: [], quote: '' });
    expect(validateActionAudit(normalized, requirements, text, visibleLines)).toMatchObject({ approved: false, metadataValid: true,
      violations: [{ code: 'scene-contract-violation', message: expect.stringContaining('正文没有提出原问题。') }] });
  });
  it('keeps non-string indexed statuses invalid instead of converting them into pass', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = { ...compactPassing(requirements), originalRequest: {
      status: ['pass'], evidenceLineIndices: [0], reason: '非法状态必须纠正。',
    } };
    expect(validateActionAudit(resolveActionAuditReferences(audit, visibleLines), requirements, text, visibleLines))
      .toMatchObject({ approved: false, metadataValid: false });
  });
  it('preserves strict legacy quotation validation after normalization', () => {
    const requirements = buildActionAuditRequirements(packet())!;
    const audit = passing(requirements);
    expect(validateActionAudit(resolveActionAuditReferences(audit, visibleLines), requirements, text).approved).toBe(true);
    audit.originalRequest.quote = nonadjacentQuote;
    expect(validateActionAudit(resolveActionAuditReferences(audit, visibleLines), requirements, text).approved).toBe(false);
    audit.originalRequest.quote = '她今天没有回复。';
    expect(validateActionAudit(resolveActionAuditReferences(audit, visibleLines), requirements, text).approved).toBe(false);
  });
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
