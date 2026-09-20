import { afterEach, expect, it, vi } from 'vitest';
import { compileTurnContext, estimateTokens } from '../memory/world-memory';
import { callSecondaryApi, streamChatCompletion } from './api-router';
import { createDefaultPreset } from './types';
const config = { baseUrl: 'https://test.invalid', apiKey: 'test', model: 'test' };
afterEach(() => vi.unstubAllGlobals());
it('compresses older prose against real memory capacity before discarding below-threshold history', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({ id: `turn-${index}`, role: 'assistant' as const,
    content: `<maintext>对话|旁白|calm|旧正文${index}${'雨'.repeat(700)}</maintext><sum>第${index}段在公寓查看纸条。</sum>`,
    timestamp: index, variables: { cycleCount: 1 } }));
  const saved = structuredClone(history);
  const result = compileTurnContext({ userInput: '继续', locationId: 'home', activeNpcIds: [], variables: {},
    maxContext: 4096, reservedOutput: 512, fixedPromptText: '重要规则'.repeat(120),
    contextCompressionThresholdTokens: 60000, history });
  expect(result.recentMessages.map(item => item.id)).toEqual(history.map(item => item.id));
  expect(result.compression?.budgetTriggered).toBe(true);
  expect(result.recentMessages[0].content).toContain('历史剧情摘要');
  expect(result.recentMessages.slice(-2)).toEqual(history.slice(-2));
  const serialized = JSON.stringify({ recentHistory: result.recentMessages.map(({ role, content }) => ({ role, content })),
    memoryContext: result.directorMemory, contextSelectionIds: result.selectedIds });
  const b = result.tokenBudget;
  expect(estimateTokens(serialized) + b.estimatedFixed + b.reservedOutput + b.reservedRepair).toBeLessThanOrEqual(b.maxContext);
  expect(history).toEqual(saved);
});
it('drops oversized optional history while preserving a short recent message', () => {
  const result = compileTurnContext({ userInput: 'look', locationId: 'home', activeNpcIds: [], variables: {}, maxContext: 8192, reservedOutput: 2048,
    history: [{ id: 'large', role: 'assistant', content: '史'.repeat(20000), timestamp: 1, variables: {} }, { id: 'short', role: 'user', content: 'look', timestamp: 2, variables: {} }] });
  expect(result.recentMessages.map(item => item.id)).toEqual(['short']);
  const b = result.tokenBudget;
  expect(b.estimatedSelected + b.estimatedFixed + b.reservedOutput + b.reservedRepair).toBeLessThanOrEqual(8192);
});
it('rejects impossible mandatory prompts without trimming authority', () => {
  expect(() => compileTurnContext({ userInput: 'look', locationId: 'home', activeNpcIds: [], history: [], variables: {}, maxContext: 8192, reservedOutput: 2048, fixedPromptText: '规'.repeat(10000) })).toThrow(/context|上下文/i);
});
it.each(['secondary', 'stream'])('blocks oversized final %s payload before any fetch or retry', async kind => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })));
  vi.stubGlobal('fetch', fetchMock);
  const preset = { ...createDefaultPreset(), id: 'test', createdAt: 0, updatedAt: 0 };
  preset.settings.openai_max_context = 8192;
  preset.settings.openai_max_tokens = 2048;
  const messages = [{ role: 'system' as const, content: '权'.repeat(20000) }];
  const promise = kind === 'secondary' ? callSecondaryApi(config, messages, preset) : streamChatCompletion(config, messages, preset, { onToken: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }, undefined, { retries: 0 });
  await expect(promise).rejects.toMatchObject({ kind: 'context_budget', retryable: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(messages[0].content).toHaveLength(20000);
});

it('honors custom output overrides and blocks a schema that pushes the serialized request over budget', async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))));
  vi.stubGlobal('fetch', fetchMock);
  const preset = { ...createDefaultPreset(), id: 'custom', createdAt: 0, updatedAt: 0 };
  preset.settings.openai_max_context = 8192;
  preset.settings.openai_max_tokens = 2048;
  const messages = [{ role: 'system' as const, content: 'Authority stays intact.' }];
  await expect(callSecondaryApi(config, messages, preset, { maxTokens: 4000 })).resolves.toBe('ok');
  const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(sent.max_tokens).toBe(4000);
  expect(sent.messages).toEqual(messages);
  await expect(callSecondaryApi(config, messages, preset, { maxTokens: 8192 })).rejects.toMatchObject({ kind: 'context_budget' });
  await expect(callSecondaryApi(config, messages, preset, { responseFormat: { type: 'json_schema', json_schema: { name: 'oversized', schema: { description: '字'.repeat(10000) } } } })).rejects.toMatchObject({ kind: 'context_budget' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retains whole authority records when optional history is dropped and keeps history under a larger budget', () => {
  const options = { userInput: 'look', locationId: 'home', activeNpcIds: ['fumi'], variables: {}, history: [{ id: 'large', role: 'assistant' as const, content: '史'.repeat(20000), timestamp: 1, variables: {} }] };
  const small = compileTurnContext({ ...options, maxContext: 8192, reservedOutput: 2048 });
  const large = compileTurnContext(options);
  expect(small.relevantBackgroundFacts.filter(fact => fact.level === 'fixed')).toEqual(large.relevantBackgroundFacts.filter(fact => fact.level === 'fixed'));
  expect(small.relevantBackgroundFacts.length).toBeGreaterThan(0);
  expect(small.recentMessages).toEqual([]);
  expect(large.recentMessages).toEqual(options.history);
});

it('does not charge saved state snapshots as transmitted recent history', () => {
  const message = { id: 'short', role: 'assistant' as const, content: 'look', timestamp: 1, variables: { archive: '史'.repeat(100000) } };
  const result = compileTurnContext({ userInput: 'look', locationId: 'home', activeNpcIds: [], variables: {}, history: [message] });
  expect(result.recentMessages.map(item => item.id)).toEqual(['short']);
  expect(result.recentMessages[0]).toBe(message);
});
