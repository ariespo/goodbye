import type { ChatPreset, DynamicRecord } from './types';

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'http4xx'
  | 'http5xx'
  | 'rate_limit'
  | 'abort'
  | 'stream_interrupted';

const RETRYABLE_KINDS: ReadonlySet<ApiErrorKind> = new Set(['network', 'timeout', 'http5xx', 'rate_limit']);

export class ApiCallError extends Error {
  readonly status: number | null;
  readonly kind: ApiErrorKind;
  readonly retryable: boolean;

  constructor(message: string, kind: ApiErrorKind, status: number | null = null) {
    super(message);
    this.name = 'ApiCallError';
    this.kind = kind;
    this.status = status;
    this.retryable = RETRYABLE_KINDS.has(kind);
  }
}

export function classifyHttpStatus(status: number): ApiErrorKind {
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'http5xx';
  return 'http4xx';
}

export function toApiCallError(cause: unknown): ApiCallError {
  if (cause instanceof ApiCallError) return cause;
  if (cause instanceof Error && cause.name === 'AbortError') {
    return new ApiCallError('请求已中止', 'abort');
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return new ApiCallError(`网络错误: ${message}`, 'network');
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: ApiCallError) => void;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiCallError('请求已中止', 'abort'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiCallError('请求已中止', 'abort'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (cause) {
      const error = toApiCallError(cause);
      if (!error.retryable || attempt >= retries) throw error;
      options.onRetry?.(attempt + 1, error);
      await abortableDelay(baseDelayMs * 2 ** attempt, options.signal);
    }
  }
}

export interface TimeoutSignal {
  signal: AbortSignal;
  refresh: (ms?: number) => void;
  dispose: () => void;
}

/** 可刷新的超时 signal，与父 signal 合成；超时以 ApiCallError('timeout') 作为 abort reason */
export function createTimeoutSignal(parent: AbortSignal | undefined, ms: number): TimeoutSignal {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onParentAbort = () => {
    if (timer !== null) clearTimeout(timer);
    controller.abort(new ApiCallError('请求已中止', 'abort'));
  };
  if (parent?.aborted) {
    onParentAbort();
  } else {
    parent?.addEventListener('abort', onParentAbort, { once: true });
  }

  const refresh = (nextMs: number = ms) => {
    if (timer !== null) clearTimeout(timer);
    if (controller.signal.aborted) return;
    timer = setTimeout(() => {
      controller.abort(new ApiCallError(`请求超时（${Math.round(nextMs / 1000)}s 无响应）`, 'timeout'));
    }, nextMs);
  };
  refresh();

  return {
    signal: controller.signal,
    refresh,
    dispose: () => {
      if (timer !== null) clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function isDeepSeekV4(config: ApiConfig): boolean {
  return /api\.deepseek\.com/i.test(config.baseUrl)
    && /^deepseek-v4-(?:flash|pro)$/i.test(config.model);
}

function applyProviderCompatibility(body: DynamicRecord, config: ApiConfig): void {
  // DeepSeek V4 defaults to thinking mode. These calls require strict
  // machine-readable output, so hidden reasoning must not consume the output
  // budget before the final answer begins.
  if (isDeepSeekV4(config)) body.thinking = { type: 'disabled' };
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void | Promise<void>;
  onError: (error: Error) => void;
}

export interface FetchedModel {
  id: string;
  object?: string;
}

/** 获取模型列表；支持 Bearer 和 api-key 两种 header 方式 */
export async function fetchModels(config: ApiConfig): Promise<FetchedModel[]> {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('请先填写 Base URL 和 API Key');
  }

  const headersList = [
    { 'Authorization': `Bearer ${config.apiKey}` },
    { 'api-key': config.apiKey },
  ];

  for (const headers of headersList) {
    try {
      const response = await fetch(`${config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data: unknown = await response.json();
        const rawModels = typeof data === 'object' && data !== null && 'data' in data
          ? (data as { data?: unknown }).data
          : undefined;
        const models = (Array.isArray(rawModels) ? rawModels : [])
          .filter((model): model is { id: string; object?: string } => (
            typeof model === 'object'
            && model !== null
            && 'id' in model
            && typeof model.id === 'string'
            && (!('object' in model) || model.object === undefined || typeof model.object === 'string')
          ))
          .map(model => ({ id: model.id, object: model.object }));
        return models;
      }
      if (response.status !== 401 && response.status !== 403) break;
    } catch {
      // 尝试下一种 header 方式
    }
  }

  throw new Error('无法获取模型列表，请检查 Base URL 和 API Key');
}

/** 测试 API 连通性：发送一条极简消息 */
export async function testConnectivity(config: ApiConfig): Promise<{ ok: boolean; latency: number; model?: string }> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error('请先填写 Base URL、API Key 和模型');
  }

  const start = performance.now();
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 5,
  };

  const headersList = [
    { 'Authorization': `Bearer ${config.apiKey}` },
    { 'api-key': config.apiKey },
  ];

  for (const headers of headersList) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ok: true,
          latency: Math.round(performance.now() - start),
          model: data.model || config.model,
        };
      }
      if (response.status !== 401 && response.status !== 403) break;
    } catch {
      // 尝试下一种 header 方式
    }
  }

  throw new Error('连通性测试失败，请检查配置');
}

function buildHeaders(apiKey: string): Record<string, string>[] {
  return [
    { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    { 'api-key': apiKey, 'Content-Type': 'application/json' },
  ];
}

async function fetchWithAuthFallback(
  url: string,
  apiKey: string,
  init: RequestInit
): Promise<Response> {
  if (!apiKey) {
    throw new Error('API Key 未设置，请先在设置中填写');
  }

  const headersList = buildHeaders(apiKey);
  let lastStatus: number | null = null;
  let lastError = '';

  for (const headers of headersList) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers as Record<string, string> || {}),
        },
      });
      if (response.ok) return response;
      lastStatus = response.status;
      lastError = await response.text();
      // 仅认证失败才换 api-key header 重试；400 等业务错误换 header 只会
      // 产生误导性的 401（如 DeepSeek 对未知 header 返回 Authentication Fails），掩盖真实错误
      if (response.status !== 401 && response.status !== 403) break;
    } catch (e) {
      const classified = toApiCallError(e);
      // 中止/超时不应再换 header 重试
      if (classified.kind === 'abort' || classified.kind === 'timeout') throw classified;
      lastError = classified.message;
    }
  }

  if (lastStatus !== null) {
    throw new ApiCallError(`API error ${lastStatus}: ${lastError}`, classifyHttpStatus(lastStatus), lastStatus);
  }
  throw new ApiCallError(lastError || '网络错误', 'network');
}

export interface StreamRetryOptions {
  onRetry?: (attempt: number, error: ApiCallError) => void;
  /** 首字节超时，默认 30s */
  firstByteTimeoutMs?: number;
  /** 流式空闲超时，默认 60s */
  idleTimeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
}

export async function streamChatCompletion(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  retryOptions?: StreamRetryOptions
): Promise<void> {
  const body: DynamicRecord = {
    model: config.model || preset?.settings.openai_model,
    messages,
    stream: true,
  };
  applyProviderCompatibility(body, config);

  if (preset) {
    if (preset.settings.temp_openai !== undefined) body.temperature = preset.settings.temp_openai;
    if (preset.settings.openai_max_tokens !== undefined) body.max_tokens = preset.settings.openai_max_tokens;
    if (preset.settings.top_p_openai !== undefined) body.top_p = preset.settings.top_p_openai;
    if (preset.settings.freq_pen_openai !== undefined) body.frequency_penalty = preset.settings.freq_pen_openai;
    if (preset.settings.pres_pen_openai !== undefined) body.presence_penalty = preset.settings.pres_pen_openai;
  }

  const firstByteTimeoutMs = retryOptions?.firstByteTimeoutMs ?? 30_000;
  const idleTimeoutMs = retryOptions?.idleTimeoutMs ?? 60_000;
  const retries = retryOptions?.retries ?? 2;
  const baseDelayMs = retryOptions?.baseDelayMs ?? 1000;

  const runStreamOnce = async (onFirstToken: () => void): Promise<void> => {
    const timeout = createTimeoutSignal(abortSignal, firstByteTimeoutMs);
    try {
      const response = await fetchWithAuthFallback(
        `${config.baseUrl}/chat/completions`,
        config.apiKey,
        { method: 'POST', body: JSON.stringify(body), signal: timeout.signal }
      );

      const reader = response.body?.getReader();
      if (!reader) {
        throw new ApiCallError('响应无内容流', 'network');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let contentEmitted = false;

      try {
        while (true) {
          timeout.refresh(idleTimeoutMs);
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;
            if (line.trim() === 'data: [DONE]') {
              if (!contentEmitted) {
                throw new ApiCallError('模型未返回最终正文（仅返回了推理内容）', 'http4xx');
              }
              await callbacks.onComplete();
              return;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices?.[0]?.delta;
                const token = typeof delta?.content === 'string' ? delta.content : '';
                if (token) {
                  contentEmitted = true;
                  onFirstToken();
                  callbacks.onToken(token);
                }
                // reasoning_content is private analysis, never playable prose.
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (!contentEmitted) {
        throw new ApiCallError('模型未返回最终正文（仅返回了推理内容）', 'http4xx');
      }
      await callbacks.onComplete();
    } finally {
      timeout.dispose();
    }
  };

  // 首字节前的失败对玩家无感，可自动重试；已输出内容后中断则交由调用方做回合级恢复
  for (let attempt = 0; ; attempt++) {
    let tokenEmitted = false;
    try {
      await runStreamOnce(() => { tokenEmitted = true; });
      return;
    } catch (cause) {
      const error = toApiCallError(cause);
      if (tokenEmitted) {
        if (error.kind === 'abort') throw error;
        throw new ApiCallError(`剧情生成中断: ${error.message}`, 'stream_interrupted', error.status);
      }
      if (!error.retryable || attempt >= retries) throw error;
      retryOptions?.onRetry?.(attempt + 1, error);
      await abortableDelay(baseDelayMs * 2 ** attempt, abortSignal);
    }
  }
}

export type ResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

export interface SecondaryApiOptions {
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  responseFormat?: ResponseFormat;
}

export async function callSecondaryApi(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null,
  options?: SecondaryApiOptions
): Promise<string> {
  const body: DynamicRecord = {
    model: config.model || preset?.settings.openai_model,
    messages,
  };
  applyProviderCompatibility(body, config);

  if (preset) {
    if (preset.settings.temp_openai !== undefined) body.temperature = preset.settings.temp_openai;
    if (preset.settings.openai_max_tokens !== undefined) body.max_tokens = preset.settings.openai_max_tokens;
  }

  // 次 API 可覆盖预设参数
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options?.responseFormat !== undefined) body.response_format = options.responseFormat;

  return withRetry(async () => {
    const timeout = createTimeoutSignal(options?.abortSignal, 30_000);
    try {
      const response = await fetchWithAuthFallback(
        `${config.baseUrl}/chat/completions`,
        config.apiKey,
        { method: 'POST', body: JSON.stringify(body), signal: timeout.signal }
      );
      const data = await response.json();
      const message = data.choices?.[0]?.message;
      const content = typeof message?.content === 'string' ? message.content : '';
      if (content.trim()) return content;
      throw new ApiCallError('模型未返回最终正文（仅返回了推理内容）', 'http4xx');
    } finally {
      timeout.dispose();
    }
  }, { signal: options?.abortSignal });
}
