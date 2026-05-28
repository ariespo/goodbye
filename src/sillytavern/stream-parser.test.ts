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

  it('parses observe tag', () => {
    let state = createParseState();
    state = parseChunk(state, '<observe>\n房间里弥漫着煎蛋的香气。\n</observe>');
    expect(state.parsed.observe).toBe('房间里弥漫着煎蛋的香气。');
  });

  it('parses investigate tag with pipe-delimited items', () => {
    let state = createParseState();
    state = parseChunk(state, '<investigate>\n检查药瓶|玩家|心理|2分钟|1|8\n</investigate>');
    expect(state.parsed.investigateItems).toHaveLength(1);
    expect(state.parsed.investigateItems![0]).toEqual({
      desc: '检查药瓶', suspect: '玩家', style: '心理', time: '2分钟', stamina: 1, sanity: 8,
    });
  });

  it('parses action tag with pipe-delimited items', () => {
    let state = createParseState();
    state = parseChunk(state, '<action>\n去厨房|现实|5分钟|2|0\n</action>');
    expect(state.parsed.actionItems).toHaveLength(1);
    expect(state.parsed.actionItems![0]).toEqual({
      desc: '去厨房', style: '现实', time: '5分钟', stamina: 2, sanity: 0,
    });
  });

  it('parses action tag with type attribute (secondary request)', () => {
    let state = createParseState();
    state = parseChunk(state, '<action type="investigate">\n你发现了一些线索...\n</action>');
    expect(state.parsed.actionType).toBe('investigate');
    expect(state.parsed.actionResult).toBe('你发现了一些线索...');
  });

  it('parses action tag with type="act"', () => {
    let state = createParseState();
    state = parseChunk(state, '<action type="act">\n你走向厨房...\n[变化] 场景切换 → kitchen\n</action>');
    expect(state.parsed.actionType).toBe('act');
    expect(state.parsed.actionResult).toContain('场景切换');
  });

  it('handles think tag as alias for thinking', () => {
    let state = createParseState();
    state = parseChunk(state, '<think>\n让我思考一下...\n</think>');
    expect(state.parsed.thinking).toBe('让我思考一下...');
  });

  it('parses full response with multiple tags', () => {
    let state = createParseState();
    const response = '<maintext>\n对话|文穂|calm|你好。\n</maintext>\n<observe>\n房间很温暖。\n</observe>\n<option>\n选项A\n选项B\n</option>\n<sum>回合总结</sum>';
    state = parseChunk(state, response);
    expect(state.parsed.maintext).toContain('对话|文穂|calm|你好。');
    expect(state.parsed.observe).toBe('房间很温暖。');
    expect(state.parsed.options).toEqual(['选项A', '选项B']);
    expect(state.parsed.summary).toBe('回合总结');
  });
});
