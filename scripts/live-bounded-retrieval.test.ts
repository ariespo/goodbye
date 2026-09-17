// Explicit opt-in: two small real-provider checks, no saved game changes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planBoundedRetrieval } from '../src/agents/mystery/bounded-retrieval';
import { buildAuthorizedRetrievalCorpus } from '../src/memory/authorized-retrieval';
import { buildTurnCommit } from '../src/memory/world-memory';
import { maintextToScene } from '../src/engine/scene-parser';
import { callSecondaryApi, streamChatCompletion } from '../src/sillytavern/api-router';
import type { ApiRequestEvent } from '../src/sillytavern/api-telemetry';
import { createDefaultPreset, type ChatMessage } from '../src/sillytavern/types';

describe.skipIf(process.env.LIVE_BOUNDED_RETRIEVAL !== '1')('live bounded retrieval and usage smoke', () => {
  it('finds an accepted older memory and observes real streaming usage without changing state', async () => {
    const apiKey = process.env.DAY_API_KEY;
    const baseUrl = process.env.DAY_API_BASE_URL;
    const model = process.env.DAY_MODEL;
    if (!apiKey || !baseUrl || !model) throw new Error('Set DAY_API_KEY, DAY_API_BASE_URL and DAY_MODEL explicitly');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const requests: ApiRequestEvent[] = [];
    const api = { apiKey, baseUrl, model, telemetry: { onRequest: (event: ApiRequestEvent) => requests.push(event) } };
    const preset = { ...createDefaultPreset(), id: 'retrieval-smoke', createdAt: 0, updatedAt: 0 };
    const source = '对话|慧慧|calm|那天我把零钱撒在了柜台边。';
    const commit = buildTurnCommit({ turnId: 'old-accepted', turnIndex: 1, createdAt: 1,
      occurredAt: '2024-09-09T09:00:00', locationId: 'supermarket', cycleCount: 1,
      summary: '慧慧的零钱', scene: maintextToScene(source), beforeVariables: {}, settledVariables: {} });
    const history: ChatMessage[] = [{ id: 'old-accepted', role: 'assistant', content: `<maintext>${source}</maintext>`,
      timestamp: 1, variables: { cycleCount: 1, mysteryKnowledge: {} } },
    ...Array.from({ length: 4 }, (_, i): ChatMessage => ({ id: `recent-${i}`, role: 'user',
      content: '继续观察', timestamp: i + 2, variables: { cycleCount: 2 } }))];
    const corpus = buildAuthorizedRetrievalCorpus({ history, variables: { cycleCount: 2, worldMemory: commit.worldMemory }, knownFacts: [] });
    let queryOutcome = 'not-run';
    let exactHistoryFound = false;
    let streamCompleted = false;
    let streamErrorKind: string | null = null;
    let callbackObservedRequest = false;
    const started = performance.now();
    const streamOnly = process.env.BOUNDED_SMOKE_PHASE === 'stream';
    try {
      if (!streamOnly) {
        const result = await planBoundedRetrieval({ input: '回忆之前慧慧把零钱放在什么地方，核对那次说过的话。',
          corpus, api, preset, abortSignal: controller.signal,
          complete: (messages, options) => callSecondaryApi(api, messages, preset, options) });
        queryOutcome = result.outcome;
        exactHistoryFound = result.records.some(record => record.text === '那天我把零钱撒在了柜台边。');
      }
      const beforeWriter = requests.length;
      try {
        await streamChatCompletion(api, [{ role: 'system', content: '只输出“测试完成”四个字。' }, { role: 'user', content: '测试' }],
          { ...preset, settings: { ...preset.settings, openai_max_tokens: 256 } }, {
            onToken: () => {}, onError: () => {}, onComplete: () => {
              callbackObservedRequest = requests.length > beforeWriter;
              streamCompleted = true;
            },
          }, controller.signal, { retries: 0 });
      } catch (error) {
        streamErrorKind = error && typeof error === 'object' && 'kind' in error ? String(error.kind) : 'unknown';
      }
    } finally {
      clearTimeout(timer);
      mkdirSync('.codex-test-tmp', { recursive: true });
      writeFileSync('.codex-test-tmp/bounded-retrieval-live.json', JSON.stringify({
        testedAt: new Date().toISOString(), phase: streamOnly ? 'stream' : 'all', model, elapsedMs: Math.round(performance.now() - started),
        queryOutcome, exactHistoryFound, streamCompleted, callbackObservedRequest, streamErrorKind, requests,
        limitations: 'Synthetic accepted-history fixture and short stream only; no full playthrough, no saved game mutation, no configured prices.',
      }, null, 2));
    }
    if (!streamOnly) {
      expect(queryOutcome).toBe('used');
      expect(exactHistoryFound).toBe(true);
    }
    expect(streamCompleted).toBe(true);
    expect(callbackObservedRequest).toBe(true);
    expect(requests.length).toBeGreaterThanOrEqual(streamOnly ? 1 : 2);
  }, 70_000);
});
