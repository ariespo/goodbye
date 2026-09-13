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

  it('names unsupported instructions so repair can fix the actual offending lines', () => {
    const maintext = baseParsed.maintext + '\n角色|touko-half-closed';
    const errors = protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext });
    expect(errors.find(error => error.code === 'MAINTEXT_INVALID_LINES')?.message).toContain('角色|touko-half-closed');
  });

  it('rejects a scene with only background/music even when all prose is hidden in observe', () => {
    const maintext = '场景|senpai-building\n音乐|rain';
    const raw = `<maintext>${maintext}<observe>对话|旁白|calm|你等待了两个小时。</observe></maintext><option>A\nB</option><sum>等候</sum>`;
    expect(protocol.validate(raw, { ...baseParsed, maintext, observe: '你等待了两个小时。' }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EMPTY_PLAYABLE_SCENE' })]));
  });

  it('does not display escaped instruction separators as part of a dialogue line', () => {
    const maintext = '对话|旁白|calm|雨没有停。\\n对话|旁白|calm|手机响了。';
    expect(protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ESCAPED_INSTRUCTION_NEWLINE' })]));
  });

  it('rejects literal escaped newlines embedded in ordinary dialogue text', () => {
    const maintext = '对话|旁白|calm|雨没有停。\\n手机也没有响。';
    expect(protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ESCAPED_DIALOGUE_NEWLINE' })]));
  });

  it('keeps escaped JSON and Windows path backslashes valid in dialogue', () => {
    const maintext = String.raw`对话|旁白|calm|路径 C:\\new\\file.json`;
    expect(protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext }))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ESCAPED_DIALOGUE_NEWLINE' })]));
  });

  it('rejects a literal newline escape before an NPC token in ordinary dialogue', () => {
    const maintext = String.raw`对话|旁白|calm|NPC说：\nNPC随后离开。`;
    expect(protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ESCAPED_DIALOGUE_NEWLINE' })]));
  });

  it('keeps Windows paths containing n or r segments valid', () => {
    const maintext = String.raw`对话|旁白|calm|日志 C:\n\file.json 与 C:\r.txt 已保存。`;
    expect(protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext }))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ESCAPED_DIALOGUE_NEWLINE' })]));
  });

  it('handles drive paths adjacent to Chinese text while still rejecting escapes outside a path', () => {
    const cases = [
      { text: String.raw`C:\new\file.json`, valid: true },
      { text: String.raw`路径C:\new\file.json。`, valid: true },
      { text: String.raw`路径：C:\r.txt。`, valid: true },
      { text: String.raw`路径 C:\new\file.json。\nNPC`, valid: false },
    ];
    for (const { text, valid } of cases) {
      const maintext = `对话|旁白|calm|${text}`;
      const errors = protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext });
      expect(errors.some(error => error.code === 'ESCAPED_DIALOGUE_NEWLINE')).toBe(!valid);
    }
  });

  it('does not treat drive-like text inside ASCII words as a Windows path', () => {
    const cases = [
      { text: String.raw`NPC:\nNPC随后离开。`, valid: false },
      { text: String.raw`ABC:\rABC随后离开。`, valid: false },
      { text: String.raw`路径：C:\n\file.json。`, valid: true },
      { text: String.raw`他说“C:\r.txt”后离开。`, valid: true },
    ];
    for (const { text, valid } of cases) {
      const maintext = `对话|旁白|calm|${text}`;
      const errors = protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext });
      expect(errors.some(error => error.code === 'ESCAPED_DIALOGUE_NEWLINE')).toBe(!valid);
    }
  });

  it('ends Windows path masking at Chinese closing quotes', () => {
    const cases = [
      { text: String.raw`他说“C:\r.txt”\nNPC随后离开。`, valid: false },
      { text: String.raw`他说‘C:\new\file.json’\rNPC随后离开。`, valid: false },
      { text: String.raw`他说“C:\r.txt”后离开。`, valid: true },
      { text: String.raw`他说‘C:\new\file.json’后离开。`, valid: true },
    ];
    for (const { text, valid } of cases) {
      const maintext = `对话|旁白|calm|${text}`;
      const errors = protocol.validate(`<maintext>${maintext}</maintext>`, { ...baseParsed, maintext });
      expect(errors.some(error => error.code === 'ESCAPED_DIALOGUE_NEWLINE')).toBe(!valid);
    }
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
