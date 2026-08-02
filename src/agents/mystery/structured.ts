import type { ChatCompletionMessage, ResponseFormat, SecondaryApiOptions } from '../../sillytavern/api-router';

export type AgentCompletion = (
  messages: ChatCompletionMessage[],
  options?: SecondaryApiOptions,
) => Promise<string>;

/** 记录各服务端是否支持 response_format，避免每次调用都撞一次 400 */
const responseFormatSupportCache = new Map<string, boolean>();

export function resetResponseFormatSupportCache(): void {
  responseFormatSupportCache.clear();
}

export function getResponseFormatSupport(key: string): boolean | undefined {
  return responseFormatSupportCache.get(key);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isResponseFormatUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error) || isAbortError(error)) return false;
  const message = error.message;
  if (/response_format|json_schema|json_object/i.test(message)) return true;
  return /API error (400|404|422)/.test(message);
}

/** 优先带 response_format 调用；服务端不支持时降级为纯文本并缓存该结论。 */
export async function completeStructured(
  complete: AgentCompletion,
  apiKey: string,
  messages: ChatCompletionMessage[],
  options: SecondaryApiOptions,
  responseFormat: ResponseFormat,
): Promise<string> {
  if (responseFormatSupportCache.get(apiKey) !== false) {
    try {
      return await complete(messages, { ...options, responseFormat });
    } catch (error) {
      if (!isResponseFormatUnsupportedError(error)) throw error;
      responseFormatSupportCache.set(apiKey, false);
    }
  }
  return complete(messages, options);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Agent 没有返回 JSON 对象。');
  return JSON.parse(trimmed.slice(start, end + 1));
}
