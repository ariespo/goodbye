import type { ChatPreset } from './types';

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onComplete: () => void;
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
        const data = await response.json();
        const models = (data.data || []).map((m: any) => ({ id: m.id, object: m.object }));
        return models;
      }
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
  let lastStatus = 0;
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
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`API error ${lastStatus}: ${lastError}`);
}

export async function streamChatCompletion(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const body: Record<string, any> = {
    model: config.model || preset?.settings.openai_model,
    messages,
    stream: true,
  };

  if (preset) {
    if (preset.settings.temp_openai !== undefined) body.temperature = preset.settings.temp_openai;
    if (preset.settings.openai_max_tokens !== undefined) body.max_tokens = preset.settings.openai_max_tokens;
    if (preset.settings.top_p_openai !== undefined) body.top_p = preset.settings.top_p_openai;
    if (preset.settings.freq_pen_openai !== undefined) body.frequency_penalty = preset.settings.freq_pen_openai;
    if (preset.settings.pres_pen_openai !== undefined) body.presence_penalty = preset.settings.pres_pen_openai;
  }

  const response = await fetchWithAuthFallback(
    `${config.baseUrl}/chat/completions`,
    config.apiKey,
    { method: 'POST', body: JSON.stringify(body), signal: abortSignal }
  );

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.trim() === 'data: [DONE]') {
          callbacks.onComplete();
          return;
        }
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const token = data.choices?.[0]?.delta?.content || '';
            if (token) callbacks.onToken(token);
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onComplete();
}

export interface SecondaryApiOptions {
  temperature?: number;
  maxTokens?: number;
}

export async function callSecondaryApi(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null,
  options?: SecondaryApiOptions
): Promise<string> {
  const body: Record<string, any> = {
    model: config.model || preset?.settings.openai_model,
    messages,
  };

  if (preset) {
    if (preset.settings.temp_openai !== undefined) body.temperature = preset.settings.temp_openai;
    if (preset.settings.openai_max_tokens !== undefined) body.max_tokens = preset.settings.openai_max_tokens;
  }

  // 次 API 可覆盖预设参数
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.maxTokens !== undefined) body.max_tokens = options.maxTokens;

  const response = await fetchWithAuthFallback(
    `${config.baseUrl}/chat/completions`,
    config.apiKey,
    { method: 'POST', body: JSON.stringify(body) }
  );

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
