import { describe, expect, it } from 'vitest';
import { buildAuthorizedRetrievalCorpus, executeAuthorizedQueries } from './authorized-retrieval';
import { buildTurnCommit } from './world-memory';
import { maintextToScene } from '../engine/scene-parser';
import type { ChatMessage } from '../sillytavern/types';

function fixture() {
  const text = '对话|旁白|calm|那天慧慧把零钱撒在了柜台边。';
  const commit = buildTurnCommit({ turnId: 'accepted', turnIndex: 1, createdAt: 1,
    occurredAt: '2024-09-09T09:00:00', locationId: 'supermarket', cycleCount: 1,
    summary: '慧慧的零钱', scene: maintextToScene(text), beforeVariables: {}, settledVariables: {} });
  const history: ChatMessage[] = [{ id: 'accepted', role: 'assistant', content: `<maintext>${text}</maintext>`,
    timestamp: 1, variables: { cycleCount: 1, mysteryKnowledge: {} } },
    { id: 'user', role: 'user', content: '<maintext>旁白|隐藏的杀人真相</maintext>', timestamp: 2, variables: { cycleCount: 1 } },
    { id: 'draft', role: 'assistant', content: '<maintext>旁白|失败草稿秘密</maintext>', timestamp: 3, variables: { cycleCount: 1 } }];
  return { history, variables: { cycleCount: 2, worldMemory: commit.worldMemory }, knownFacts: [] };
}

describe('authorized retrieval corpus', () => {
  it('retrieves exact accepted historical prose, excluding user assertions and uncommitted drafts', () => {
    const corpus = buildAuthorizedRetrievalCorpus(fixture());
    const results = executeAuthorizedQueries(corpus, [{ tool: 'search_history', query: '零钱' }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ text: '那天慧慧把零钱撒在了柜台边。', status: 'historical-recollection', cycleCount: 1 });
    expect(JSON.stringify(corpus)).not.toMatch(/隐藏的杀人真相|失败草稿秘密/);
  });
  it('excludes old versions, incompatible routes and previously higher fact levels', () => {
    const input = fixture();
    expect(buildAuthorizedRetrievalCorpus({ ...input, variables: { ...input.variables, storyProgress: { versionStartCycle: 2, presentedBeatIds: [] } } }).records).toEqual([]);
    input.history[0].variables.lockedRoute = 'C';
    expect(buildAuthorizedRetrievalCorpus({ ...input, variables: { ...input.variables, lockedRoute: 'A' } }).records).toEqual([]);
    delete input.history[0].variables.lockedRoute;
    input.history[0].variables.mysteryKnowledge = { secret: 'confirmation' };
    expect(buildAuthorizedRetrievalCorpus({ ...input, knownFacts: [{ id: 'secret', route: 'shared', kind: 'evidence', level: 'hint', text: '仅公开提示' }] }).records.map(r => r.text)).toEqual(['仅公开提示']);
  });
  it('never returns model supplied results, and obeys result count and whole-record token limits', () => {
    const corpus = buildAuthorizedRetrievalCorpus(fixture());
    expect(executeAuthorizedQueries(corpus, [{ tool: 'search_history', query: '零钱' }], 1)).toEqual([]);
    expect(executeAuthorizedQueries(corpus, [{ tool: 'search_known_evidence', query: '零钱' }])).toEqual([]);
  });
  it('retrieves testimony by its original speaker without turning it into objective fact', () => {
    const input = fixture();
    input.history[0].content = '<maintext>对话|慧慧|calm|我昨天下午一直在店里。</maintext>';
    const result = executeAuthorizedQueries(buildAuthorizedRetrievalCorpus(input), [{ tool: 'search_history', query: '慧慧' }]);
    expect(result[0]).toMatchObject({ text: '我昨天下午一直在店里。', speaker: '慧慧', status: 'historical-recollection',
      cycleCount: 1, locationId: 'supermarket', occurredAt: '2024-09-09T09:00:00' });
  });
  it('caps queries at two, each with three hits, and keeps the original immutable corpus', () => {
    const input = fixture();
    input.history[0].content = `<maintext>${Array.from({ length: 9 }, (_, n) => `对话|旁白|calm|零钱第${n}项。`).join('\n')}</maintext>`;
    const corpus = buildAuthorizedRetrievalCorpus(input);
    const queries = Array.from({ length: 3 }, () => ({ tool: 'search_history' as const, query: '零钱' }));
    expect(executeAuthorizedQueries(corpus, queries)).toHaveLength(6);
    input.history[0].content = '<maintext>对话|旁白|calm|篡改后的秘密</maintext>';
    expect(JSON.stringify(corpus)).not.toContain('篡改');
    expect(Object.isFrozen(corpus.records[0])).toBe(true);
  });
  it('only marks historical material older than the existing raw-history window as additional material', () => {
    const input = fixture();
    expect(buildAuthorizedRetrievalCorpus(input).hasOlderHistory).toBe(false);
    input.history.push(...Array.from({ length: 4 }, (_, n): ChatMessage => ({ id: `recent-${n}`, role: 'user', content: '现在的输入', timestamp: n, variables: {} })));
    expect(buildAuthorizedRetrievalCorpus(input).hasOlderHistory).toBe(true);
  });
});
