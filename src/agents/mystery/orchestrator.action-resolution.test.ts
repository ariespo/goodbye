import { describe, expect, it } from 'vitest';
import { prepareMysteryTurn } from './orchestrator';
import { buildTurnPreparation } from './turn-preparation';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';

function request(mode: 'standard' | 'legacy', pending = false, override: { time?: string; location?: string; userInput?: string; knowledgeEvents?: string[] } = {}) {
  const game = useGameStore.getState().game;
  const time = override.time ?? (pending ? '2024-09-09T16:00:00' : '2024-09-09T08:00:00');
  return buildTurnPreparation({ userInput: override.userInput ?? '调查房间',
    settings: { api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, userName: '玩家', characterName: '文穗', agentNarrativeMode: mode } as AppSettings,
    activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 } as ChatPreset,
    variables: { ...createDefaultVariables(), time, location: override.location ?? 'home', knowledgeEvents: override.knowledgeEvents,
      ...(pending ? { deathNews: 'pending' } : {}) },
    gameStatus: { ...game.gameStatus, time: new Date(time), stamina: 100, sanity: 70 },
    currentState: { ...game.currentState, background: 'home-day' }, endingCheckContext: game.endingCheckContext, history: [],
  }).request;
}
const complete: NonNullable<Parameters<typeof prepareMysteryTurn>[0]['complete']> = async messages => {
  if (messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')) {
    return JSON.stringify({ approved: true, violations: [], corrections: [] });
  }
  return JSON.stringify({ turnGoal: '查看房间', tone: '克制', timeCostMinutes: 1,
    beats: [{ id: 'b1', purpose: '当下互动', description: '你留在房间里查看周围。', locationId: 'home', speakerIds: [] }],
    revelations: [], assetRequests: [], optionIntents: [
      { id: 'o1', intent: '继续查看房间', tone: '克制', expectedPressure: 'low' },
      { id: 'o2', intent: '休息一会儿', tone: '克制', expectedPressure: 'low' }],
  });
};

describe('action resolution before Writer construction', () => {
  it('keeps a completed en-route encounter when destination work stops at 16:00', async () => {
    const initial = request('standard', false, { time: '2024-09-09T15:35:00',
      userInput: '前往文穗的中学周边寻找其他知情者' });
    expect(initial.truthContext.sceneContract?.requiredEnRouteNpcIds).toContain('detective-a');
    const prepared = await prepareMysteryTurn({ ...initial, complete: async (messages, ...rest) => {
      const output = JSON.parse(await complete(messages, ...rest));
      if (output.beats) output.beats = [
        { id: 'route', purpose: '途中遭遇', description: '途中与货车司机短暂交谈，不涉及案件事实。',
          locationId: 'street', speakerIds: ['detective-a'] },
        { id: 'school', purpose: '核实情况', description: '在校门向门卫打听。',
          locationId: 'school', speakerIds: ['school-guard'] },
      ];
      return JSON.stringify(output);
    } });
    expect(prepared.writerPacket.resolvedAction).toMatchObject({ executedMinutes: 25,
      endTime: '2024-09-09T16:00:00', endLocationId: 'school' });
    expect(prepared.directorPlan.beats[0]).toMatchObject({ locationId: 'street', speakerIds: ['detective-a'] });
    expect(prepared.directorPlan.beats.findIndex(beat => beat.locationId === 'school')).toBeGreaterThan(0);
    expect(prepared.writerPacket.authorizedFacts).toEqual([]);
    expect(prepared.writerPacket.resolvedAction?.continuation).toBeDefined();
  });

  it('keeps the completed supermarket interaction when the next travel leg is interrupted', async () => {
    const prepared = await prepareMysteryTurn({ ...request('standard', false, { time: '2024-09-09T15:00:00', location: 'supermarket',
      userInput: '先调查便利店，再去学校调查', knowledgeEvents: ['meet:chen-huihui'] }), complete: async (messages, ...rest) => {
      const result = JSON.parse(await complete(messages, ...rest));
      if (result.beats) Object.assign(result, { beats: [
        { id: 'store', purpose: '调查', description: '询问店员', locationId: 'supermarket', speakerIds: ['chen-huihui'] },
        { id: 'school', purpose: '调查', description: '询问门卫', locationId: 'school', speakerIds: ['school-guard'] },
      ], actionSteps: [
        { id: 'a', kind: 'investigation', scope: 'normal', locationId: 'supermarket' },
        { id: 'b', kind: 'investigation', scope: 'normal', locationId: 'school' },
      ] });
      return JSON.stringify(result);
    } });
    expect(prepared.writerPacket.resolvedAction).toMatchObject({ executedMinutes: 60, endLocationId: 'supermarket' });
    expect(prepared.directorPlan.beats[0].speakerIds).toContain('chen-huihui');
    expect(prepared.directorPlan.beats.flatMap(beat => beat.speakerIds ?? [])).not.toContain('school-guard');
    expect(prepared.executedContext?.activeNpcIds).toEqual([]);
    expect(prepared.writerPacket.sceneContract).toBeUndefined();
  });
  it('repairs malformed action proposals from providers without schema enforcement before review', async () => {
    let calls = 0;
    const prepared = await prepareMysteryTurn({ ...request('standard'), complete: async (messages, ...rest) => {
      const output = await complete(messages, ...rest);
      calls += 1;
      return calls === 1 ? JSON.stringify({ ...JSON.parse(output), actionSteps: [
        { id: 'forged', kind: 'event', eventId: 'death-news', scope: 'short', locationId: 'home' },
      ] }) : output;
    } });
    expect(calls).toBeGreaterThan(1);
    expect(prepared.writerPacket.resolvedAction?.executedMinutes).toBe(55);
  });
  it.each(['standard', 'legacy'] as const)('%s uses actual work cost instead of Director one-minute proposal', async mode => {
    const prepared = await prepareMysteryTurn({ ...request(mode), complete });
    expect(prepared.writerPacket.resolvedAction).toMatchObject({ executedMinutes: 55, endTime: '2024-09-09T08:55:00',
      resources: { after: { stamina: 93, sanity: 70 } } });
    expect(prepared.directorPlan.timeCostMinutes).toBe(55);
    expect(prepared.executedContext?.truthContext.currentLocation).toBe('home');
    expect(JSON.stringify(prepared.writerPacket.authorizedActionOutcomes)).toContain('55分钟');
    expect(JSON.stringify(prepared.writerMessages)).not.toContain('executionFingerprint');
  });
  it('creates an official death delivery source with zero time and one event effect', async () => {
    const prepared = await prepareMysteryTurn({ ...request('standard', true), complete });
    expect(prepared.writerPacket.resolvedAction).toMatchObject({ executedMinutes: 0, endTime: '2024-09-09T16:00:00',
      resources: { after: { stamina: 100, sanity: 58 } } });
    expect(prepared.writerPacket.authorizedFacts).toEqual([]);
    expect(JSON.stringify(prepared.writerPacket.authorizedActionOutcomes)).toContain('初步死亡通报');
    expect(prepared.writerPacket.resolvedAction?.eventEffectIds).toHaveLength(1);
  });
  it('does not expose the school reception when travel is interrupted before arrival', async () => {
    const game = useGameStore.getState().game;
    const time = '2024-09-09T15:55:00';
    const initial = request('standard');
    const preparation = buildTurnPreparation({ userInput: '前往学校调查文穗的情况',
      settings: { api: initial.api, userName: '玩家', characterName: '文穗', agentNarrativeMode: 'standard' } as AppSettings,
      activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 } as ChatPreset,
      variables: { ...createDefaultVariables(), location: 'home', time },
      gameStatus: { ...game.gameStatus, time: new Date(time), stamina: 100, sanity: 70 },
      currentState: { ...game.currentState, background: 'home-day' }, endingCheckContext: game.endingCheckContext, history: [] });
    const prepared = await prepareMysteryTurn({ ...preparation.request, complete });
    expect(prepared.writerPacket.resolvedAction).toMatchObject({ executedMinutes: 5, endLocationId: 'home' });
    expect(prepared.executedContext?.activeNpcIds).toEqual([]);
    expect(prepared.executedContext?.presentationContext.currentBackground).toBe('street');
    expect(prepared.writerPacket.authorizedFacts).toEqual([]);
    expect(prepared.writerPacket.authorizedKnowledgeEvents).toEqual([]);
    expect(prepared.directorPlan.beats.every(beat => !beat.speakerIds?.length)).toBe(true);
    expect(prepared.brief.sceneContract).toBeUndefined();
  });
});
