import { describe, expect, it, vi } from 'vitest';
import type { ResponseFormat } from '../../sillytavern/api-router';
import {
  buildNarrativeReportRepairStrategy,
  NarrativeReportRepairError,
  type NarrativeReportRepairTarget,
} from './narrative-report-repair';

const stringSchema = { type: 'string', minLength: 1 };
const assertionSchema = {
  type: 'object', additionalProperties: false,
  required: ['unitId', 'proposition', 'status', 'citations', 'reason'],
  properties: {
    unitId: stringSchema, proposition: stringSchema,
    status: { type: 'string', enum: ['supported', 'unsupported', 'ordinary-present'] },
    citations: { type: 'array', items: stringSchema }, reason: stringSchema,
  },
};
const judgmentSchema = {
  type: 'object', additionalProperties: false,
  required: ['status', 'evidenceLineIndices', 'reason'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail', 'not-applicable'] },
    evidenceLineIndices: { type: 'array', items: { type: 'integer', minimum: 0 } }, reason: stringSchema,
  },
};
const disclosureSchema = {
  type: 'object', additionalProperties: false,
  required: ['assertionIndex', 'listenerIds'],
  properties: {
    assertionIndex: { type: 'integer', minimum: 0 },
    listenerIds: { type: 'array', items: stringSchema },
  },
};
const schema = {
  type: 'object', additionalProperties: false,
  required: ['approved', 'violations', 'corrections', 'assertionAudit', 'continuityAudit', 'actionAudit'],
  properties: {
    approved: { type: 'boolean' }, violations: { type: 'array' }, corrections: { type: 'array' },
    assertionAudit: {
      type: 'object', properties: { assertions: { type: 'array', items: assertionSchema } },
    },
    continuityAudit: {
      type: 'object', properties: {
        reviewed: { type: 'boolean', const: true },
        disclosures: { type: 'array', items: disclosureSchema },
        beliefs: { type: 'array', items: disclosureSchema },
        commitments: { type: 'array', items: disclosureSchema },
      },
    },
    actionAudit: { anyOf: [
      { type: 'object', properties: {
        originalRequest: judgmentSchema, followThrough: judgmentSchema,
        segments: { type: 'array', items: {
          ...judgmentSchema, required: ['segmentId', ...judgmentSchema.required],
          properties: { segmentId: stringSchema, ...judgmentSchema.properties },
        } },
      } }, { type: 'null' },
    ] },
  },
};
const responseFormat: ResponseFormat = { type: 'json_schema', json_schema: { name: 'review', strict: true, schema } };
const messages = [{ role: 'user' as const, content: 'Candidate A; its source IDs and units are immutable.' }];

function claim(unitId: string, citations = ['source:1']) {
  return { unitId, proposition: `Claim ${unitId}`, status: 'supported', citations, reason: '来源支持' };
}
function report() {
  return {
    approved: false, violations: [{ code: 'unsupported-fact', message: '另一条事实无来源' }], corrections: ['修正真实事实错误'],
    assertionAudit: { assertions: [claim('maintext:u1'), claim('maintext:u2', ['wrong-source'])] },
    continuityAudit: {
      reviewed: true,
      disclosures: [0, 1, 2].map(assertionIndex => ({ assertionIndex, listenerIds: [`listener:${assertionIndex}`] })),
      beliefs: [], commitments: [],
    },
    actionAudit: {
      originalRequest: { status: 'pass', evidenceLineIndices: [0], reason: '做了原行动' },
      followThrough: { status: 'not-applicable', evidenceLineIndices: [], reason: '无接续' },
      segments: [{ segmentId: 'segment:1', status: 'pass', evidenceLineIndices: [0], reason: '已完成' }],
    },
  };
}
function strategy(targets: NarrativeReportRepairTarget[], first = JSON.stringify(report()), parse = vi.fn(JSON.parse)) {
  const repair = buildNarrativeReportRepairStrategy({ messages, responseFormat, parse })(
    first, new NarrativeReportRepairError('引文索引有误', targets),
  );
  return { repair, parse };
}
function patch(...patches: unknown[]) { return JSON.stringify({ patches }); }

describe('buildNarrativeReportRepairStrategy', () => {
  it('replaces only the authorized assertion and validates the complete merged report', () => {
    const { repair, parse } = strategy([{ kind: 'assertion', index: 1 }]);
    expect(repair).toBeDefined();
    const corrected = claim('maintext:u2');
    const result = repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: corrected }));
    const expected = report();
    expected.assertionAudit.assertions[1] = corrected;
    expect(result).toEqual(expected);
    expect(parse).toHaveBeenCalledExactlyOnceWith(JSON.stringify(expected));
    expect(result.approved).toBe(false);
    expect(result.violations).toEqual(report().violations);
  });

  it('keeps original instructions and report data while using only the smaller patch schema for the reply', () => {
    const first = JSON.stringify(report());
    const { repair } = strategy([{ kind: 'assertion', index: 1, issue: '无效引用 source:missing' }], first);
    expect(repair!.messages.slice(0, -1)).toEqual([...messages, { role: 'assistant', content: first }]);
    const instruction = repair!.messages.at(-1)!.content;
    expect(instruction).toContain('仅输出');
    expect(instruction).toContain('无效引用 source:missing');
    expect(instruction).toContain('不得');
    expect(instruction).toContain('r1');
    expect(repair!.responseFormat.type).toBe('json_schema');
    const format = repair!.responseFormat as Extract<ResponseFormat, { type: 'json_schema' }>;
    expect(format.json_schema.schema.required).toEqual(['patches']);
    expect(format.json_schema.name).not.toBe(responseFormat.json_schema.name);
  });

  it('deletes only authorized disclosures and preserves unaffected order even with multiple edits', () => {
    const { repair } = strategy([
      { kind: 'continuity', collection: 'disclosures', index: 0, allowDelete: true },
      { kind: 'continuity', collection: 'disclosures', index: 2, allowDelete: true },
      { kind: 'continuity', collection: 'disclosures', index: 1 },
    ]);
    const replacement = { assertionIndex: 1, listenerIds: ['player'] };
    const result = repair!.parse(patch(
      { targetId: 'r2', operation: 'delete' },
      { targetId: 'r3', operation: 'replace', value: replacement },
      { targetId: 'r1', operation: 'delete' },
    ));
    expect(result.continuityAudit.disclosures).toEqual([replacement]);
    expect(result.assertionAudit).toEqual(report().assertionAudit);
  });

  it('appends missing unit claims without renumbering existing assertions', () => {
    const { repair } = strategy([{ kind: 'missing-assertion', unitId: 'maintext:u3' }]);
    const result = repair!.parse(patch({ targetId: 'r1', operation: 'append', value: claim('maintext:u3') }));
    expect(result.assertionAudit.assertions).toEqual([...report().assertionAudit.assertions, claim('maintext:u3')]);
    expect(result.continuityAudit).toEqual(report().continuityAudit);
  });

  it('replaces a single action judgment and segment with their original identities', () => {
    const { repair } = strategy([{ kind: 'action', judgment: 'originalRequest' }, { kind: 'action-segment', index: 0 }]);
    const judgment = { status: 'fail', evidenceLineIndices: [], reason: '正文未执行' };
    const result = repair!.parse(patch(
      { targetId: 'r1', operation: 'replace', value: judgment },
      { targetId: 'r2', operation: 'replace', value: { ...judgment, segmentId: 'segment:1' } },
    ));
    expect(result.actionAudit.originalRequest).toEqual(judgment);
    expect(result.actionAudit.followThrough).toEqual(report().actionAudit.followThrough);
    expect(result.actionAudit.segments[0]).toEqual({ ...judgment, segmentId: 'segment:1' });
  });

  it('can constrain correction to a program-known unit when the reported unit ID was wrong', () => {
    const { repair } = strategy([{ kind: 'assertion', index: 1, unitId: 'maintext:u3' }]);
    expect(repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u3') }))
      .assertionAudit.assertions[1].unitId).toBe('maintext:u3');
  });

  it('unlocks an invalid unit ID only when the program explicitly authorizes it', () => {
    const first = report();
    first.assertionAudit.assertions[1].unitId = 'invalid-unit';
    const { repair } = strategy([{ kind: 'assertion', index: 1, unlockUnitId: true }], JSON.stringify(first));
    expect(repair).toBeDefined();
    expect(repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') }))
      .assertionAudit.assertions[1].unitId).toBe('maintext:u2');
    const { repair: locked } = strategy([{ kind: 'assertion', index: 1 }], JSON.stringify(first));
    expect(() => locked!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') }))).toThrow();
  });

  it('supports assertion repair for reports whose action audit is legitimately null', () => {
    const first = JSON.stringify({ ...report(), actionAudit: null });
    const { repair } = strategy([{ kind: 'assertion', index: 1 }], first);
    expect(repair).toBeDefined();
    expect(repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') })).actionAudit).toBeNull();
    expect(strategy([{ kind: 'action', judgment: 'originalRequest' }], first).repair).toBeUndefined();
  });

  it('keeps corrections bound to the original candidate even if the caller mutates its target afterward', () => {
    const target: NarrativeReportRepairTarget = { kind: 'assertion', index: 1 };
    const { repair } = strategy([target]);
    target.index = 0;
    const result = repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') }));
    expect(result.assertionAudit.assertions[0]).toEqual(report().assertionAudit.assertions[0]);
    expect(result.assertionAudit.assertions[1]).toEqual(claim('maintext:u2'));
  });

  it('propagates complete validation failure without turning it into approval', () => {
    const parse = vi.fn(() => { throw new Error('其他实质错误仍未获准'); });
    const { repair } = strategy([{ kind: 'assertion', index: 1 }], JSON.stringify(report()), parse);
    expect(() => repair!.parse(patch({ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') })))
      .toThrow('其他实质错误仍未获准');
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing target', { patches: [] }],
    ['duplicate target', { patches: [
      { targetId: 'r1', operation: 'replace', value: claim('maintext:u2') },
      { targetId: 'r1', operation: 'replace', value: claim('maintext:u2') },
    ] }],
    ['unauthorized target', { patches: [{ targetId: 'r2', operation: 'replace', value: claim('maintext:u2') }] }],
    ['arbitrary path', { patches: [{ targetId: 'r1', path: '/approved', operation: 'replace', value: true }] }],
    ['top-level edit', { approved: true, patches: [{ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') }] }],
    ['candidate edit', { candidate: 'other narrative', patches: [{ targetId: 'r1', operation: 'replace', value: claim('maintext:u2') }] }],
    ['unauthorized delete', { patches: [{ targetId: 'r1', operation: 'delete' }] }],
    ['unauthorized append', { patches: [{ targetId: 'r1', operation: 'append', value: claim('maintext:u2') }] }],
    ['changing unit', { patches: [{ targetId: 'r1', operation: 'replace', value: claim('other-candidate:u2') }] }],
    ['extra replacement field', { patches: [{ targetId: 'r1', operation: 'replace', value: { ...claim('maintext:u2'), approved: true } }] }],
    ['missing replacement field', { patches: [{ targetId: 'r1', operation: 'replace', value: { unitId: 'maintext:u2' } }] }],
    ['wrong replacement type', { patches: [{ targetId: 'r1', operation: 'replace', value: { ...claim('maintext:u2'), citations: [99] } }] }],
    ['wrong enum', { patches: [{ targetId: 'r1', operation: 'replace', value: { ...claim('maintext:u2'), status: 'approved' } }] }],
    ['empty required string', { patches: [{ targetId: 'r1', operation: 'replace', value: { ...claim('maintext:u2'), reason: '' } }] }],
  ])('rejects %s before revalidating', (_name, malformed) => {
    const { repair, parse } = strategy([{ kind: 'assertion', index: 1 }]);
    expect(repair).toBeDefined();
    expect(() => repair!.parse(JSON.stringify(malformed))).toThrow();
    expect(parse).not.toHaveBeenCalled();
  });

  it('rejects malformed patch JSON before merging', () => {
    const { repair, parse } = strategy([{ kind: 'assertion', index: 1 }]);
    expect(repair).toBeDefined();
    expect(() => repair!.parse('{"patches":[Wildcard]}')).toThrow();
    expect(parse).not.toHaveBeenCalled();
  });

  it('rejects deleting a continuity entry that was authorized only for replacement', () => {
    const { repair } = strategy([{ kind: 'continuity', collection: 'disclosures', index: 0 }]);
    expect(repair).toBeDefined();
    expect(() => repair!.parse(patch({ targetId: 'r1', operation: 'delete' }))).toThrow();
  });

  it('rejects changing a segment ID or appending a different missing unit', () => {
    const { repair: action } = strategy([{ kind: 'action-segment', index: 0 }]);
    expect(action).toBeDefined();
    expect(() => action!.parse(patch({ targetId: 'r1', operation: 'replace', value: { ...report().actionAudit.segments[0], segmentId: 'other' } }))).toThrow();
    const { repair: missing } = strategy([{ kind: 'missing-assertion', unitId: 'maintext:u3' }]);
    expect(missing).toBeDefined();
    expect(() => missing!.parse(patch({ targetId: 'r1', operation: 'append', value: claim('maintext:u4') }))).toThrow();
  });

  it.each([
    [], [{ kind: 'assertion', index: -1 }], [{ kind: 'assertion', index: 99 }],
    [{ kind: 'continuity', collection: 'disclosures', index: 99 }],
    [{ kind: 'action-segment', index: 99 }],
    [{ kind: 'assertion', index: 1 }, { kind: 'assertion', index: 1 }],
    [{ kind: 'missing-assertion', unitId: 'maintext:u3' }, { kind: 'missing-assertion', unitId: 'maintext:u3' }],
  ].map(targets => [targets as NarrativeReportRepairTarget[]]))('falls back when targets cannot be located uniquely: %j', targets => {
    expect(strategy(targets).repair).toBeUndefined();
  });

  it.each([
    '{"approved":false,',
    JSON.stringify({ ...report(), assertionAudit: null }),
    JSON.stringify({ ...report(), assertionAudit: { ...report().assertionAudit, actionAudit: {} } }),
    JSON.stringify({ ...report(), candidate: 'unexpected top-level data' }),
    JSON.stringify({ ...report(), continuityAudit: undefined }),
  ])('falls back when the original JSON or report containers are unreliable', first => {
    expect(strategy([{ kind: 'assertion', index: 1 }], first).repair).toBeUndefined();
  });

  it('does not infer targets from ordinary error messages or run without a schema', () => {
    const prepare = buildNarrativeReportRepairStrategy({ messages, responseFormat, parse: JSON.parse });
    expect(prepare(JSON.stringify(report()), new Error('assertionAudit.assertions[1] 引文错误'))).toBeUndefined();
    const withoutSchema = buildNarrativeReportRepairStrategy({ messages, responseFormat: { type: 'json_object' }, parse: JSON.parse });
    expect(withoutSchema(JSON.stringify(report()), new NarrativeReportRepairError('引用错误', [{ kind: 'assertion', index: 1 }]))).toBeUndefined();
  });
});
