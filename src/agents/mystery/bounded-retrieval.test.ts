import { describe, expect, it, vi } from 'vitest';
import { ApiCallError } from '../../sillytavern/api-router';
import { isBoundedRetrievalEligible, planBoundedRetrieval } from './bounded-retrieval';
import type { AuthorizedRetrievalCorpus } from '../../memory/authorized-retrieval';

const corpus: AuthorizedRetrievalCorpus = { fingerprint: 'test', hasOlderHistory: true, records: [
  { id: 'H1', kind: 'history', text: '慧慧把零钱撒在柜台边。', status: 'historical-recollection', cycleCount: 1 },
] };
const options = { input: '回忆之前慧慧的说法，核对有什么矛盾', corpus,
  api: { baseUrl: 'test', model: 'test', apiKey: 'test' }, preset: null };

describe('bounded optional retrieval', () => {
  it('adds no call for normal actions, absent material, or speculative runs', async () => {
    const complete = vi.fn();
    expect(isBoundedRetrievalEligible('去便利店调查', corpus)).toBe(false);
    expect(isBoundedRetrievalEligible(options.input)).toBe(false);
    expect(isBoundedRetrievalEligible(options.input, { ...corpus, hasOlderHistory: false })).toBe(false);
    await planBoundedRetrieval({ ...options, input: '去便利店调查', complete });
    await planBoundedRetrieval({ ...options, speculative: true, complete });
    expect(complete).not.toHaveBeenCalled();
  });
  it('runs one planner, performs exact local lookup, and exposes no raw corpus to the planner', async () => {
    const complete = vi.fn().mockResolvedValue('{"queries":[{"tool":"search_history","query":"零钱"}]}');
    const result = await planBoundedRetrieval({ ...options, complete });
    expect(result.records).toEqual(corpus.records);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(complete.mock.calls[0])).not.toContain('慧慧把零钱撒在柜台边');
  });
  it('provides only bounded public speaker hints for pronoun-based recall', async () => {
    const complete = vi.fn().mockResolvedValue('{"queries":[{"tool":"search_history","query":"慧慧"}]}');
    const spokenCorpus: AuthorizedRetrievalCorpus = { ...corpus, records: [{ ...corpus.records[0], speaker: '慧慧', text: '我一直在店里。' }] };
    const result = await planBoundedRetrieval({ ...options, input: '核对她前两次的说法', corpus: spokenCorpus, complete });
    expect(result.records).toEqual(spokenCorpus.records);
    const prompt = JSON.parse(complete.mock.calls[0][0][1].content);
    expect(prompt.availableSpeakers).toEqual(['慧慧']);
    expect(JSON.stringify(prompt)).not.toContain('我一直在店里');
  });
  it.each(['not JSON', '{"queries":[{"tool":"search_secrets","query":"真相"}]}',
    '{"queries":[{"tool":"search_history","query":"零钱","result":"伪造"}]}',
    '{"queries":[{"tool":"search_history","query":"零钱"},{"tool":"search_history","query":"零钱"},{"tool":"search_history","query":"零钱"}]}'])('falls back after malformed output without asking for repair: %s', async raw => {
    const complete = vi.fn().mockResolvedValue(raw);
    expect((await planBoundedRetrieval({ ...options, complete })).outcome).toBe('failed');
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('falls back on ordinary failures but propagates cancellation including ApiCallError abort', async () => {
    expect((await planBoundedRetrieval({ ...options, complete: vi.fn().mockRejectedValue(new Error('timeout')) })).outcome).toBe('failed');
    await expect(planBoundedRetrieval({ ...options, complete: vi.fn().mockRejectedValue(new ApiCallError('cancelled', 'abort')) })).rejects.toThrow('cancelled');
    const abort = new AbortController();
    const pending = planBoundedRetrieval({ ...options, abortSignal: abort.signal, complete: () => new Promise(() => {}) });
    abort.abort();
    await expect(pending).rejects.toThrow();
  });
  it('omits optional retrieval if available budget cannot fit a complete record', async () => {
    const result = await planBoundedRetrieval({ ...options, tokenLimit: 1,
      complete: vi.fn().mockResolvedValue('{"queries":[{"tool":"search_history","query":"零钱"}]}') });
    expect(result.records).toEqual([]);
  });
});
