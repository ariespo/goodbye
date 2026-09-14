import { describe, expect, it, vi } from 'vitest';
import { completeParsedStructured, completeStructured, resetResponseFormatSupportCache } from './structured';

describe('completeParsedStructured', () => {
  it('uses JSON Object directly for the measured DeepSeek V4 endpoint, leaving other hosts unchanged', async () => {
    resetResponseFormatSupportCache();
    for (const [key, expected] of [
      ['https://api.deepseek.com/v1|deepseek-v4-flash', 'json_object'],
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
