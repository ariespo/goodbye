import { describe, expect, it } from 'vitest';
import { buildTurnPreparation } from './turn-preparation';
import { prepareMysteryTurn, type PreparedMysteryTurn, type AgentCompletion } from './orchestrator';
import { reviewDirectorPlan } from './review';
import { settleGameTransaction } from '../../engine/game-transaction';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type DynamicRecord } from '../../sillytavern/types';
import type { DirectorPlan } from './types';

const plan: DirectorPlan = { turnGoal: '在校门询问', tone: '克制',
  beats: [{ id: 'gate', purpose: '询问', description: '门卫在校门口回应。', locationId: 'school', speakerIds: ['school-guard'] }],
  revelations: [], assetRequests: [], optionIntents: [{ id: 'rest', intent: '休息', tone: '克制', expectedPressure: 'low' }] };
const complete: AgentCompletion = async messages => messages[0].content.includes('事实复核') || messages[0].content.includes('节奏与玩家能动性')
  ? JSON.stringify({ approved: true, violations: [], corrections: [] }) : JSON.stringify(plan);
function prepare(variables: DynamicRecord, input: string, resumeActionId?: string) {
  const game = useGameStore.getState().game;
  return buildTurnPreparation({ variables, userInput: input, resumeActionId,
    settings: { api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, agentNarrativeMode: 'standard', userName: '玩家', characterName: '文穗' } as AppSettings,
    activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 } as ChatPreset,
    gameStatus: { ...game.gameStatus, time: new Date(String(variables.time)), stamina: Number(variables.stamina), sanity: Number(variables.sanity) },
    currentState: { ...game.currentState, background: 'street' }, endingCheckContext: game.endingCheckContext, history: [] });
}
function commit(variables: DynamicRecord, turn: PreparedMysteryTurn, death = false) {
  return settleGameTransaction({ variables,
    gameStatus: { time: new Date(String(variables.time)), stamina: Number(variables.stamina), sanity: Number(variables.sanity), items: [] },
    resolvedAction: turn.writerPacket.resolvedAction, pendingActionAuthorization: turn.pendingActionAuthorization,
    pendingActionSceneContext: turn.pendingActionSceneContext, deliverPendingDeathNews: death,
    narrativeText: death ? '对话|旁白|calm|警方明确告知你：文穗已经死亡。' : undefined }).variables;
}
async function interrupted() {
  const start = { ...createDefaultVariables(), location: 'home', time: '2024-09-09T15:55:00', stamina: 100, sanity: 70 };
  const first = await prepareMysteryTurn({ ...prepare(start, '前往学校调查文穗的情况').request, complete });
  const beforeDeath = commit(start, first);
  const death = await prepareMysteryTurn({ ...prepare(beforeDeath, '接听警方电话').request, complete });
  return { first, death, variables: commit(beforeDeath, death, true) };
}
describe('saved execution scene context', () => {
  it('keeps the official phone event in transit without teleporting or spending travel again', async () => {
    const { first, death, variables } = await interrupted();
    expect(first.writerPacket.resolvedAction?.executedMinutes).toBe(5);
    expect(death.writerPacket.resolvedAction?.executedMinutes).toBe(0);
    expect(death.executedContext?.narrativeBackground).toBe('street');
    expect(death.executedContext?.activeNpcIds).toEqual([]);
    expect(death.writerPacket.authorizedActionOutcomes?.map(source => source.text).join('')).toContain('仍在途中');
    expect(variables.actionContinuity?.sceneContext?.contextsByLocation.school.sceneContract.entryMode).toBe('exterior');
    expect(variables.location).toBe('home');
  });
  it('restores exterior school restrictions on resume and denies the forbidden teacher', async () => {
    const { variables } = await interrupted();
    const resumed = await prepareMysteryTurn({ ...prepare(variables, '继续未完成的调查', variables.actionContinuity?.continuation?.actionId).request, complete });
    expect(resumed.writerPacket.sceneContract).toMatchObject({ destinationLocationId: 'school', entryMode: 'exterior', forbiddenNpcIds: ['liu-renguang'] });
    expect(resumed.writerPacket.resolvedAction?.segments.filter(segment => segment.step.kind === 'travel')
      .reduce((total, segment) => total + segment.executedMinutes, 0)).toBe(5);
    expect(resumed.writerPacket.resolvedAction?.endLocationId).toBe('school');
    const attemptedTeacher = { ...resumed.directorPlan, beats: [...resumed.directorPlan.beats,
      { id: 'teacher', purpose: '回应', description: '体育老师走到校门边回应。', locationId: 'school', speakerIds: ['liu-renguang'] }] };
    expect(reviewDirectorPlan(attemptedTeacher, resumed.brief, resumed.executedContext?.turnContext).approved).toBe(false);
    expect(JSON.stringify(resumed.writerMessages)).not.toContain('contextsByLocation');
    expect(JSON.stringify(resumed.writerMessages)).not.toContain('pendingActionSceneContext');
    expect(commit(variables, resumed).actionContinuity?.sceneContext).toBeNull();
  });
});
