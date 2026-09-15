import { describe, expect, it, vi } from 'vitest';
import { completeParsedStructured, completeStructured, extractJson, resetResponseFormatSupportCache } from './structured';

describe('completeParsedStructured', () => {
  it('includes the current schema and root fields when metadata validation fails in JSON Object mode', async () => {
    resetResponseFormatSupportCache();
    const schema = {
      type: 'object',
      required: ['approved', 'assertionAudit', 'continuityAudit', 'actionAudit'],
      properties: {
        approved: { type: 'boolean' },
        assertionAudit: { type: 'object', additionalProperties: false },
        continuityAudit: { type: 'object' },
        actionAudit: { type: 'object' },
      },
      additionalProperties: false,
    };
    const misplaced = '{"approved":false,"assertionAudit":{"continuityAudit":{},"actionAudit":{}}}';
    const corrected = '{"approved":false,"assertionAudit":{},"continuityAudit":{},"actionAudit":{}}';
    const parse = (text: string) => {
      const value = JSON.parse(text);
      if (!value.continuityAudit || !value.actionAudit) {
        throw new Error('continuityAudit / actionAudit 必须为根对象字段');
      }
      return value;
    };
    const complete = vi.fn().mockResolvedValueOnce(misplaced).mockResolvedValueOnce(corrected);
    const messages = [{ role: 'user' as const, content: 'review this' }];
    const controller = new AbortController();

    await expect(completeParsedStructured(complete, 'https://api.deepseek.com/v1|deepseek-v4-flash',
      messages, { temperature: 0.6, abortSignal: controller.signal },
      { type: 'json_schema', json_schema: { name: 'review', schema } }, parse))
      .resolves.toEqual({ approved: false, assertionAudit: {}, continuityAudit: {}, actionAudit: {} });

    expect(complete).toHaveBeenCalledTimes(2);
    const [retryMessages, retryOptions] = complete.mock.calls[1];
    expect(retryOptions).toEqual({ temperature: 0, abortSignal: controller.signal, responseFormat: { type: 'json_object' } });
    expect(retryMessages.slice(0, -1)).toEqual([...messages, { role: 'assistant', content: misplaced }]);
    const instruction = retryMessages.at(-1).content;
    expect(instruction).toContain('校验失败');
    expect(instruction).not.toContain('不可解析');
    expect(instruction).toContain(JSON.stringify(schema));
    expect(instruction).toContain('根对象必需字段');
    expect(instruction).toContain(JSON.stringify(schema.required));
    expect(instruction).toContain('同一层级');
    expect(instruction).toContain('不得嵌套');
    expect(instruction).toContain('不得编造');
    expect(instruction).toContain('默认值');
  });

  it.each([
    ['root object', '{"approved":false,"assertions":[{"reason":"现场描述"}]'],
    ['array and root object', '{"approved":false,"assertions":[{"reason":"现场描述"}'],
  ])('identifies an unfinished %s as an end-of-JSON error', async (_name, malformed) => {
    const corrected = '{"approved":false,"assertions":[{"reason":"现场描述"}]}';
    const complete = vi.fn().mockResolvedValueOnce(malformed).mockResolvedValueOnce(corrected);

    await expect(completeParsedStructured(complete, `unfinished-${_name}`, [], {},
      { type: 'json_object' }, extractJson)).resolves.toEqual(JSON.parse(corrected));

    expect(complete).toHaveBeenCalledTimes(2);
    const instruction = complete.mock.calls[1][0].at(-1).content;
    expect(instruction).toContain('JSON 语法');
    expect(instruction).toContain('末尾');
    expect(instruction).toContain('闭合');
    expect(instruction).toContain('}');
    expect(instruction).toContain(']');
    expect(instruction).not.toContain('字符串之外');
    expect(complete.mock.calls[1][0].at(-2)).toEqual({ role: 'assistant', content: malformed });
  });

  it('throws a repeated metadata validation failure after the one retry', async () => {
    const invalid = '{"approved":true}';
    const complete = vi.fn().mockResolvedValue(invalid);
    const validationError = new Error('actionAudit 缺少原文证据');

    await expect(completeParsedStructured(complete, 'repeated-invalid-metadata', [], {},
      { type: 'json_object' }, text => {
        JSON.parse(text);
        throw validationError;
      })).rejects.toBe(validationError);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0].at(-1).content).toContain('校验失败');
  });

  it('recognizes an unexpected-end syntax error without a reported position', async () => {
    const malformed = '{"approved":false';
    const complete = vi.fn().mockResolvedValueOnce(malformed).mockResolvedValueOnce('{"approved":false}');
    const parse = (text: string) => {
      try {
        return JSON.parse(text);
      } catch {
        // Older JSON.parse engines report EOF without a character offset.
        throw new SyntaxError('Unexpected end of JSON input');
      }
    };

    await expect(completeParsedStructured(complete, 'unexpected-end', [], {},
      { type: 'json_object' }, parse)).resolves.toEqual({ approved: false });
    expect(complete.mock.calls[1][0].at(-1).content).toContain('末尾');
    expect(complete.mock.calls[1][0].at(-1).content).toContain('闭合');
  });

  it('returns valid structured content without requesting a repair', async () => {
    const complete = vi.fn().mockResolvedValue('{"approved":false}');

    await expect(completeParsedStructured(complete, 'valid-first-response', [], {},
      { type: 'json_object' }, JSON.parse)).resolves.toEqual({ approved: false });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('propagates completion aborts without further calls (during retry: %s)', async duringRetry => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    const complete = vi.fn();
    if (duringRetry) complete.mockResolvedValueOnce('{"approved":');
    complete.mockRejectedValue(abort);

    await expect(completeParsedStructured(complete, `abort-${duringRetry}`, [], {},
      { type: 'json_object' }, JSON.parse)).rejects.toBe(abort);
    expect(complete).toHaveBeenCalledTimes(duringRetry ? 2 : 1);
  });

  it('pinpoints stray tokens for the existing retry without accepting an invalid review', async () => {
    const malformed = '{"approved":true,"assertions":[{"reason":"现场描述"}遮]}';
    const corrected = '{"approved":true,"assertions":[{"reason":"现场描述"}]}';
    const complete = vi.fn().mockResolvedValueOnce(malformed).mockResolvedValueOnce(corrected);
    await expect(completeParsedStructured(complete, 'stray-token-review', [], {},
      { type: 'json_object' }, JSON.parse)).resolves.toEqual(JSON.parse(corrected));
    expect(complete).toHaveBeenCalledTimes(2);
    const instruction = complete.mock.calls[1][0].at(-1).content;
    expect(instruction).toContain('出错位置附近');
    expect(instruction).toContain('遮');
    expect(instruction).toContain('字符串之外');

    const stillInvalid = vi.fn().mockResolvedValue(malformed);
    await expect(completeParsedStructured(stillInvalid, 'still-invalid-review', [], {},
      { type: 'json_object' }, JSON.parse)).rejects.toThrow(SyntaxError);
    expect(stillInvalid).toHaveBeenCalledTimes(2);
  });

  it('uses JSON Object for measured DeepSeek endpoints, leaving other hosts unchanged', async () => {
    resetResponseFormatSupportCache();
    for (const [key, expected] of [
      ['https://api.deepseek.com/v1|deepseek-v4-flash', 'json_object'],
      ['https://oneapi.hakoyu.com/v1|deepseek-flash【果汁】', 'json_object'],
      ['https://oneapi.hakoyu.com/v1|deepseek-flash-none【果汁】', 'json_object'],
      ['https://oneapi.hakoyu.com.evil.example/v1|deepseek-flash【果汁】', 'json_schema'],
      ['https://proxy.example/v1|deepseek-flash【果汁】', 'json_schema'],
      ['https://proxy.example/v1|deepseek-v4-flash', 'json_schema'],
      ['https://api.deepseek.com.evil.example/v1|deepseek-v4-flash', 'json_schema'],
    ]) {
      const complete = vi.fn().mockResolvedValue('{}');
      await completeStructured(complete, key, [], {}, { type: 'json_schema',
        json_schema: { name: 'test', schema: { type: 'object' } } });
      expect(complete.mock.calls[0][1].responseFormat.type).toBe(expected);
      expect(complete).toHaveBeenCalledTimes(1);
    }
  });
  it('feeds an invalid structured response back once and parses the correction', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"approved":true}');

    const result = await completeParsedStructured(
      complete,
      'test-model',
      [{ role: 'user', content: 'review this' }],
      { temperature: 0 },
      { type: 'json_object' },
      text => JSON.parse(text) as { approved: boolean },
    );

    expect(result).toEqual({ approved: true });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0]).toEqual(expect.arrayContaining([
      { role: 'assistant', content: 'not json' },
      expect.objectContaining({ role: 'user', content: expect.stringContaining('不可解析') }),
    ]));
  });

  it('remembers schema dialect compatibility per exact schema without cross-schema overwrite', async () => {
    resetResponseFormatSupportCache();
    const calls: string[] = [];
    const complete = vi.fn(async (_messages, options) => {
      const format = options?.responseFormat;
      const label = format?.type === 'json_schema' ? `json_schema:${format.json_schema.name}` : format?.type ?? 'text';
      calls.push(label);
      if (label === 'json_schema:nested-audit') {
        throw new Error('API error 400: Unknown name "additionalProperties" at generation_config.response_schema');
      }
      return '{}';
    });
    const nestedAudit = { type: 'json_schema' as const,
      json_schema: { name: 'nested-audit', schema: { type: 'object', additionalProperties: false } } };
    const simpleReview = { type: 'json_schema' as const,
      json_schema: { name: 'simple-review', schema: { type: 'object' } } };

    await completeStructured(complete, 'https://proxy.test/v1|model', [], {}, nestedAudit);
    await completeStructured(complete, 'https://proxy.test/v1|model', [], {}, simpleReview);
    await completeStructured(complete, 'https://proxy.test/v1|model', [], {}, {
      type: 'json_schema',
      json_schema: { schema: { additionalProperties: false, type: 'object' }, name: 'nested-audit' },
    });

    expect(calls).toEqual([
      'json_schema:nested-audit', 'json_object',
      'json_schema:simple-review',
      'json_object',
    ]);
  });

  it('does not learn a response-format downgrade from an unrelated client error', async () => {
    resetResponseFormatSupportCache();
    const complete = vi.fn().mockRejectedValue(new Error('API error 400: invalid request payload'));

    await expect(completeStructured(complete, 'https://proxy.test/v1|generic-400', [], {}, {
      type: 'json_schema', json_schema: { name: 'review', schema: { type: 'object' } },
    })).rejects.toThrow('invalid request payload');
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
