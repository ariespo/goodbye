import { describe, it, expect } from 'vitest';
import { createParseState, parseChunk, isComplete } from './stream-parser';

describe('stream-parser', () => {
  it('should parse complete tags', () => {
    let state = createParseState();
    state = parseChunk(state, '<maintext>这是一段剧情</maintext>');
    expect(state.parsed.maintext).toBe('这是一段剧情');
  });

  it('should parse across multiple chunks', () => {
    let state = createParseState();
    state = parseChunk(state, '<maintext>这是');
    expect(state.parsed.maintext).toBe('');
    state = parseChunk(state, '一段');
    state = parseChunk(state, '剧情</maintext>');
    expect(state.parsed.maintext).toBe('这是一段剧情');
  });

  it('should parse options', () => {
    let state = createParseState();
    state = parseChunk(state, '<option>选项A\n选项B\n选项C</option>');
    expect(state.parsed.options).toEqual(['选项A', '选项B', '选项C']);
  });

  it('should parse vars as JSON', () => {
    let state = createParseState();
    state = parseChunk(state, '<vars>{"stamina": 80, "sanity": 70}</vars>');
    expect(state.parsed.vars).toEqual({ stamina: 80, sanity: 70 });
  });

  it('should detect completion', () => {
    let state = createParseState();
    expect(isComplete(state)).toBe(false);
    state = parseChunk(state, '<maintext>剧情</maintext>');
    expect(isComplete(state)).toBe(true);
  });
});
