import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiCallError, callSecondaryApi, type ResponseFormat } from '../../sillytavern/api-router';
import { completeParsedStructured, completeStructured, resetResponseFormatSupportCache } from './structured';
import { DIRECTOR_PLAN_RESPONSE_FORMAT } from './schemas';
import { prepareMysteryTurn } from './orchestrator';

const grammarError = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.';
const config = { baseUrl: 'https://gateway.test/v1', apiKey: 'test-key', model: 'test-model' };
const plan = { turnGoal: '观察房间', tone: '克制', beats: [{ id: 'b1', purpose: '观察', description: '查看桌面' }],
  revelations: [], optionIntents: [{ id: 'o1', intent: '休息', tone: '谨慎', expectedPressure: 'low' }], assetRequests: [] };
const format: ResponseFormat = { type: 'json_schema', json_schema: { name: 'audit', strict: true, schema: {
  type: 'object', additionalProperties: false, required: ['reviewed'], properties: { reviewed: { type: 'boolean', const: true } },
} } };

beforeEach(resetResponseFormatSupportCache);
afterEach(() => vi.unstubAllGlobals());

describe('schema compilation limits', () => {
  it.each([grammarError, 'Schema is too complex for compilation.'])('falls back on the exact provider error and remembers only that schema: %s', async message => {
    const error = new ApiCallError(`API error 400: ${JSON.stringify({ error: { type: 'invalid_request_error', message } })}`, 'http4xx', 400);
    const complete = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(JSON.stringify(plan));
    const input = [{ role: 'user' as const, content: 'Return a JSON scene plan.' }];
    await expect(completeParsedStructured(complete, 'same-endpoint|model', input, {}, DIRECTOR_PLAN_RESPONSE_FORMAT, JSON.parse)).resolves.toEqual(plan);
    await expect(completeParsedStructured(complete, 'same-endpoint|model', input, {}, DIRECTOR_PLAN_RESPONSE_FORMAT, JSON.parse)).resolves.toEqual(plan);
    const simple: ResponseFormat = { type: 'json_schema', json_schema: { name: 'simple', schema: { type: 'object' } } };
    await completeStructured(complete, 'same-endpoint|model', input, {}, simple);
    await completeStructured(complete, 'different-endpoint|model', input, {}, DIRECTOR_PLAN_RESPONSE_FORMAT);
    expect(complete.mock.calls.map(call => call[1].responseFormat.type)).toEqual(['json_schema', 'json_object', 'json_object', 'json_schema', 'json_schema']);
    expect(complete.mock.calls[1][1].requestKind).toBe('format-fallback');
    expect(complete.mock.calls[2][1].requestKind).toBeUndefined();
  });

  it('keeps original constraints and repairs a malformed fallback only once', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new ApiCallError(grammarError, 'http4xx', 400))
      .mockResolvedValueOnce('{"reviewed":false}').mockResolvedValueOnce('{"reviewed":true}');
    await expect(completeParsedStructured(complete, 'local-validation', [], {}, format, JSON.parse)).resolves.toEqual({ reviewed: true });
    expect(complete.mock.calls.map(call => call[1].responseFormat.type)).toEqual(['json_schema', 'json_object', 'json_object']);
    expect(complete.mock.calls[2][0].at(-1).content).toContain('const');
    const stillInvalid = vi.fn().mockResolvedValue('{"reviewed":false}');
    await expect(completeParsedStructured(stillInvalid, 'local-validation', [], {}, format, JSON.parse)).rejects.toThrow('const');
    expect(stillInvalid).toHaveBeenCalledTimes(2);
  });

  it('also validates a plain-text fallback if the gateway rejects JSON Object', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new ApiCallError(grammarError, 'http4xx', 400))
      .mockRejectedValueOnce(new ApiCallError('response_format json_object is not supported', 'http4xx', 400))
      .mockResolvedValue('{"extra":true}');
    await expect(completeParsedStructured(complete, 'text-fallback', [], {}, format, JSON.parse)).rejects.toThrow('reviewed');
    expect(complete.mock.calls.map(call => call[1].responseFormat?.type)).toEqual(['json_schema', 'json_object', undefined, undefined]);
  });

  it.each([
    { type: 'string', pattern: '^APPROVED$' },
    { anyOf: [{ type: 'string', format: 'email' }] },
  ])('refuses fallback when the original schema contains constraints the local validator cannot enforce: %j', async constraint => {
    const unsupported: ResponseFormat = { type: 'json_schema', json_schema: { name: 'unsupported-local-constraint', schema: {
      type: 'object', required: ['code'], properties: { code: constraint },
    } } };
    const complete = vi.fn().mockRejectedValueOnce(new ApiCallError(grammarError, 'http4xx', 400)).mockResolvedValue('{"code":"invalid"}');
    await expect(completeParsedStructured(complete, 'unsupported-local-constraint', [], {}, unsupported, JSON.parse)).rejects.toThrow('无法安全降级');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('handles a compilation limit on a dialect-adapted schema without retrying that schema next time', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new ApiCallError('response_schema additionalProperties is not supported', 'http4xx', 400))
      .mockRejectedValueOnce(new ApiCallError(grammarError, 'http4xx', 400)).mockResolvedValue('{"reviewed":true}');
    await expect(completeParsedStructured(complete, 'adapted-limit', [], {}, format, JSON.parse)).resolves.toEqual({ reviewed: true });
    await expect(completeParsedStructured(complete, 'adapted-limit', [], {}, format, JSON.parse)).resolves.toEqual({ reviewed: true });
    expect(complete.mock.calls.map(call => call[1].responseFormat.type)).toEqual(['json_schema', 'json_schema', 'json_object', 'json_object']);
  });

  it.each([401, 403, 429, 503])('does not downgrade after unrelated HTTP %i even if its message mentions grammar', async status => {
    const error = new ApiCallError(grammarError, status === 429 ? 'rate_limit' : status >= 500 ? 'http5xx' : 'http4xx', status);
    const complete = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('{"reviewed":true}');
    await expect(completeStructured(complete, 'unrelated-error', [], {}, format)).rejects.toBe(error);
    await completeStructured(complete, 'unrelated-error', [], {}, format);
    expect(complete.mock.calls.map(call => call[1].responseFormat.type)).toEqual(['json_schema', 'json_schema']);
  });

  it.each(['rate_limit', 'http5xx', 'timeout', 'abort', 'network'] as const)('does not poison capability support after a status-less %s error', async kind => {
    const error = new ApiCallError(grammarError, kind);
    const complete = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('{"reviewed":true}');
    await expect(completeStructured(complete, 'transient-kind', [], {}, format)).rejects.toBe(error);
    await completeStructured(complete, 'transient-kind', [], {}, format);
    expect(complete.mock.calls.map(call => call[1].responseFormat.type)).toEqual(['json_schema', 'json_schema']);
  });

  it('does not interpret quoted prose in a valid response as a provider failure', async () => {
    const raw = JSON.stringify({ description: grammarError });
    const complete = vi.fn().mockResolvedValue(raw);
    await expect(completeStructured(complete, 'valid-prose', [], {}, format)).resolves.toBe(raw);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('preserves a grammar-limit classification through a wrapped HTTP 200 proxy error', async () => {
    const formats: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const selected = JSON.parse(String(init.body)).response_format.type;
      formats.push(selected);
      const content = selected === 'json_schema'
        ? `### **Proxy error (HTTP 400 Bad Request)**\n${grammarError}\n<!-- oai-proxy-error -->` : '{"reviewed":true}';
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    const complete = (messages: Parameters<typeof callSecondaryApi>[1], options: Parameters<typeof callSecondaryApi>[3]) => callSecondaryApi(config, messages, null, options);
    await expect(completeParsedStructured(complete, 'wrapped-grammar-error', [], {}, format, JSON.parse)).resolves.toEqual({ reviewed: true });
    expect(formats).toEqual(['json_schema', 'json_object']);
  });

  it('finishes the real strict orchestration pipeline after an OR-shaped Director grammar rejection', async () => {
    let rejected = false;
    const formats: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const selected = body.response_format;
      formats.push(selected.type);
      if (selected.json_schema?.name === 'director_plan' && !rejected) {
        rejected = true;
        return new Response(JSON.stringify({ error: { code: 400, message: 'Provider returned error', metadata: {
          raw: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: grammarError } }),
        } } }), { status: 400 });
      }
      const review = body.messages[0].content.includes('事实复核') || body.messages[0].content.includes('节奏与玩家能动性');
      const content = JSON.stringify(review ? { approved: true, violations: [], corrections: [] } : plan);
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
    });
    const result = await prepareMysteryTurn({ mode: 'strict', api: config, preset: null,
      truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [] },
      turnContext: { playerInput: '观察房间' }, presentationContext: {},
    });
    expect(result.hardReview.approved).toBe(true);
    expect(result.semanticReview?.approved).toBe(true);
    expect(result.pacingReview?.approved).toBe(true);
    expect(result.writerMessages.length).toBeGreaterThan(0);
    expect(formats).toEqual(['json_schema', 'json_object', 'json_schema', 'json_schema']);
  });
});
