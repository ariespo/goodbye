import { describe, expect, it } from 'vitest';
import { buildAssertionReferenceTable } from './assertion-references';
import { buildAssertionSources, extractNarrativeFields } from './fact-assertion-review';
import { reviewNarrativeAgainstWriterPacket } from './narrative-review';
import { NARRATIVE_FACT_REVIEW_JSON_SCHEMA } from './schemas';
import type { WriterPacket } from './types';

const packet = {
  authorizedFacts: [], playerKnownFacts: [], authorizedKnowledgeEvents: [],
  authorizedBackgroundFacts: [], approvedBackgroundFactProposals: [],
} as unknown as WriterPacket;
const narrative = '<maintext>对话|旁白|calm|他摇了摇头。</maintext>';
const fields = extractNarrativeFields(narrative);
const table = buildAssertionReferenceTable(fields, buildAssertionSources(packet, fields));
const base = {
  approved: true, violations: [], corrections: [],
  assertionAudit: { assertions: [{ unitId: table.units[0].unitId, proposition: '他摇了摇头。', status: 'ordinary-present', citations: [], reason: '当下动作。' }] },
  continuityAudit: { reviewed: true, disclosures: [], beliefs: [], commitments: [] }, actionAudit: null,
};
const api = { baseUrl: 'https://reference-review.test/v1', apiKey: 'test', model: 'critic' };

describe('reference report integration', () => {
  it('hydrates exact text without asking the critic to copy quotes or coverage metadata', async () => {
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({
      api, preset: null, packet, narrative,
      complete: async messages => {
        calls++;
        expect(messages[1].content).toContain('[NarrativeUnits]');
        expect(messages[1].content).toContain(table.units[0].unitId);
        return JSON.stringify(base);
      },
    });
    expect(calls).toBe(1);
    expect(review.approved).toBe(true);
    expect(review.assertionAudit?.assertions[0]).toMatchObject({ field: 'maintext', quote: '他摇了摇头。' });
    const auditSchema = (NARRATIVE_FACT_REVIEW_JSON_SCHEMA.properties as Record<string, { required: string[] }>).assertionAudit;
    expect(auditSchema.required).toEqual(['assertions']);
  });

  it('keeps semantic rejection after a syntactically valid reference report', async () => {
    const report = structuredClone(base);
    report.assertionAudit.assertions[0].status = 'unsupported';
    report.assertionAudit.assertions[0].reason = '没有可用来源。';
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative, complete: async () => JSON.stringify(report) });
    expect(review.approved).toBe(false);
    expect(review.violations.some(item => item.code === 'unsupported-assertion')).toBe(true);
  });

  it('repairs an invalid source ID with one bounded patch and validates the merged report', async () => {
    let calls = 0;
    const invalid = { ...structuredClone(base), assertionAudit: { assertions: [{ ...base.assertionAudit.assertions[0], citations: ['stale-source'] }] } };
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(invalid);
        expect(options?.responseFormat).toMatchObject({ type: 'json_schema', json_schema: { name: 'narrative_report_patch' } });
        return JSON.stringify({ patches: [{ targetId: 'r1', operation: 'replace', value: base.assertionAudit.assertions[0] }] });
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(true);
    expect(review.assertionAudit?.assertions[0].quote).toBe('他摇了摇头。');
  });

  it('appends a missing unit without changing a preserved semantic rejection', async () => {
    const report = structuredClone(base);
    report.assertionAudit.assertions = [];
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(report);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_report_patch' } });
        return JSON.stringify({ patches: [{ targetId: 'r1', operation: 'append', value: { ...base.assertionAudit.assertions[0], status: 'unsupported' } }] });
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(false);
  });

  it('deletes only the invalid continuity item and keeps unrelated assertions intact', async () => {
    const report = { ...structuredClone(base), continuityAudit: {
      reviewed: true, disclosures: [{ assertionIndex: 0, lineIndex: 0, quote: '他摇了摇头。', listenerIds: ['player'], audienceEvidence: [] }], beliefs: [], commitments: [],
    } };
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(report);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_report_patch' } });
        return JSON.stringify({ patches: [{ targetId: 'r1', operation: 'delete' }] });
      },
    });
    expect(calls).toBe(2);
    expect(review.continuityAudit?.disclosures).toEqual([]);
    expect(review.assertionAudit?.assertions[0]).toMatchObject({ quote: '他摇了摇头。', status: 'ordinary-present' });
  });

  it('stops after one invalid patch without a further rewrite or approval', async () => {
    let calls = 0;
    const invalid = { ...structuredClone(base), assertionAudit: { assertions: [{ ...base.assertionAudit.assertions[0], citations: ['stale-source'] }] } };
    await expect(reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async () => {
        calls++;
        return calls === 1 ? JSON.stringify(invalid) : '{"patches":[Wildcard]}';
      },
    })).rejects.toThrow();
    expect(calls).toBe(2);
  });

  it('corrects both bad source references in the same patch call', async () => {
    const candidate = '<maintext>对话|旁白|calm|他摇了摇头。\n对话|旁白|calm|雨还在下。</maintext>';
    const candidateFields = extractNarrativeFields(candidate);
    const units = buildAssertionReferenceTable(candidateFields, []).units;
    const assertions = units.map(unit => ({ ...base.assertionAudit.assertions[0], unitId: unit.unitId, proposition: unit.text }));
    const report = { ...base, assertionAudit: { assertions: assertions.map(item => ({ ...item, citations: ['bad-source'] })) } };
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative: candidate,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(report);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_report_patch' } });
        return JSON.stringify({ patches: assertions.map((value, index) => ({ targetId: `r${index + 1}`, operation: 'replace', value })) });
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(true);
    expect(review.assertionAudit?.assertions).toHaveLength(2);
  });

  it('uses the complete correction when an invalid unit has ambiguous ownership', async () => {
    const invalid = structuredClone(base);
    invalid.assertionAudit.assertions[0].unitId = 'stale-unit';
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(invalid);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_fact_review' } });
        return JSON.stringify(base);
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(true);
  });

  it('uses a full correction when an early reference error hides another malformed report item', async () => {
    const invalid = { ...base, assertionAudit: { assertions: [{ ...base.assertionAudit.assertions[0], citations: ['bad-source'] }] },
      continuityAudit: { reviewed: true, disclosures: [{ assertionIndex: 0, lineIndex: 0, listenerIds: [], audienceEvidence: [] }], beliefs: [], commitments: [] } };
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(invalid);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_fact_review' } });
        return JSON.stringify(base);
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(true);
  });

  it('repairs only the bad action segment without rewriting valid action judgments', async () => {
    const actionPacket = { ...packet,
      actionIntentAudit: { originalInput: '留在原地观察', approvedSteps: [], requestedStepCount: 1, extensionStepCount: 0 },
      resolvedAction: { cycleCount: 1, endTime: '2024-09-09T08:05:00', segments: [{ step: { id: 'observe', kind: 'search', locationId: 'home' }, executedMinutes: 5, completed: true }] },
    } as unknown as WriterPacket;
    const pass = { status: 'pass', evidenceLineIndices: [0], reason: '当下观察。' };
    const report = { ...base, actionAudit: { originalRequest: pass, followThrough: { status: 'not-applicable', evidenceLineIndices: [], reason: '无接续。' }, segments: [{ ...pass, segmentId: 'segment:0', evidenceLineIndices: [99] }] } };
    let calls = 0;
    const review = await reviewNarrativeAgainstWriterPacket({ api, preset: null, packet: actionPacket, narrative,
      complete: async (_messages, options) => {
        calls++;
        if (calls === 1) return JSON.stringify(report);
        expect(options?.responseFormat).toMatchObject({ json_schema: { name: 'narrative_report_patch' } });
        return JSON.stringify({ patches: [{ targetId: 'r1', operation: 'replace', value: { ...pass, segmentId: 'segment:0' } }] });
      },
    });
    expect(calls).toBe(2);
    expect(review.approved).toBe(true);
    expect(review.actionAudit?.originalRequest.quote).toBe('他摇了摇头。');
  });
});
