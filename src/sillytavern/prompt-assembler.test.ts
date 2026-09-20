import { describe, expect, it, vi } from 'vitest';
import { assemblePrompt, inspectPrompt, type AssembleOptions } from './prompt-assembler';
import { createDefaultPreset, type ChatMessage } from './types';
import { compileTurnContext } from '../memory/world-memory';
import { estimateTokens } from './token-budget';

function options(): AssembleOptions {
  const history: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
    id: `turn-${i}`, role: 'assistant', timestamp: i, variables: { cycleCount: 1 },
    content: `<maintext>对话|旁白|calm|${'雨'.repeat(800)}</maintext><sum>第${i}次在公寓查看纸条。</sum>`,
  }));
  const preset = { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 };
  preset.settings.openai_max_context = 100000;
  return { history, userInput: '继续', variables: { cycleCount: 1 }, preset,
    lorebooks: [], activeLorebookIds: [], userName: '玩家', characterName: '文穗', contextCompressionThresholdTokens: 2000 };
}

describe('compressed prompt history', () => {
  it('resolves random preset macros once while repeatedly fitting the history', () => {
    const input = options();
    input.preset!.settings.prompt_order = [{ identifier: 'main', role: 'system', content: '{{random:甲,乙}}' }];
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const actual = assemblePrompt(input);
      expect(actual.systemPrompt).toContain('甲');
      expect(random).toHaveBeenCalledTimes(1);
    } finally { random.mockRestore(); }
  });
  it('accounts for long resolved preset instructions before discarding below-threshold history', () => {
    const input = options();
    input.contextCompressionThresholdTokens = 60000;
    input.preset!.settings.openai_max_context = 8192;
    input.preset!.settings.openai_max_tokens = 1024;
    input.preset!.settings.prompt_order = [{ identifier: 'main', role: 'system', enabled: true,
      content: `保留权威前缀${'规'.repeat(3500)}` }, { identifier: 'chatHistory', marker: true, enabled: true }];
    const saved = structuredClone(input.history);
    const actual = assemblePrompt(input);
    const inspection = inspectPrompt(input);
    expect(actual.systemPrompt).toContain('规'.repeat(3500));
    expect(actual.messages.filter(message => message.role === 'assistant')).toHaveLength(5);
    expect(actual.messages.find(message => message.role === 'assistant')?.content).toContain('历史剧情摘要');
    expect(inspection.history.budgetTriggered).toBe(true);
    expect(inspection.history.compressionThresholdTokens).toBe(60000);
    expect(inspection.finalMessages.map(({ role, content }) => ({ role, content }))).toEqual(actual.messages);
    expect(estimateTokens(JSON.stringify(actual.messages)) + 1024 + Math.ceil(8192 * .08)).toBeLessThanOrEqual(8192);
    expect(input.history).toEqual(saved);
  });

  it('fails clearly when mandatory instructions alone exceed the request capacity', () => {
    const input = options();
    input.preset!.settings.openai_max_context = 4096;
    input.preset!.settings.openai_max_tokens = 512;
    input.formatPrompt = '权威格式'.repeat(2000);
    expect(() => assemblePrompt(input)).toThrow(/上下文预算不足/);
    expect(() => inspectPrompt(input)).toThrow(/上下文预算不足/);
  });

  it('assembles summaries for older turns and reports the same transmitted content in inspection', () => {
    const input = options();
    const saved = structuredClone(input.history);
    const assembled = assemblePrompt(input);
    const inspection = inspectPrompt(input);
    expect(assembled.messages.filter(m => m.role === 'assistant')[0].content).not.toContain('雨'.repeat(20));
    expect(inspection.history.compressedMessages).toBe(3);
    expect(inspection.history.compressionThresholdTokens).toBe(2000);
    expect(inspection.finalMessages.map(({ role, content }) => ({ role, content }))).toEqual(assembled.messages);
    expect(input.history).toEqual(saved);
  });

  it('uses the shared turn projection without re-compressing or duplicating narrative episodes', () => {
    const input = options();
    const bundle = compileTurnContext({ userInput: input.userInput, history: input.history, variables: input.variables!,
      activeNpcIds: [], locationId: 'home', maxContext: 100000, contextCompressionThresholdTokens: 2000 });
    const inspection = inspectPrompt({ ...input, contextBundle: bundle, contextCompressionThresholdTokens: 100000 });
    expect(inspection.history.compressedMessages).toBe(3);
    expect(inspection.history.messages.map(m => m.content)).toEqual(bundle.recentMessages.map(m => m.content));
    expect(bundle.relevantEpisodes).toEqual([]);
  });

  it('matches actual history inclusion when an oversized record blocks older messages', () => {
    const input = options();
    input.preset!.settings.openai_max_context = 8192;
    input.preset!.settings.openai_max_tokens = 2048;
    input.history = [
      { ...input.history[0], content: '旧短句' },
      { ...input.history[1], content: '大'.repeat(30000) },
      { ...input.history[2], content: '新短句' },
    ];
    const actual = assemblePrompt(input).messages.filter(m => m.role === 'assistant');
    const inspected = inspectPrompt(input).history.messages.filter(m => m.included).map(({ role, content }) => ({ role, content }));
    expect(inspected).toEqual(actual);
    expect(actual).toEqual([{ role: 'assistant', content: '新短句' }]);
  });
});
