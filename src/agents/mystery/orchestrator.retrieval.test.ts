import { describe, expect, it, vi } from 'vitest';
import { prepareMysteryTurn } from './orchestrator';
import { buildTurnPreparation, preparationContextKey } from './turn-preparation';
import { buildTurnCommit } from '../../memory/world-memory';
import { maintextToScene } from '../../engine/scene-parser';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatMessage } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';

function request() {
  const game = useGameStore.getState().game;
  const narrative = '对话|旁白|calm|慧慧把零钱撒在柜台边。';
  const history: ChatMessage[] = [{ id: 'old', role: 'assistant', content: `<maintext>${narrative}\n${Array.from({ length: 18 }, () => `对话|旁白|calm|${'雨'.repeat(100)}`).join('\n')}</maintext><sum>玩家在便利店结账。</sum>`,
    timestamp: 1, variables: { cycleCount: 1, mysteryKnowledge: {} } }, ...Array.from({ length: 5 }, (_, index): ChatMessage => ({
    id: `later-${index}`, role: 'assistant', content: `<maintext>对话|旁白|calm|你望着窗外的雨。${'雨'.repeat(400)}</maintext><sum>玩家在公寓等雨停。</sum>`, timestamp: index + 2,
    variables: { cycleCount: 1, mysteryKnowledge: {} },
  }))];
  const memory = buildTurnCommit({ turnId: 'old', turnIndex: 1, createdAt: 1, occurredAt: '2024-09-09T08:10:00',
    locationId: 'supermarket', cycleCount: 1, summary: '普通结账', scene: maintextToScene(narrative), beforeVariables: {}, settledVariables: {} }).worldMemory;
  return buildTurnPreparation({ userInput: '回忆之前慧慧的零钱，对比今天所见',
    settings: { api: { baseUrl: 'test', model: 'test', apiKey: 'test' }, userName: '玩家', characterName: '文穗', agentNarrativeMode: 'standard', contextCompressionThresholdTokens: 2000 } as AppSettings,
    activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 },
    variables: { ...createDefaultVariables(), worldMemory: memory, cycleCount: 2, location: 'home' },
    gameStatus: { ...game.gameStatus, time: new Date('2024-09-09T08:20:00') }, currentState: { ...game.currentState, background: 'home-day' },
    endingCheckContext: game.endingCheckContext, history }).request;
}
const plan = { turnGoal: '留在房间核对记忆', tone: '克制', timeCostMinutes: 10,
  beats: [{ id: 'b1', purpose: '当下互动', description: '你留在房间里查看周围。', locationId: 'home', speakerIds: [] }],
  revelations: [], assetRequests: [], optionIntents: [{ id: 'o1', intent: '继续查看房间', tone: '克制', expectedPressure: 'low' }] };

describe('retrieval survives actual execution projection', () => {
  it('carries genuinely older retrieved text through Director, Writer and repair context without authorizing it as canon', async () => {
    const initial = request();
    const complete = vi.fn(async (messages: Array<{ content: string }>) => {
      if (messages[0].content.includes('只读历史查询规划器')) return '{"queries":[{"tool":"search_history","query":"零钱"}]}';
      if (messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')) return '{"approved":true,"violations":[],"corrections":[]}';
      return JSON.stringify(plan);
    });
    expect(JSON.stringify(initial.presentationContext.recentHistory)).not.toContain('零钱');
    const result = await prepareMysteryTurn({ ...initial, complete });
    expect(result.writerPacket.resolvedAction).toBeDefined();
    expect(JSON.stringify(result.writerMessages)).toContain('慧慧把零钱撒在柜台边');
    expect(JSON.stringify(result.writerPacket.continuityContext?.retrievedContext)).toContain('historical-recollection');
    expect(JSON.stringify(result.writerPacket.continuityContext?.publicContinuity)).not.toContain('零钱');
    expect(result.writerPacket.authorizedFacts).toEqual([]);
    expect(complete.mock.calls.filter(([messages]) => messages[0].content.includes('只读历史查询规划器'))).toHaveLength(1);
  });
  it('excludes runtime telemetry from cache identities, retaining immutable corpus changes', () => {
    const initial = request();
    const key = preparationContextKey('chat', initial, initial.api);
    const telemetry = { onRequest: () => {}, onRepair: () => {}, extra: 'runtime-only' };
    expect(preparationContextKey('chat', { ...initial, api: { ...initial.api, telemetry } }, { ...initial.api, telemetry })).toBe(key);
    expect(preparationContextKey('chat', { ...initial, retrievalCorpus: { records: [], fingerprint: 'changed' } }, initial.api)).not.toBe(key);
  });
  it('does not invoke optional lookup during speculative preparation', async () => {
    const complete = vi.fn(async () => JSON.stringify(plan));
    const result = await prepareMysteryTurn({ ...request(), speculative: true, complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.writerPacket.continuityContext?.retrievedContext).toBeUndefined();
  });
  it('counts actual Director correction calls once and observer errors do not break repair', async () => {
    const initial = request();
    let attempts = 0;
    const onRepair = vi.fn(() => { throw new Error('telemetry unavailable'); });
    const complete = vi.fn(async () => JSON.stringify(++attempts === 1 ? {
      ...plan, revelations: [{ factId: 'unregistered-secret', level: 'confirmation', delivery: 'narration' }],
    } : plan));
    const result = await prepareMysteryTurn({ ...initial, speculative: true, api: { ...initial.api, telemetry: { onRequest: () => {}, onRepair } }, complete });
    expect(result.hardReview.approved).toBe(true);
    expect(onRepair).toHaveBeenCalledTimes(1);
    expect(onRepair).toHaveBeenCalledWith('director');
  });
});
