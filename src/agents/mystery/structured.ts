import type { ChatCompletionMessage, ResponseFormat, SecondaryApiOptions } from '../../sillytavern/api-router';

export type AgentCompletion = (
  messages: ChatCompletionMessage[],
  options?: SecondaryApiOptions,
) => Promise<string>;

export type StructuredOutputMode = 'json_schema' | 'json_object' | 'text';

/** 记录各服务端可用的最高结构化输出能力，避免每次调用都重复撞 400。 */
const responseFormatSupportCache = new Map<string, StructuredOutputMode>();
/** JSON Schema 方言兼容性取决于完整 schema，不能由同端点的另一个 schema 覆盖。 */
const jsonSchemaSupportCache = new Map<string, boolean>();
const jsonObjectSupportCache = new Map<string, boolean>();

export function resetResponseFormatSupportCache(): void {
  responseFormatSupportCache.clear();
  jsonSchemaSupportCache.clear();
  jsonObjectSupportCache.clear();
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
  return isResponseFormatUnsupportedText(error.message);
}

function isResponseFormatUnsupportedText(text: string): boolean {
  if (!/(response[_ ]?format|response[_ ]?schema|json_schema|json_object|generation_config\.response_schema)/i.test(text)) {
    return false;
  }
  return /(unavailable|unsupported|not supported|invalid_request_error|unknown (?:name|field)|additionalProperties|\bconst\b|(?:HTTP|API error)\s*(400|404|422))/i.test(text);
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)]));
  }
  return value;
}

function schemaSupportKey(supportKey: string, responseFormat: Extract<ResponseFormat, { type: 'json_schema' }>): string {
  return `${supportKey}|${JSON.stringify(canonicalJson(responseFormat.json_schema))}`;
}

function prefersJsonObject(supportKey: string): boolean {
  const separator = supportKey.lastIndexOf('|');
  try {
    const endpoint = new URL(supportKey.slice(0, separator));
    return endpoint.origin === 'https://api.deepseek.com'
      && /^\/(?:v1\/?)?$/.test(endpoint.pathname)
      && supportKey.slice(separator + 1) === 'deepseek-v4-flash';
  } catch {
    return false;
  }
}

/** 优先使用 JSON Schema；不支持时依次降级为 JSON Object 与纯文本。 */
export async function completeStructured(
  complete: AgentCompletion,
  supportKey: string,
  messages: ChatCompletionMessage[],
  options: SecondaryApiOptions,
  responseFormat: ResponseFormat,
): Promise<string> {
  // Measured on the official V4 Flash endpoint: json_schema returns HTTP 400
  // "This response_format type is unavailable now"; json_object succeeds.
  // Keep capability probing for proxies and other models.
  const schemaKey = responseFormat.type === 'json_schema'
    ? schemaSupportKey(supportKey, responseFormat) : undefined;
  if (responseFormat.type === 'json_schema' && prefersJsonObject(supportKey)) {
    responseFormatSupportCache.set(supportKey, 'json_object');
  } else if (schemaKey && jsonSchemaSupportCache.get(schemaKey) !== false) {
    try {
      const result = await complete(messages, { ...options, responseFormat });
      if (!isResponseFormatUnsupportedText(result)) {
        jsonSchemaSupportCache.set(schemaKey, true);
        responseFormatSupportCache.set(supportKey, 'json_schema');
        return result;
      }
      jsonSchemaSupportCache.set(schemaKey, false);
    } catch (error) {
      if (!isResponseFormatUnsupportedError(error)) throw error;
      jsonSchemaSupportCache.set(schemaKey, false);
    }
  }

  if (jsonObjectSupportCache.get(supportKey) !== false) {
    try {
      const result = await complete(messages, { ...options, responseFormat: { type: 'json_object' } });
      if (!isResponseFormatUnsupportedText(result)) {
        jsonObjectSupportCache.set(supportKey, true);
        if (responseFormatSupportCache.get(supportKey) !== 'json_schema') {
          responseFormatSupportCache.set(supportKey, 'json_object');
        }
        return result;
      }
      jsonObjectSupportCache.set(supportKey, false);
    } catch (error) {
      if (!isResponseFormatUnsupportedError(error)) throw error;
      jsonObjectSupportCache.set(supportKey, false);
    }
  }

  if (responseFormatSupportCache.get(supportKey) !== 'json_schema') {
    responseFormatSupportCache.set(supportKey, 'text');
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
