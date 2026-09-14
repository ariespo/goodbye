import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeStructured, resetResponseFormatSupportCache } from '../agents/mystery/structured';
import {
  ApiCallError,
  callSecondaryApi,
  classifyHttpStatus,
  createTimeoutSignal,
  streamChatCompletion,
  toApiCallError,
  withRetry,
  type ApiConfig,
} from './api-router';

const config: ApiConfig = { baseUrl: 'https://api.test/v1', apiKey: 'sk-test', model: 'test-model' };

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

function reasoningJsonResponse(reasoningContent: string, content = ''): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content, reasoning_content: reasoningContent } }],
  }), { status: 200 });
}

function errorResponse(status: number): Response {
  return new Response('server error', { status });
}

function sseResponse(chunks: string[], options?: { errorAfter?: boolean }): Response {
  return sseDeltaResponse(chunks.map(content => ({ content })), options);
}

function sseDeltaResponse(
  deltas: Array<{ content?: string; reasoning_content?: string }>,
  options?: { errorAfter?: boolean }
): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < deltas.length) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: deltas[index++] }] })}\n`));
        return;
      }
      if (options?.errorAfter) {
        controller.error(new TypeError('connection reset'));
      } else {
        controller.enqueue(encoder.encode('data: [DONE]\n'));
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('default per-call output budget', () => {
  it('sends a 40k output limit for non-stream calls without a preset', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      return jsonResponse('answer');
    });
    await callSecondaryApi(config, [{ role: 'user', content: 'continue' }], null);
    expect(requestBody.max_tokens).toBe(40000);
  });

  it('sends a 40k output limit for streaming calls without a preset', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body));
      return sseResponse(['answer']);
    });
    await streamChatCompletion(config, [{ role: 'user', content: 'continue' }], null, {
      onToken: () => {}, onComplete: () => {}, onError: () => {},
    });
    expect(requestBody.max_tokens).toBe(40000);
  });
});

describe('reasoning_content compatibility', () => {
  it('rejects a non-stream response that contains only private reasoning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reasoningJsonResponse('fallback')));
    await expect(callSecondaryApi(config, [{ role: 'user', content: 'hi' }], null))
      .rejects.toThrow('模型未返回最终正文');
  });

  it('prefers content when both response fields are present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reasoningJsonResponse('reasoning', 'answer')));
    const result = await callSecondaryApi(config, [{ role: 'user', content: 'hi' }], null);
    expect(result).toBe('answer');
  });

  it('rejects a stream that contains only private reasoning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseDeltaResponse([
      { reasoning_content: 'fallback ' },
      { reasoning_content: 'answer' },
    ])));
    const tokens: string[] = [];
    await expect(streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: token => tokens.push(token),
      onComplete: vi.fn(),
      onError: vi.fn(),
    })).rejects.toThrow('模型未返回最终正文');
    expect(tokens).toEqual([]);
  });

  it('disables thinking mode for DeepSeek V4 machine-readable calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse('answer'));
    vi.stubGlobal('fetch', fetchMock);
    await callSecondaryApi(
      { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', model: 'deepseek-v4-flash' },
      [{ role: 'user', content: 'hi' }],
      null,
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ thinking: { type: 'disabled' } });
  });

  it('discards buffered reasoning_content when stream content is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseDeltaResponse([
      { reasoning_content: 'hidden reasoning' },
      { content: 'visible answer' },
    ])));
    const tokens: string[] = [];
    await streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: token => tokens.push(token),
      onComplete: vi.fn(),
      onError: vi.fn(),
    });
    expect(tokens).toEqual(['visible answer']);
  });

  it('waits for asynchronous completion validation before resolving', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseDeltaResponse([{ content: 'answer' }])));
    let releaseCompletion!: () => void;
    const completionGate = new Promise<void>(resolve => { releaseCompletion = resolve; });
    let resolved = false;
    const streamPromise = streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: vi.fn(),
      onComplete: async () => {
        await completionGate;
      },
      onError: vi.fn(),
    });
    void streamPromise.then(() => { resolved = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(resolved).toBe(false);
    releaseCompletion();
    await streamPromise;
    expect(resolved).toBe(true);
  });
});

describe('HTTP 200 gateway error envelopes', () => {
  it('retains explicit schema incompatibility so structured calls can fall back to JSON Object', async () => {
    resetResponseFormatSupportCache();
    const schemaError = '### **Proxy error (HTTP 400 Bad Request)**\nRequest validation failed. At generationConfig > responseSchema: additionalProperties is not supported by Gemini structured output.\n<!-- oai-proxy-error -->';
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(schemaError))
      .mockResolvedValueOnce(jsonResponse('{"approved":true}'));
    vi.stubGlobal('fetch', fetchMock);
    const response = await completeStructured((messages, options) => callSecondaryApi(config, messages, null, options),
      'gateway-schema-regression', [{ role: 'user', content: 'Return JSON review' }], {},
      { type: 'json_schema', json_schema: { name: 'review', schema: { type: 'object' } } });
    expect(response).toBe('{"approved":true}');
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).response_format.type))
      .toEqual(['json_schema', 'json_object']);
  });

  const gatewayError = '### **Proxy error (HTTP 503 Service Unavailable)**\nUpstream unavailable.\n```json\n{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}\n```\n<!-- oai-proxy-error -->';

  it('retries a non-stream gateway envelope instead of returning it as model JSON', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(gatewayError))
      .mockResolvedValueOnce(jsonResponse('{"approved":true}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await callSecondaryApi(config, [{ role: 'user', content: 'review' }], null)).toBe('{"approved":true}');
  });

  it('preserves the wrapped status and retry classification after non-stream retries are exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => jsonResponse(gatewayError)));
    await expect(callSecondaryApi(config, [{ role: 'user', content: 'review' }], null))
      .rejects.toMatchObject({ status: 503, kind: 'http5xx', retryable: true });
  });

  it('retries fragmented streaming envelopes before exposing any token or reporting completion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([...gatewayError]))
      .mockResolvedValueOnce(sseResponse(['真实', '正文']));
    vi.stubGlobal('fetch', fetchMock);
    const tokens: string[] = [];
    const completions: string[] = [];
    const retries: Array<{ status: number | null; kind: string }> = [];
    await streamChatCompletion(config, [{ role: 'user', content: 'continue' }], null, {
      onToken: token => tokens.push(token), onComplete: () => { completions.push(tokens.join('')); }, onError: vi.fn(),
    }, undefined, { baseDelayMs: 1, onRetry: (_attempt, error) => { retries.push(error); } });
    expect(tokens.join('')).toBe('真实正文');
    expect(completions).toEqual(['真实正文']);
    expect(retries).toMatchObject([{ status: 503, kind: 'http5xx' }]);
  });

  it('never reports a complete scene for an exhausted streaming gateway failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => sseResponse([gatewayError])));
    const tokens: string[] = [];
    let completed = false;
    await expect(streamChatCompletion(config, [], null, {
      onToken: token => tokens.push(token), onComplete: () => { completed = true; }, onError: vi.fn(),
    }, undefined, { retries: 1, baseDelayMs: 1 })).rejects.toMatchObject({ status: 503, kind: 'http5xx' });
    expect(tokens).toEqual([]);
    expect(completed).toBe(false);
  });

  it('classifies a JSON gateway envelope returned to a streaming request instead of calling it empty prose', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: gatewayError } }] }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    let completed = false;
    const tokens: string[] = [];
    await expect(streamChatCompletion(config, [], null, {
      onToken: token => tokens.push(token), onComplete: () => { completed = true; }, onError: vi.fn(),
    }, undefined, { retries: 0 })).rejects.toMatchObject({ status: 503, kind: 'http5xx' });
    expect(tokens).toEqual([]);
    expect(completed).toBe(false);
  });

  it('keeps a wrapped 400 non-retryable rather than assuming every gateway envelope is a 503', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(gatewayError.replace('HTTP 503 Service Unavailable', 'HTTP 400 Bad Request')))
      .mockResolvedValueOnce(jsonResponse('must not retry')));
    await expect(callSecondaryApi(config, [], null))
      .rejects.toMatchObject({ status: 400, kind: 'http4xx', retryable: false });
  });

  it.each([
    '对话|旁白|calm|屏幕上写着 HTTP 503 Service Unavailable。',
    '### **Proxy error (HTTP 503 Service Unavailable)**\n这是角色抄在纸上的标题。',
    '故事里出现了 <!-- oai-proxy-error --> 这段注释。',
  ])('preserves ordinary text without a complete gateway envelope: %s', async text => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(text)).mockResolvedValueOnce(sseResponse([...text])));
    expect(await callSecondaryApi(config, [], null)).toBe(text);
    const tokens: string[] = [];
    await streamChatCompletion(config, [], null, { onToken: token => tokens.push(token), onComplete: vi.fn(), onError: vi.fn() });
    expect(tokens.join('')).toBe(text);
  });
});

describe('classifyHttpStatus / toApiCallError', () => {
  it('分类 HTTP 状态', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limit');
    expect(classifyHttpStatus(500)).toBe('http5xx');
    expect(classifyHttpStatus(400)).toBe('http4xx');
  });

  it('5xx/429/网络/超时可重试，4xx/abort 不可重试', () => {
    expect(new ApiCallError('x', 'http5xx').retryable).toBe(true);
    expect(new ApiCallError('x', 'rate_limit').retryable).toBe(true);
    expect(new ApiCallError('x', 'network').retryable).toBe(true);
    expect(new ApiCallError('x', 'timeout').retryable).toBe(true);
    expect(new ApiCallError('x', 'http4xx').retryable).toBe(false);
    expect(new ApiCallError('x', 'abort').retryable).toBe(false);
    expect(new ApiCallError('x', 'stream_interrupted').retryable).toBe(false);
  });

  it('AbortError 归类为 abort', () => {
    const abortError = new DOMException('aborted', 'AbortError');
    expect(toApiCallError(abortError).kind).toBe('abort');
  });
});

describe('withRetry', () => {
  it('可重试错误在指数退避后重试并最终成功', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ApiCallError('boom', 'http5xx', 500))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();
    const result = await withRetry(fn, { baseDelayMs: 1, onRetry });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'http5xx' }));
  });

  it('不可重试错误立即抛出', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiCallError('bad request', 'http4xx', 400));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ kind: 'http4xx' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('耗尽重试次数后抛出最后一个错误', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiCallError('boom', 'network'));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toMatchObject({ kind: 'network' });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('退避期间 abort 立即终止', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new ApiCallError('boom', 'network'));
    });
    await expect(withRetry(fn, { baseDelayMs: 10_000, signal: controller.signal }))
      .rejects.toMatchObject({ kind: 'abort' });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('createTimeoutSignal', () => {
  it('超时后以 timeout ApiCallError 中止', async () => {
    const timeout = createTimeoutSignal(undefined, 10);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(timeout.signal.aborted).toBe(true);
    expect((timeout.signal.reason as ApiCallError).kind).toBe('timeout');
    timeout.dispose();
  });

  it('refresh 推迟超时', async () => {
    const timeout = createTimeoutSignal(undefined, 25);
    await new Promise(resolve => setTimeout(resolve, 15));
    timeout.refresh();
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(timeout.signal.aborted).toBe(false);
    timeout.dispose();
  });

  it('父 signal 中止传递为 abort', () => {
    const parent = new AbortController();
    const timeout = createTimeoutSignal(parent.signal, 10_000);
    parent.abort();
    expect(timeout.signal.aborted).toBe(true);
    expect((timeout.signal.reason as ApiCallError).kind).toBe('abort');
    timeout.dispose();
  });
});

describe('callSecondaryApi 重试', () => {
  it('5xx 自动重试后成功', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(jsonResponse('hello'));
    vi.stubGlobal('fetch', fetchMock);

    // 私有重试参数不可注入，直接验证行为（默认 baseDelayMs=1000，首次退避 1s）
    const result = await callSecondaryApi(config, [{ role: 'user', content: 'hi' }], null);
    expect(result).toBe('hello');
    // 5xx 不换 header，每轮 1 次 fetch，重试两轮后成功
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('400 不重试', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errorResponse(400));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callSecondaryApi(config, [{ role: 'user', content: 'hi' }], null))
      .rejects.toMatchObject({ kind: 'http4xx', status: 400 });
    // 400 不换 header 重试（避免误导性 401 掩盖真实错误），也不做轮次重试
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('streamChatCompletion', () => {
  it('正常流式输出并完成', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['你好', '世界'])));
    const tokens: string[] = [];
    const onComplete = vi.fn();
    await streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: t => tokens.push(t),
      onComplete,
      onError: vi.fn(),
    });
    expect(tokens).toEqual(['你好', '世界']);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('首字节前网络失败自动重试', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(sseResponse(['ok']));
    vi.stubGlobal('fetch', fetchMock);
    const tokens: string[] = [];
    const onRetry = vi.fn();
    await streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: t => tokens.push(t),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, undefined, { baseDelayMs: 1, onRetry });
    expect(tokens).toEqual(['ok']);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('已输出内容后中断不重试，抛 stream_interrupted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['部分内容'], { errorAfter: true }));
    vi.stubGlobal('fetch', fetchMock);
    const tokens: string[] = [];
    await expect(streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: t => tokens.push(t),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, undefined, { baseDelayMs: 1 })).rejects.toMatchObject({ kind: 'stream_interrupted' });
    expect(tokens).toEqual(['部分内容']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('首字节超时触发重试后成功', async () => {
    const hangingFetch = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    const fetchMock = vi.fn()
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce(sseResponse(['救回来了']));
    vi.stubGlobal('fetch', fetchMock);
    const tokens: string[] = [];
    await streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: t => tokens.push(t),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, undefined, { baseDelayMs: 1, firstByteTimeoutMs: 30 });
    expect(tokens).toEqual(['救回来了']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('调用方 abort 不重试', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        controller.abort();
      }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(streamChatCompletion(config, [{ role: 'user', content: 'hi' }], null, {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    }, controller.signal, { baseDelayMs: 1 })).rejects.toMatchObject({ kind: 'abort' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
