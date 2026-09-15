import { describe, expect, it } from 'vitest';
import { AssertionReferenceError, buildAssertionReferenceTable, resolveAssertionAuditReferences } from './assertion-references';
import { extractNarrativeFields, validateAssertionAudit, type AssertionSource } from './fact-assertion-review';
import { maintextToScene } from '../../engine/scene-parser';

const sources: AssertionSource[] = [{ id: 'known-fact:F002:hint', kind: 'fact', text: '门卫今天见过文穗，并未确认她进了学校。', speakerIds: ['school-guard'] }];
const fields = extractNarrativeFields('<maintext>场景|校门\n对话|旁白|平静|门卫摇了摇头。\n对话|门卫|平静|今天见过文穗。</maintext><sum>门卫摇了摇头。</sum><hint>继续询问</hint><option>看看校门</option>');

function wire(table: ReturnType<typeof buildAssertionReferenceTable>) {
  return { assertions: table.units.map(unit => ({ unitId: unit.unitId, proposition: unit.text, status: 'ordinary-present', citations: [] as string[], reason: '当前动作' })) };
}

describe('assertion reference units', () => {
  it('treats an empty dialogue speaker as the parser default narrator', () => {
    const candidate = { maintext: '对话||平静|门卫今天见过文穗。' };
    const available: AssertionSource[] = [{ id: 'fact:F002:hint', kind: 'fact', text: '门卫今天见过文穗。', speakerIds: [] }];
    const table = buildAssertionReferenceTable(candidate, available, maintextToScene(candidate.maintext));
    const report = wire(table);
    report.assertions[0].status = 'supported';
    report.assertions[0].citations = [table.sourceUnits[0].sourceUnitId];
    expect(table.units[0].speakerId).toBeUndefined();
    expect(validateAssertionAudit(resolveAssertionAuditReferences(report, table), available, candidate).approved).toBe(true);
  });

  it.each([' | ', ' ｜ '])('binds raw content with %s separators to its exact normalized rendered line', separator => {
    const candidate = { maintext: `对话${separator}门卫${separator}平静${separator}今天见过文穗。${separator}但是没看见她进校。` };
    const table = buildAssertionReferenceTable(candidate, sources, maintextToScene(candidate.maintext));
    expect(table.units[0]).toMatchObject({ playableLineIndex: 0, speakerId: 'school-guard', text: `今天见过文穗。${separator}但是没看见她进校。` });
    const audit = resolveAssertionAuditReferences(wire(table), table);
    expect(audit.assertions[0].quote).toBe(`今天见过文穗。${separator}但是没看见她进校。`);
    expect(validateAssertionAudit(audit, sources, candidate).approved).toBe(true);
  });

  it('aggregates bad source references and genuinely missing units for one repair', () => {
    const table = buildAssertionReferenceTable(fields, sources);
    const report = wire(table);
    report.assertions[0].citations = ['bad-first'];
    report.assertions[1].citations = ['bad-second'];
    report.assertions.pop();
    try {
      resolveAssertionAuditReferences(report, table);
      expect.fail('invalid references must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AssertionReferenceError);
      expect(error).toMatchObject({ assertionIndices: [0, 1], missingUnitIds: [table.units.at(-1)!.unitId], requiresFullRepair: false });
      expect((error as Error).message).toContain('assertions[1].citations[0]');
    }
  });

  it('requests full repair for unknown unit ownership without inventing append targets', () => {
    const table = buildAssertionReferenceTable(fields, sources);
    const report = wire(table);
    report.assertions[0].unitId = 'unknown-unit';
    report.assertions[1].citations = ['bad-source'];
    expect(() => resolveAssertionAuditReferences(report, table)).toThrow(AssertionReferenceError);
    try { resolveAssertionAuditReferences(report, table); } catch (error) {
      expect(error).toMatchObject({ assertionIndices: [0, 1], missingUnitIds: [], requiresFullRepair: true });
    }
  });

  it('restores exact 摇了摇头 text without model transcription and covers visible auxiliary fields', () => {
    const table = buildAssertionReferenceTable(fields, sources, maintextToScene(fields.maintext));
    expect(table.units.map(unit => unit.field)).toEqual(['maintext', 'maintext', 'option:0', 'summary', 'hint']);
    expect(table.units.some(unit => unit.text.includes('场景|'))).toBe(false);
    const audit = resolveAssertionAuditReferences(wire(table), table);
    expect(audit.assertions[0].quote).toBe('门卫摇了摇头。');
    expect(audit.assertions[0].reference).toMatchObject({ start: fields.maintext.indexOf('门卫摇了摇头。'), playableLineIndex: 0 });
    expect(validateAssertionAudit(audit, sources, fields).approved).toBe(true);
  });

  it('keeps full source context and permits multiple proposition judgments for a unit', () => {
    const table = buildAssertionReferenceTable(fields, sources);
    const report = wire(table);
    report.assertions[1].status = 'supported';
    report.assertions[1].citations = [table.sourceUnits[0].sourceUnitId];
    report.assertions.push({ ...report.assertions[1], proposition: '没有确认她进校' });
    const audit = resolveAssertionAuditReferences(report, table);
    expect(audit.assertions[1].citations).toEqual([{ sourceId: sources[0].id, quote: sources[0].text }]);
    expect(audit.assertions).toHaveLength(table.units.length + 1);
  });

  it.each(['unit', 'source', 'candidate', 'missing'])('rejects invalid %s references with a repair path', mode => {
    const table = buildAssertionReferenceTable(fields, sources);
    const report = wire(table);
    if (mode === 'unit') report.assertions[0].unitId = 'invented';
    if (mode === 'source') report.assertions[0].citations = ['invented'];
    if (mode === 'candidate') report.assertions[0].unitId = buildAssertionReferenceTable({ maintext: '不同候选' }, sources).units[0].unitId;
    if (mode === 'missing') report.assertions.pop();
    expect(() => resolveAssertionAuditReferences(report, table)).toThrow(/\$\.assertionAudit\.assertions/);
  });

  it.each(['field', 'quote', 'reference', 'speakerId', 'playableLineIndex'])('rejects model supplied %s overrides', key => {
    const table = buildAssertionReferenceTable(fields, sources);
    const report = wire(table);
    Object.assign(report.assertions[0], { [key]: 'forged' });
    expect(() => resolveAssertionAuditReferences(report, table)).toThrow(key);
  });

  it('preserves strict legacy quote validation', () => {
    const table = buildAssertionReferenceTable({ maintext: '门卫摇了摇头。' }, []);
    const legacy = { reviewedFields: ['maintext'], assertions: [{ field: 'maintext', quote: '门卫摇摇头。', proposition: '摇头', status: 'ordinary-present', citations: [], reason: '动作' }] };
    expect(resolveAssertionAuditReferences(legacy, table)).toBe(legacy);
    expect(validateAssertionAudit(legacy as Parameters<typeof validateAssertionAudit>[0], [], { maintext: '门卫摇了摇头。' }).approved).toBe(false);
  });

  it('binds identical dialogue to exact speakers and rejects replay against changed fields', () => {
    const duplicate = { maintext: '对话|门卫|平静|今天见过文穗。\n对话|赵刚|平静|今天见过文穗。' };
    const table = buildAssertionReferenceTable(duplicate, sources, maintextToScene(duplicate.maintext));
    const report = wire(table);
    report.assertions[0].status = 'supported';
    report.assertions[0].citations = [table.sourceUnits[0].sourceUnitId];
    const audit = resolveAssertionAuditReferences(report, table);
    expect(validateAssertionAudit(audit, sources, duplicate).approved).toBe(true);
    report.assertions[1].status = 'supported';
    report.assertions[1].citations = [table.sourceUnits[0].sourceUnitId];
    expect(validateAssertionAudit(resolveAssertionAuditReferences(report, table), sources, duplicate).approved).toBe(false);
    expect(validateAssertionAudit(audit, sources, { maintext: duplicate.maintext.replace('门卫', '赵刚') }).approved).toBe(false);
  });

  it('binds IDs to source permissions and refuses self-declared or mutated location metadata', () => {
    const table = buildAssertionReferenceTable(fields, sources);
    const revoked = buildAssertionReferenceTable(fields, [{ ...sources[0], speakerIds: [] }]);
    expect(table.units[0].unitId).not.toBe(revoked.units[0].unitId);
    const audit = resolveAssertionAuditReferences(wire(table), table);
    expect(validateAssertionAudit(structuredClone(audit), sources, fields).approved).toBe(false);
    audit.assertions[0].reference!.playableLineIndex = 1;
    expect(validateAssertionAudit(audit, sources, fields).approved).toBe(false);
  });
});
