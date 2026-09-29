import { afterEach, describe, expect, it, vi } from 'vitest';
import { callSecondaryApi, streamChatCompletion, type ApiConfig } from './api-router';
import { completeStructured, resetResponseFormatSupportCache } from '../agents/mystery/structured';
import type { ApiRequestEvent } from './api-telemetry';

const config: ApiConfig = { baseUrl: 'https://gateway.test/v1', apiKey: 'test-key', model: 'test-model' };
const messages = [{ role: 'user' as const, content: 'continue' }];

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
}

function stream(frames: unknown[]): Response {
  return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetResponseFormatSupportCache(); });

describe('provider errors inside successful HTTP responses', () => {
  it.each([
    'response_format json_schema is not supported',
    JSON.stringify({ error: { message: 'response_format json_schema is not supported' } }),
    { error: { message: 'response_format json_schema is not supported' } },
  ])('retains upstream capability detail inside metadata.raw: %j', async raw => {
    const formats: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const format = JSON.parse(String(init.body)).response_format.type;
      formats.push(format);
      return format === 'json_schema'
        ? json({ error: { code: 400, message: 'Provider returned error', metadata: { raw } } })
        : json({ choices: [{ message: { content: '{"approved":true}' } }] });
    });
    const result = await completeStructured((input, options) => callSecondaryApi(config, input, null, options),
      'upstream-capability', messages, {}, { type: 'json_schema', json_schema: { name: 'review', schema: { type: 'object' } } });
    expect(JSON.parse(result)).toEqual({ approved: true });
    expect(formats).toEqual(['json_schema', 'json_object']);
  });
  it('preserves a JSON capability error so structured output can use its existing fallback', async () => {
    const formats: unknown[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const format = JSON.parse(String(init.body)).response_format.type;
      formats.push(format);
      return format === 'json_schema'
        ? json({ error: { code: 400, message: 'response_format json_schema is not supported' } })
        : json({ choices: [{ message: { content: '{"approved":true}' }, finish_reason: 'stop' }] });
    });
    const result = await completeStructured((input, options) => callSecondaryApi(config, input, null, options),
      'gateway-errors', messages, {}, { type: 'json_schema', json_schema: { name: 'review', schema: { type: 'object' } } });
    expect(JSON.parse(result)).toEqual({ approved: true });
    expect(formats).toEqual(['json_schema', 'json_object']);
  });

  it('retries a transient SSE error before any narrative content', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', async () => ++attempts === 1
      ? stream([{ error: { code: 503, message: 'Provider unavailable' }, choices: [{ delta: {}, finish_reason: 'error' }] }])
      : stream([{ choices: [{ delta: { content: '正文' }, finish_reason: 'stop' }] }]));
    const tokens: string[] = [];
    await streamChatCompletion(config, messages, null, {
      onToken: token => tokens.push(token), onComplete: () => {}, onError: () => {},
    }, undefined, { baseDelayMs: 1 });
    expect(tokens.join('')).toBe('正文');
    expect(attempts).toBe(2);
  });

  it('does not complete or retry a partial narrative followed by a provider error', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', async () => {
      attempts++;
      return stream([
        { choices: [{ delta: { content: '未完成正文' } }] },
        { error: { code: 502, message: 'Provider disconnected unexpectedly' }, choices: [{ delta: {}, finish_reason: 'error' }] },
      ]);
    });
    let completed = false;
    await expect(streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => { completed = true; }, onError: () => {},
    }, undefined, { baseDelayMs: 1 })).rejects.toMatchObject({
      kind: 'stream_interrupted', status: 502, message: expect.stringContaining('Provider disconnected unexpectedly'),
    });
    expect(completed).toBe(false);
    expect(attempts).toBe(1);
  });

  it('preserves a JSON provider error returned to a streaming request', async () => {
    vi.stubGlobal('fetch', async () => json({ error: { code: 402, message: 'Insufficient credits' } }));
    await expect(streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => {}, onError: () => {},
    }, undefined, { retries: 0 })).rejects.toMatchObject({ status: 402, message: expect.stringContaining('Insufficient credits') });
  });

  it('rejects finish_reason error even if the provider omitted the error object', async () => {
    vi.stubGlobal('fetch', async () => stream([{ choices: [{ delta: { content: 'partial' }, finish_reason: 'error' }] }]));
    let completed = false;
    await expect(streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => { completed = true; }, onError: () => {},
    }, undefined, { retries: 0 })).rejects.toThrow();
    expect(completed).toBe(false);
  });

  it('cancels a failed response before retrying instead of leaving overlapping streams open', async () => {
    let cancelled = false;
    let retryStartedAfterCancel = false;
    let attempts = 0;
    vi.stubGlobal('fetch', async () => {
      if (++attempts > 1) {
        retryStartedAfterCancel = cancelled;
        return stream([{ choices: [{ delta: { content: '正文' } }] }]);
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"error":{"code":503,"message":"Unavailable"}}\n\n'));
        },
        cancel() { cancelled = true; },
      }));
    });
    await streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => {}, onError: () => {},
    }, undefined, { baseDelayMs: 1 });
    expect(retryStartedAfterCancel).toBe(true);
  });

  it('closes the Writer response before its completion callback starts downstream requests', async () => {
    let cancelled = false;
    let callbackSawClosedResponse = false;
    vi.stubGlobal('fetch', async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"正文"}}]}\n\ndata: [DONE]\n\n'));
      },
      cancel() { cancelled = true; },
    })));
    await streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => { callbackSawClosedResponse = cancelled; }, onError: () => {},
    });
    expect(callbackSawClosedResponse).toBe(true);
  });
});

describe('response-body timeout attribution', () => {
  function bodyThatAborts(init: RequestInit, prefix = ''): Response {
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        if (prefix) controller.enqueue(new TextEncoder().encode(prefix));
        init.signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
      },
    }));
  }

  it('reports streaming body timeout instead of silently treating it as player cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => bodyThatAborts(init));
    const result = streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => {}, onError: () => {},
    }, undefined, { idleTimeoutMs: 10, retries: 0 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toMatchObject({ kind: 'timeout', message: expect.stringContaining('超时') });
  });

  it('retries a timed-out JSON body and reports timeout after the retry budget', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { attempts++; return bodyThatAborts(init, '{'); });
    const result = callSecondaryApi(config, messages, null).catch(error => error);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(await result).toMatchObject({ kind: 'timeout' });
    expect(attempts).toBe(3);
  });

  it('records a stalled HTTP error body as failed rather than cancelled', async () => {
    vi.useFakeTimers();
    const events: ApiRequestEvent[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => new Response(bodyThatAborts(init).body, { status: 503 }));
    const result = callSecondaryApi({ ...config, telemetry: { onRequest: event => events.push(event) } }, messages, null).catch(error => error);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(await result).toMatchObject({ kind: 'timeout' });
    expect(events.map(event => event.outcome)).toEqual(['failed', 'failed', 'failed']);
  });

  it('keeps deliberate player cancellation non-retryable', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => { attempts++; return bodyThatAborts(init); });
    const result = streamChatCompletion(config, messages, null, {
      onToken: () => {}, onComplete: () => {}, onError: () => {},
    }, controller.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await result).toMatchObject({ kind: 'abort' });
    expect(attempts).toBe(1);
  });
});
