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

export async function streamChatCompletion(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const body: Record<string, any> = {
    model: preset?.settings.openai_model || config.model,
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

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

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

export async function callSecondaryApi(
  config: ApiConfig,
  messages: ChatCompletionMessage[],
  preset: ChatPreset | null
): Promise<string> {
  const body: Record<string, any> = {
    model: preset?.settings.openai_model || config.model,
    messages,
  };

  if (preset) {
    if (preset.settings.temp_openai !== undefined) body.temperature = preset.settings.temp_openai;
    if (preset.settings.openai_max_tokens !== undefined) body.max_tokens = preset.settings.openai_max_tokens;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
