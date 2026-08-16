import type { ChatCompletionMessage, ResponseFormat, SecondaryApiOptions } from '../../sillytavern/api-router';

export type AgentCompletion = (
  messages: ChatCompletionMessage[],
  options?: SecondaryApiOptions,
) => Promise<string>;

export type StructuredOutputMode = 'json_schema' | 'json_object' | 'text';

/** 记录各服务端可用的最高结构化输出能力，避免每次调用都重复撞 400。 */
const responseFormatSupportCache = new Map<string, StructuredOutputMode>();

export function resetResponseFormatSupportCache(): void {
  responseFormatSupportCache.clear();
}

export function getResponseFormatSupport(key: string): boolean | undefined {
  const mode = responseFormatSupportCache.get(key);
  return mode === undefined ? undefined : mode !== 'text';
}

export function getStructuredOutputMode(key: string): StructuredOutputMode | undefined {
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

function isResponseFormatUnsupportedText(text: string): boolean {
  if (!/(response_format|json_schema|json_object)/i.test(text)) return false;
  return /(unavailable|unsupported|not supported|invalid_request_error|HTTP\s*(400|404|422))/i.test(text);
}

/** 优先使用 JSON Schema；不支持时依次降级为 JSON Object 与纯文本。 */
export async function completeStructured(
  complete: AgentCompletion,
  supportKey: string,
  messages: ChatCompletionMessage[],
  options: SecondaryApiOptions,
  responseFormat: ResponseFormat,
): Promise<string> {
  const cachedMode = responseFormatSupportCache.get(supportKey);
  if (cachedMode === undefined || cachedMode === 'json_schema') {
    try {
      const result = await complete(messages, { ...options, responseFormat });
      if (!isResponseFormatUnsupportedText(result)) {
        responseFormatSupportCache.set(supportKey, 'json_schema');
        return result;
      }
      responseFormatSupportCache.set(supportKey, 'json_object');
    } catch (error) {
      if (!isResponseFormatUnsupportedError(error)) throw error;
      responseFormatSupportCache.set(supportKey, 'json_object');
    }
  }

  if (responseFormatSupportCache.get(supportKey) === 'json_object') {
    try {
      const result = await complete(messages, { ...options, responseFormat: { type: 'json_object' } });
      if (!isResponseFormatUnsupportedText(result)) return result;
      responseFormatSupportCache.set(supportKey, 'text');
    } catch (error) {
      if (!isResponseFormatUnsupportedError(error)) throw error;
      responseFormatSupportCache.set(supportKey, 'text');
    }
  }

  return complete(messages, options);
}

/** 对结构化 Agent 的内容再提供一次“带原响应纠错”的解析机会。 */
export async function completeParsedStructured<T>(
  complete: AgentCompletion,
  supportKey: string,
  messages: ChatCompletionMessage[],
  options: SecondaryApiOptions,
  responseFormat: ResponseFormat,
  parse: (text: string) => T,
): Promise<T> {
  const first = await completeStructured(complete, supportKey, messages, options, responseFormat);
  try {
    return parse(first);
  } catch (error) {
    const retryMessages: ChatCompletionMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      {
        role: 'user',
        content: `上一响应不可解析：${error instanceof Error ? error.message : String(error)}。只重新输出一个完整、合法、无 Markdown 的 JSON 对象；不得省略、截断或添加解释。`,
      },
    ];
    const retry = await completeStructured(
      complete,
      supportKey,
      retryMessages,
      { ...options, temperature: 0 },
      responseFormat,
    );
    return parse(retry);
  }
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Agent 没有返回 JSON 对象。');
  return JSON.parse(trimmed.slice(start, end + 1));
}
