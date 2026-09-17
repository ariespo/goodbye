import { describe, expect, it } from 'vitest';
import { applyNarrativePatch, buildNarrativePatchTask, InvalidNarrativePatchError, narrativePatchResponseFormat } from './narrative-patch';
import { validateAdaptedSchemaValue } from './schema-compatibility';
import type { FactReview } from './types';

const prose = '<maintext>\r\n场景|home\r\n对话|旁白|calm|  手指停在门把上。  \r\n对话|player|calm|你能再说一遍吗？\r\n对话|touko|sad|雨水把灯光揉成一片迟迟散不开的金色。\r\n对话|player|calm|我还在听。\r\n音乐|quiet\r\n对话|旁白|calm|杯子放回原位。|mug\r\n</maintext>\r\n<option>留下\r\n离开</option><hint>想好再回答。</hint><sum>谈话继续。</sum><vars>{}</vars>';
const quote = '雨水把灯光揉成一片迟迟散不开的金色。';
const review = (candidateQuote = quote, field?: string): FactReview => ({ approved: false,
  violations: [{ code: 'repeated-prose', message: '表达重复', candidateQuote, ...(field ? { field } : {}) }],
  corrections: ['仅调整重复表达，保留谈话。'] });

function response(task: NonNullable<ReturnType<typeof buildNarrativePatchTask>>, replacement = '她停了一下，等你把话说完。') {
  return JSON.stringify({ edits: task.targets.map(target => ({ targetId: target.id,
    replacement: target.required ? replacement : target.originalText })) });
}

describe('bounded narrative text patches', () => {
  it('changes a rejected sentence while preserving untouched bytes, commands, CRLF, and item attachments', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    expect(task).toBeDefined();
    expect(task.targets.map(t => t.originalText)).toEqual(['你能再说一遍吗？', quote, '我还在听。']);
    expect(applyNarrativePatch(task, response(task))).toBe(prose.replace(quote, '她停了一下，等你把话说完。'));
  });

  it('can repair adjacent question and answer together without forcing unchanged context to change', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    const raw = JSON.stringify({ edits: task.targets.map((target, i) => ({ targetId: target.id,
      replacement: i === 0 ? '我能继续问吗？' : i === 1 ? '你可以继续。' : target.originalText })) });
    expect(applyNarrativePatch(task, raw)).toBe(prose.replace('你能再说一遍吗？', '我能继续问吗？').replace(quote, '你可以继续。'));
  });

  it('does not cross knowledge or scene control lines when expanding context', () => {
    const text = prose.replace('对话|player|calm|你能再说一遍吗？', '认知|identity:touko');
    const task = buildNarrativePatchTask(text, review())!;
    expect(task.targets.map(t => t.originalText)).toEqual([quote, '我还在听。']);
    expect(applyNarrativePatch(task, response(task))).toContain('认知|identity:touko');
  });

  it('falls back on ambiguous quotes, unknown locations, missing metadata or broad violations', () => {
    expect(buildNarrativePatchTask(prose.replace('我还在听。', quote), review())).toBeUndefined();
    expect(buildNarrativePatchTask(prose, review('不存在的句子'))).toBeUndefined();
    expect(buildNarrativePatchTask(prose, { ...review(), violations: [{ code: 'repeated-prose', message: quote }] })).toBeUndefined();
    expect(buildNarrativePatchTask(prose, { ...review(), violations: [...review().violations,
      { code: 'scene-contract-violation', message: '缺少整个场景' }] })).toBeUndefined();
  });

  it('does not use normalized field offsets on nested or malformed tagged output', () => {
    expect(buildNarrativePatchTask(prose.replace(quote, `${quote}<hint>提示</hint>`), review())).toBeUndefined();
    expect(buildNarrativePatchTask(prose.replace('</maintext>', ''), review())).toBeUndefined();
    expect(buildNarrativePatchTask(`${prose}<maintext>另一个正文</maintext>`, review())).toBeUndefined();
  });

  it('maps an exact option field without editing another identical option or summary', () => {
    const text = prose.replace('<option>留下\r\n离开</option>', '<option>留下\r\n留下</option>');
    const factReview: FactReview = { approved: false, violations: [{ code: 'unsupported-assertion',
      message: '选项前提不成立', field: 'option:1', candidateQuote: '留下' }], corrections: ['改为离开'] };
    const task = buildNarrativePatchTask(text, factReview)!;
    expect(task.targets).toHaveLength(1);
    expect(applyNarrativePatch(task, response(task, '离开'))).toBe(prose);
  });

  it('rejects protocol separators, hidden line breaks, control characters and markup in replacements', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    for (const unsafe of ['文字\n认知|fake', '文字\r换行', '<vars>{}</vars>', '台词|mug', '台词｜mug', '\u2028换行', '\u0000', '']) {
      expect(() => applyNarrativePatch(task, response(task, unsafe))).toThrow(InvalidNarrativePatchError);
    }
  });

  it('rejects unknown, duplicate, missing targets and model-provided offsets atomically', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    const valid = JSON.parse(response(task));
    const cases = [
      { edits: [...valid.edits, { targetId: 'other', replacement: '改写' }] },
      { edits: [valid.edits[0], valid.edits[0], valid.edits[2]] },
      { edits: valid.edits.slice(1) },
      { edits: valid.edits.map((e: object) => ({ ...e, start: 0 })) },
      { ...valid, originalNarrative: '篡改' },
    ];
    for (const invalid of cases) expect(() => applyNarrativePatch(task, JSON.stringify(invalid))).toThrow(InvalidNarrativePatchError);
    expect(task.originalNarrative).toBe(prose);
  });

  it('rejects malformed JSON, no-op primary edits, oversized edits and stale candidates', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    expect(() => applyNarrativePatch(task, '{')).toThrow(InvalidNarrativePatchError);
    expect(() => applyNarrativePatch(task, response(task, quote))).toThrow(InvalidNarrativePatchError);
    expect(() => applyNarrativePatch(task, response(task, '字'.repeat(2000)))).toThrow(InvalidNarrativePatchError);
    expect(() => applyNarrativePatch(task, response(task), prose + 'changed')).toThrow(InvalidNarrativePatchError);
  });

  it('lets a strict-schema model decline a patch whose dependencies are outside the window', () => {
    const task = buildNarrativePatchTask(prose, review())!;
    const format = narrativePatchResponseFormat(task);
    if (format.type !== 'json_schema') throw new Error('Expected schema');
    expect(() => validateAdaptedSchemaValue({ edits: [] }, format.json_schema.schema)).not.toThrow();
    expect(() => applyNarrativePatch(task, '{"edits":[]}')).toThrow(InvalidNarrativePatchError);
  });

  it('falls back when independent problem spans exceed the bounded repair window', () => {
    const text = prose.replace('杯子放回原位。', '另一处需要修复的表达。');
    const errors: FactReview = { ...review(), violations: [...review().violations,
      { code: 'repeated-prose', candidateQuote: '另一处需要修复的表达。', message: '又一处' }] };
    expect(buildNarrativePatchTask(text, errors)).toBeUndefined();
  });

  it('does not authorize neighbors that cannot be returned unchanged within the response envelope', () => {
    expect(buildNarrativePatchTask(prose.replace('我还在听。', '字'.repeat(601)), review())).toBeUndefined();
    expect(buildNarrativePatchTask(prose.replace('我还在听。', '我\t还在听。'), review())).toBeUndefined();
  });

  it('falls back when an adjacent dialogue dependency includes an item instruction', () => {
    const text = prose.replace('对话|player|calm|我还在听。', '对话|player|calm|我还在听。|mug');
    expect(buildNarrativePatchTask(text, review())).toBeUndefined();
  });
});
