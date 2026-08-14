import { describe, it, expect } from 'vitest';
import { createOutputProtocol, formatValidationErrors, repairRecoverableOutput } from './output-protocol';

describe('output-protocol', () => {
  const protocol = createOutputProtocol({
    requiredTags: ['maintext', 'option', 'sum'],
    requireMinOptions: 2,
    validateVarsJson: true,
    checkUnclosedTags: true,
  });

  const baseParsed = {
    thinking: '',
    maintext: '场景|room.jpg\n对话|少女|calm|你好。',
    options: ['选项 A', '选项 B'],
    summary: '回合总结',
    vars: {},
    observe: '',
    investigateItems: [],
    actionItems: [],
  };

  it('passes valid output', () => {
    const raw = `<maintext>场景|room.jpg
对话|少女|calm|你好。</maintext>
<option>选项 A
选项 B</option>
<sum>回合总结</sum>`;
    const errors = protocol.validate(raw, baseParsed);
    expect(errors).toHaveLength(0);
  });

  it('reports missing maintext', () => {
    const parsed = { ...baseParsed, maintext: '' };
    const errors = protocol.validate('', parsed);
    expect(errors.some(e => e.code === 'MISSING_MAINTEXT')).toBe(true);
  });

  it('reports insufficient options', () => {
    const parsed = { ...baseParsed, options: ['只有一个'] };
    const errors = protocol.validate('x', parsed);
    expect(errors.some(e => e.code === 'INSUFFICIENT_OPTIONS')).toBe(true);
  });

  it('reports invalid vars JSON', () => {
    const raw = `<maintext>...</maintext>
<option>A
B</option>
<sum>s</sum>
<vars>{ invalid json }</vars>`;
    const parsed = { ...baseParsed };
    const errors = protocol.validate(raw, parsed);
    expect(errors.some(e => e.code === 'VARS_INVALID_JSON')).toBe(true);
  });

  it('reports vars that is not an object', () => {
    const raw = `<maintext>...</maintext>
<option>A
B</option>
<sum>s</sum>
<vars>[1,2,3]</vars>`;
    const errors = protocol.validate(raw, baseParsed);
    expect(errors.some(e => e.code === 'VARS_NOT_OBJECT')).toBe(true);
  });

  it('reports unclosed tags', () => {
    const raw = `<maintext>场景|room.jpg
对话|少女|calm|你好。`;
    const errors = protocol.validate(raw, baseParsed);
    expect(errors.some(e => e.code === 'UNCLOSED_TAG' || e.code === 'MISMATCHED_TAG')).toBe(true);
  });

  it('repairs a missing maintext close only when complete option and sum tags prove the boundary', () => {
    const malformed = `<maintext>\n场景|room.jpg\n对话|少女|calm|你好。\n<option>A\nB</option>\n<sum>完成</sum>`;
    const repaired = repairRecoverableOutput(malformed);
    expect(repaired.repairedTags).toEqual(['maintext']);
    expect(repaired.text).toContain('对话|少女|calm|你好。\n</maintext>\n<option>');
    expect(protocol.validate(repaired.text, baseParsed)).toEqual([]);
  });

  it('does not repair a genuinely truncated response', () => {
    const truncated = '<maintext>\n场景|room.jpg\n对话|少女|calm|你好。';
    expect(repairRecoverableOutput(truncated)).toEqual({ text: truncated, repairedTags: [] });
  });

  it('accepts 认知/动作 maintext lines', () => {
    const parsed = {
      ...baseParsed,
      maintext: '场景|room.jpg\n对话|少女|calm|你好。\n动作|少女|nod\n认知|meet:old-man',
    };
    const errors = protocol.validate('x', parsed);
    expect(errors.some(e => e.code === 'MAINTEXT_INVALID_LINES')).toBe(false);
  });

  it('reports unknown maintext line directives', () => {
    const parsed = { ...baseParsed, maintext: '场景|room.jpg\n未知|xxx' };
    const errors = protocol.validate('x', parsed);
    expect(errors.some(e => e.code === 'MAINTEXT_INVALID_LINES')).toBe(true);
  });

  it('accepts every English directive alias supported by the scene parser', () => {
    const raw = `<maintext>
scene|home
bgm|rain
music|rain
effect|lightning-flash
animation|touko|idle
dialog|旁白|calm|第一行。
dialogue|灯织|calm|第二行。
knowledge|touko-name
</maintext>
<option>继续</option>
<option>离开</option>
<sum>测试</sum>
<vars>{}</vars>`;
    const parsed = {
      thinking: '',
      maintext: raw.match(/<maintext>([\s\S]*?)<\/maintext>/)?.[1].trim() ?? '',
      options: ['继续', '离开'],
      summary: '测试',
      vars: {},
      observe: '',
      investigateItems: [],
      actionItems: [],
    };

    expect(createOutputProtocol().validate(raw, parsed)).toEqual([]);
  });

  it('formats errors', () => {
    const errors = [{ code: 'X', message: 'bad', tag: 'maintext' }];
    expect(formatValidationErrors(errors)).toContain('bad');
  });
});
