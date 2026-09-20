import { describe, expect, it } from 'vitest';
import { buildWriterSystemPrompt, buildDirectorUserPrompt } from './prompts';
import { DEFAULT_FORMAT_PROMPT } from '../../sillytavern/types';
import { buildMysteryBrief } from './brief';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';

describe('agent prompt efficiency', () => {
  it('requires reusable summaries and preserves that priority over old custom format instructions', () => {
    const prompt = buildWriterSystemPrompt('<sum>本回合一句话总结</sum>');
    expect(prompt).toContain('2～4句');
    expect(prompt).toContain('未完成');
    expect(prompt.lastIndexOf('2～4句')).toBeGreaterThan(prompt.indexOf('[项目输出格式补充]'));
  });
  it('keeps the playable grammar without legacy Writer state instructions', () => {
    const system = buildWriterSystemPrompt(DEFAULT_FORMAT_PROMPT);
    expect(system).toContain('对话|旁白|calm|');
    expect(system).toContain('至少 2 项');
    expect(system).toContain('<vars>{}</vars>');
    expect(system).not.toContain('只包含发生变化的字段');
    expect(buildWriterSystemPrompt()).toBe(system);
    expect(buildWriterSystemPrompt('自定义格式要求')).toContain('自定义格式要求');
  });
  it('compacts JSON whitespace without losing any context or authority data', () => {
    const brief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, { cycleCount: 1, currentLocation: 'home',
      lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: [] });
    const context = { playerInput: '坐下\n思考', nested: { facts: ['事实一', '事实二'] } };
    const prompt = buildDirectorUserPrompt(brief, context);
    const serialized = prompt.split('[TurnContext]\n')[1].split('\n\n[MysteryBrief]\n');
    expect(JSON.parse(serialized[0])).toEqual(context);
    expect(JSON.parse(serialized[1])).toEqual(brief);
    expect(serialized[1].length).toBeLessThan(JSON.stringify(brief, null, 2).length * 0.85);
  });
});
