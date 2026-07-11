import type { ParsedContent } from './types';

export interface ParseOptions {
  /** 严格模式:非法 JSON / 未闭合标签会抛出错误 */
  strict?: boolean;
}

export interface ParseState {
  buffer: string;
  parsed: ParsedContent;
  currentTag: string | null;
  tagBuffer: string;
  /** 当前打开标签的属性(如 { type: 'investigate' }) */
  tagAttributes: Record<string, string>;
  /** 严格模式下记录的解析错误 */
  errors: string[];
}

export function createParseState(): ParseState {
  return {
    buffer: '',
    parsed: {
      thinking: '',
      maintext: '',
      options: [],
      summary: '',
      vars: {},
      observe: '',
      investigateItems: [],
      actionItems: [],
    },
    currentTag: null,
    tagBuffer: '',
    tagAttributes: {},
    errors: [],
  };
}

export function parseChunk(state: ParseState, chunk: string, options: ParseOptions = {}): ParseState {
  state.buffer += chunk;

  const tagPattern = /<(\/?)([a-zA-Z]+)[^>]*>/g;
  let match;

  while ((match = tagPattern.exec(state.buffer)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const tagIndex = match.index;

    if (!isClosing) {
      if (state.currentTag) {
        state.tagBuffer += state.buffer.slice(0, tagIndex);
      }
      state.currentTag = tagName;
      state.tagBuffer = '';
      // 提取标签属性
      state.tagAttributes = extractAttributes(match[0]);
      state.buffer = state.buffer.slice(tagIndex + match[0].length);
      tagPattern.lastIndex = 0;
    } else {
      if (state.currentTag === tagName) {
        state.tagBuffer += state.buffer.slice(0, tagIndex);
        try {
          flushTagBuffer(state, tagName, options);
        } catch (err) {
          if (options.strict) {
            state.errors.push(err instanceof Error ? err.message : String(err));
          }
        }
        state.currentTag = null;
        state.tagBuffer = '';
        state.tagAttributes = {};
        state.buffer = state.buffer.slice(tagIndex + match[0].length);
        tagPattern.lastIndex = 0;
      }
    }
  }

  if (state.currentTag) {
    const lastOpenIndex = state.buffer.lastIndexOf(`<${state.currentTag}>`);
    if (lastOpenIndex === -1) {
      state.tagBuffer += state.buffer;
      state.buffer = '';
    }
  }

  return state;
}

function extractAttributes(tagString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrPattern.exec(tagString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function flushTagBuffer(state: ParseState, tagName: string, options: ParseOptions = {}): void {
  const rawContent = state.tagBuffer;
  const content = rawContent.trim();

  switch (tagName) {
    case 'thinking':
    case 'think':
      state.parsed.thinking = content;
      break;
    case 'maintext':
      state.parsed.maintext = content;
      break;
    case 'observe':
      state.parsed.observe = content;
      break;
    case 'investigate':
      state.parsed.investigateItems = content.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const [desc, suspect, style, time, stamina, sanity] = line.split(/[|｜]/).map(s => s.trim());
          return {
            desc: desc || '',
            suspect: suspect || '无',
            style: style || '现实',
            time: time || '0分钟',
            stamina: parseInt(stamina, 10) || 0,
            sanity: parseInt(sanity, 10) || 0,
          };
        });
      break;
    case 'action': {
      // 检查是否有 type 属性（二次请求结果）
      const actionType = state.tagAttributes['type'];
      if (actionType === 'investigate' || actionType === 'act') {
        state.parsed.actionType = actionType;
        state.parsed.actionResult = content;
      } else {
        // 主剧情的行动列表
        state.parsed.actionItems = content.split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const [desc, style, time, stamina, sanity] = line.split(/[|｜]/).map(s => s.trim());
            return {
              desc: desc || '',
              style: style || '现实',
              time: time || '0分钟',
              stamina: parseInt(stamina, 10) || 0,
              sanity: parseInt(sanity, 10) || 0,
            };
          });
      }
      break;
    }
    case 'option':
      state.parsed.options = content.split('\n').map(s => s.trim()).filter(Boolean);
      break;
    case 'sum':
      state.parsed.summary = content;
      break;
    case 'vars': {
      if (!content) {
        state.parsed.vars = {};
        break;
      }
      try {
        const parsed = JSON.parse(content);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          state.parsed.vars = parsed;
        } else if (options.strict) {
          throw new Error(`<vars> 必须是 JSON 对象,收到: ${typeof parsed}`);
        } else {
          state.parsed.vars = {};
        }
      } catch (err) {
        if (options.strict) {
          throw new Error(`<vars> 解析失败: ${err instanceof Error ? err.message : String(err)}`);
        }
        state.parsed.vars = {};
      }
      break;
    }
  }
}

export function isComplete(state: ParseState, requiredTags: string[] = ['maintext']): boolean {
  return requiredTags.every(tag => {
    switch (tag) {
      case 'maintext': return state.parsed.maintext.length > 0;
      case 'option': return state.parsed.options.length > 0;
      case 'vars': return Object.keys(state.parsed.vars).length > 0;
      case 'sum': return state.parsed.summary.length > 0;
      case 'observe': return !!state.parsed.observe && state.parsed.observe.length > 0;
      case 'investigate': return !!state.parsed.investigateItems && state.parsed.investigateItems.length > 0;
      case 'action': return !!state.parsed.actionItems && state.parsed.actionItems.length > 0;
      default: return true;
    }
  });
}

/** 检查是否存在未闭合标签(简化版) */
export function hasUnclosedTags(text: string): boolean {
  const tagPattern = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  const stack: string[] = [];
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    if (isClosing) {
      const last = stack.pop();
      if (last !== tagName) return true;
    } else {
      stack.push(tagName);
    }
  }
  return stack.length > 0;
}
