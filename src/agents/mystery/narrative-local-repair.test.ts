import { describe, expect, it } from 'vitest';
import { repairNarrativeAgainstWriterPacket } from './narrative-review';
import { InvalidNarrativePatchError } from './narrative-patch';
import { validateAssertionAudit } from './fact-assertion-review';
import type { FactReview, WriterPacket } from './types';

const original = '<maintext>场景|home\n对话|旁白|calm|雨水把灯光揉成一片迟迟散不开的金色。</maintext><option>留下\n离开</option><hint>继续。</hint><sum>等候。</sum><vars>{}</vars>';
const quote = '雨水把灯光揉成一片迟迟散不开的金色。';
const review: FactReview = { approved: false, violations: [{ code: 'repeated-prose',
  candidateQuote: quote, message: '重复句' }], corrections: ['换一种表达'] };
const packet = { authorizedFacts: [], playerKnownFacts: [], authorizedKnowledgeEvents: [] } as unknown as WriterPacket;
const options = { api: { baseUrl: 'https://patch.test/v1', apiKey: 'test', model: 'writer' },
  preset: null, packet, rejectedNarrative: original, review };

describe('localized repair through the existing writer repair entry', () => {
  it('makes one patch request and returns a complete merged candidate for downstream revalidation', async () => {
    let calls = 0;
    const result = await repairNarrativeAgainstWriterPacket({ ...options, complete: async (messages, call) => {
      calls++;
      expect(call?.responseFormat?.type).toBe('json_schema');
      expect(messages[1].content).toContain('[Targets]');
      return '{"edits":[{"targetId":"T1","replacement":"你把视线从窗边移开。"}]}';
    } });
    expect(calls).toBe(1);
    expect(result).toBe(original.replace(quote, '你把视线从窗边移开。'));
  });

  it('leaves fallback to the outer repair budget after malformed patch output', async () => {
    let calls = 0;
    await expect(repairNarrativeAgainstWriterPacket({ ...options, complete: async () => {
      calls++; return '{malformed';
    } })).rejects.toBeInstanceOf(InvalidNarrativePatchError);
    expect(calls).toBe(1);
  });

  it('uses the full repair path after the single local attempt or with an unlocatable violation', async () => {
    for (const additional of [{ allowLocalizedRepair: false }, { review: { ...review,
      violations: [{ code: 'scene-contract-violation' as const, message: '缺少整段行动' }] } }]) {
      const result = await repairNarrativeAgainstWriterPacket({ ...options, ...additional, complete: async (messages, call) => {
        expect(call?.responseFormat).toBeUndefined();
        expect(messages[1].content).not.toContain('[Targets]');
        return original;
      } });
      expect(result).toBe(original);
    }
  });

  it('propagates cancellation without launching a second paid request', async () => {
    let calls = 0;
    const error = new Error('aborted'); error.name = 'AbortError';
    await expect(repairNarrativeAgainstWriterPacket({ ...options, complete: async () => {
      calls++; throw error;
    } })).rejects.toBe(error);
    expect(calls).toBe(1);
  });

  it('emits exact field metadata only after validating the assertion quote', () => {
    const audit = { reviewedFields: ['option:0'], assertions: [{ field: 'option:0', quote: '追问死因',
      proposition: '已经知道死因', status: 'unsupported' as const, citations: [], reason: '没有来源' }] };
    const report = validateAssertionAudit(audit, [], { 'option:0': '追问死因' });
    expect(report.violations).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'unsupported-assertion', candidateQuote: '追问死因', field: 'option:0',
    })]));
    const invalid = validateAssertionAudit(audit, [], { 'option:0': '追问其他问题' });
    expect(invalid.violations.every(v => !v.candidateQuote)).toBe(true);
  });
});
