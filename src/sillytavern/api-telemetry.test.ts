import { afterEach, describe, expect, it, vi } from 'vitest';
import { callSecondaryApi, streamChatCompletion, type ApiConfig } from './api-router';
import { estimateApiCost, parseApiUsage, type ApiRequestEvent } from './api-telemetry';

const base = { baseUrl: 'https://example.test/v1', apiKey: 'private', model: 'test' };
const messages = [{ role: 'user' as const, content: 'private prompt' }];
const response = (usage?: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: 'answer' } }], usage }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('request scoped transport accounting', () => {
  it('ignores non-object SSE frames without retrying a valid stream', async () => {
    const events: ApiRequestEvent[] = [];
    const onToken = vi.fn();
    const fetch = vi.fn().mockResolvedValue(new Response('data: null\ndata: false\ndata: []\n'
      + 'data: {"choices":[{"delta":{"content":"answer"}}]}\n'
      + 'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2}}\ndata: [DONE]\n'));
    vi.stubGlobal('fetch', fetch);
    await streamChatCompletion({ ...base, telemetry: { onRequest: event => events.push(event) } }, messages, null,
      { onToken, onComplete: vi.fn(), onError: vi.fn() }, undefined, { retries: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledExactlyOnceWith('answer');
    expect(events[0]).toMatchObject({ usage: { inputTokens: 8, outputTokens: 2 } });
  });
  it('counts network failures as real attempts and brackets each dispatch', async () => {
    const events: ApiRequestEvent[] = [];
    const onRequestStart = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(response({ prompt_tokens: 2, completion_tokens: 1 })));
    await callSecondaryApi({ ...base, telemetry: { onRequestStart, onRequest: event => events.push(event) } }, messages, null);
    expect(onRequestStart).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ outcome: 'failed', status: null, usage: null });
    expect(events[1]).toMatchObject({ outcome: 'success', kind: 'auth-fallback' });
  });

  it('counts server retries separately from one logical correction', async () => {
    const events: ApiRequestEvent[] = [];
    const onRepair = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(response({ prompt_tokens: 2, completion_tokens: 1 })));
    await callSecondaryApi({ ...base, telemetry: { onRequest: event => events.push(event), onRepair } }, messages, null, { repairKind: 'director' });
    expect(events.map(event => event.kind)).toEqual(['request', 'retry']);
    expect(onRepair).toHaveBeenCalledExactlyOnceWith('director');
  });

  it('marks interrupted streams as unknown even after an interim usage frame', async () => {
    const events: ApiRequestEvent[] = [];
    let sent = false;
    const stream = new ReadableStream({ pull(controller) {
      if (sent) { controller.error(new Error('connection lost')); return; }
      sent = true;
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"answer"}}],"usage":{"prompt_tokens":9,"completion_tokens":1}}\n'));
    } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    await expect(streamChatCompletion({ ...base, telemetry: { onRequest: e => events.push(e) } }, messages, null, {
      onToken: vi.fn(), onError: vi.fn(), onComplete: vi.fn(),
    })).rejects.toThrow('剧情生成中断');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'failed', usage: null, cost: null });
  });

  it('keeps transport success and duration when the downstream commit fails', async () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const events: ApiRequestEvent[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      vi.advanceTimersByTime(20);
      return new Response('data: {"choices":[{"delta":{"content":"answer"}}]}\ndata: [DONE]\n');
    }));
    await expect(streamChatCompletion({ ...base, telemetry: { onRequest: e => events.push(e) } }, messages, null, {
      onToken: vi.fn(), onError: vi.fn(), onComplete: () => {
        vi.advanceTimersByTime(200);
        throw new Error('commit failed');
      },
    })).rejects.toThrow('commit failed');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'success', durationMs: 20 });
  });
  it('counts authentication attempts, records usage once and reports one logical repair', async () => {
    const events: ApiRequestEvent[] = [];
    const onRepair = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(response({ prompt_tokens: 120, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } })));
    await callSecondaryApi({ ...base, telemetry: { onRequest: e => events.push(e), onRepair } }, messages, null, { repairKind: 'structured' });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ status: 401, outcome: 'failed', usage: null });
    expect(events[1]).toMatchObject({ status: 200, outcome: 'success', usage: { inputTokens: 120, outputTokens: 20, cachedInputTokens: 40 } });
    expect(onRepair).toHaveBeenCalledExactlyOnceWith('structured');
    expect(JSON.stringify(events)).not.toMatch(/private|example|answer/);
  });

  it('finishes streamed usage before downstream commit and consumes trailing usage-only frames', async () => {
    const events: ApiRequestEvent[] = [];
    const payload = 'data: {"choices":[{"delta":{"content":"answer"}}]}\n\n'
      + 'data: {"usage":{"prompt_tokens":100,"completion_tokens":5},"choices":[]}\n\n'
      + 'data: {"usage":{"prompt_tokens":100,"completion_tokens":8},"choices":[]}';
    const fetch = vi.fn().mockResolvedValue(new Response(payload));
    vi.stubGlobal('fetch', fetch);
    await streamChatCompletion({ ...base, telemetry: { onRequest: e => events.push(e) } }, messages, null, {
      onToken: vi.fn(), onError: vi.fn(), onComplete: () => {
        expect(events).toHaveLength(1);
        expect(events[0].usage?.outputTokens).toBe(8);
      },
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).stream_options).toEqual({ include_usage: true });
  });

  it('retries narrowly without stream options on explicit unsupported-field rejection', async () => {
    const events: ApiRequestEvent[] = [];
    const fetch = vi.fn().mockResolvedValueOnce(new Response('stream_options is unsupported', { status: 400 }))
      .mockResolvedValueOnce(new Response('data: {"choices":[{"delta":{"content":"answer"}}]}\ndata: [DONE]\n'));
    vi.stubGlobal('fetch', fetch);
    await streamChatCompletion({ ...base, telemetry: { onRequest: e => events.push(e) } }, messages, null, {
      onToken: vi.fn(), onError: vi.fn(), onComplete: vi.fn(),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('stream_options');
    expect(events).toHaveLength(2);
    expect(events[1].usage).toBeNull();
  });

  it('isolates concurrent observers and makes observer failures harmless', async () => {
    const other = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(response())));
    const bad: ApiConfig = { ...base, telemetry: { onRequest: () => { throw new Error('observer'); }, onRepair: () => { throw new Error('observer'); } } };
    await expect(Promise.all([
      callSecondaryApi(bad, messages, null, { repairKind: 'director' }),
      callSecondaryApi({ ...base, telemetry: { onRequest: other } }, messages, null),
    ])).resolves.toEqual(['answer', 'answer']);
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe('usage and optional prices', () => {
  it('validates usage without inventing missing counts', () => {
    expect(parseApiUsage({ prompt_tokens: 8 })).toEqual({ inputTokens: 8, outputTokens: null, cachedInputTokens: null });
    expect(parseApiUsage({ input_tokens: 8, output_tokens: 3, input_tokens_details: { cached_tokens: 4 }, cost: 9000 }))
      .toEqual({ inputTokens: 8, outputTokens: 3, cachedInputTokens: 4 });
    expect(parseApiUsage({ prompt_tokens: -3, completion_tokens: '5' })).toBeNull();
  });
  it('binds prices to endpoint and model and exposes partial estimates', () => {
    const pricing = { ...base, currency: 'USD' as const, inputPerMillion: 2, outputPerMillion: 10, cachedInputPerMillion: 0.5 };
    const usage = { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40 };
    expect(estimateApiCost(usage, pricing, base)).toEqual({ currency: 'USD', amount: 0.00034, complete: true });
    expect(estimateApiCost(usage, pricing, { ...base, model: 'other' })).toBeNull();
    expect(estimateApiCost(usage, pricing, { ...base, baseUrl: 'https://other.test' })).toBeNull();
    expect(estimateApiCost(usage, { ...pricing, outputPerMillion: undefined }, base)).toMatchObject({ complete: false });
    expect(estimateApiCost(null, pricing, base)).toBeNull();
    expect(estimateApiCost({ ...usage, cachedInputTokens: null }, pricing, base)).toEqual({ currency: 'USD', amount: 0.0002, complete: false });
    expect(estimateApiCost(usage, { ...pricing, currency: 'EUR' } as never, base)).toBeNull();
  });
});
