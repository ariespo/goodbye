import type { ParsedContent } from './types';

export interface ParseState {
  buffer: string;
  parsed: ParsedContent;
  currentTag: string | null;
  tagBuffer: string;
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
    },
    currentTag: null,
    tagBuffer: '',
  };
}

export function parseChunk(state: ParseState, chunk: string): ParseState {
  state.buffer += chunk;

  const tagPattern = /<(\/?)([a-zA-Z]+)>/g;
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
      state.buffer = state.buffer.slice(tagIndex + match[0].length);
      tagPattern.lastIndex = 0;
    } else {
      if (state.currentTag === tagName) {
        state.tagBuffer += state.buffer.slice(0, tagIndex);
        flushTagBuffer(state, tagName);
        state.currentTag = null;
        state.tagBuffer = '';
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

function flushTagBuffer(state: ParseState, tagName: string): void {
  const content = state.tagBuffer.trim();

  switch (tagName) {
    case 'thinking':
      state.parsed.thinking = content;
      break;
    case 'maintext':
      state.parsed.maintext = content;
      break;
    case 'option':
      state.parsed.options = content.split('\n').map(s => s.trim()).filter(Boolean);
      break;
    case 'sum':
      state.parsed.summary = content;
      break;
    case 'vars':
      try {
        state.parsed.vars = JSON.parse(content);
      } catch {
        // Ignore invalid JSON
      }
      break;
  }
}

export function isComplete(state: ParseState, requiredTags: string[] = ['maintext']): boolean {
  return requiredTags.every(tag => {
    switch (tag) {
      case 'maintext': return state.parsed.maintext.length > 0;
      case 'option': return state.parsed.options.length > 0;
      case 'vars': return Object.keys(state.parsed.vars).length > 0;
      case 'sum': return state.parsed.summary.length > 0;
      default: return true;
    }
  });
}
