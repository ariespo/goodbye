import { describe, expect, it } from 'vitest';
import { buildTurnPreparation, preparationContextKey } from './turn-preparation';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatMessage } from '../../sillytavern/types';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';

function fixture() {
  const { game } = useGameStore.getState();
  return { userInput: '前往学校调查文穗的情况',
    settings: { api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, userName: '玩家', characterName: '文穗', agentNarrativeMode: 'standard' } as AppSettings,
    activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 } as ChatPreset,
    variables: { ...createDefaultVariables(), location: 'home', time: '2024-09-09T15:55:00' },
    gameStatus: { ...game.gameStatus, time: new Date('2024-09-09T15:55:00'), stamina: 100, sanity: 70 },
    currentState: { ...game.currentState, background: 'home-day' }, endingCheckContext: game.endingCheckContext, history: [] as ChatMessage[] };
}
const interrupted: ResolvedActionOutcome = { id: 'r', cycleCount: 1, startTime: '2024-09-09T15:55:00', endTime: '2024-09-09T16:00:00',
  startLocationId: 'home', endLocationId: 'home', plannedMinutes: 70, executedMinutes: 5,
  segments: [{ step: { id: 'travel', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
    plannedMinutes: 15, executedMinutes: 5, cumulativeExecutedMinutes: 5, staminaDelta: -1, completed: false }],
  resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 99, sanity: 70 } }, completedSourceIds: [], eventEffectIds: [],
  interruption: { id: 'death-news', at: '2024-09-09T16:00:00' } };

describe('execution context projection', () => {
  it('rebuilds the actual anchor and NPC context after interrupted travel', () => {
    const prepared = buildTurnPreparation(fixture());
    expect(prepared.request.truthContext.currentLocation).toBe('school');
    const projected = prepared.request.projectExecution!(interrupted);
    expect(projected.truthContext.currentLocation).toBe('home');
    expect(projected.truthContext.activeNpcIds).toEqual([]);
    expect(projected.actionNarrativeContext).toBeNull();
    expect(projected.presentationContext.currentBackground).toBe('street');
    expect(JSON.stringify(projected.npcPlayerKnowledge)).not.toContain('school-guard');
  });
  it('captures a snapshot and invalidates cache when source state outside destination memory changes', () => {
    const input = fixture();
    const prepared = buildTurnPreparation(input);
    const originalKey = preparationContextKey('chat', prepared.request);
    input.variables.location = 'supermarket';
    input.history.push({ id: 'later', role: 'assistant', content: '店员递给你一杯水。', timestamp: 1, variables: {} });
    const projected = prepared.request.projectExecution!(interrupted);
    expect(projected.truthContext.currentLocation).toBe('home');
    expect(preparationContextKey('chat', prepared.request)).toBe(originalKey);
    expect(preparationContextKey('chat', buildTurnPreparation(input).request)).not.toBe(originalKey);
  });
  it('keeps full state snapshots and callbacks outside both model prompt contexts', () => {
    const prepared = buildTurnPreparation(fixture());
    expect(prepared.request.actionAuthority?.currentLocationId).toBe('home');
    expect(prepared.request.actionAuthority?.startTime).toBe('2024-09-09T15:55:00');
    expect(JSON.stringify(prepared.request.turnContext)).not.toContain('projectionSnapshot');
    expect(JSON.stringify(prepared.request.presentationContext)).not.toContain('projectionSnapshot');
  });
});
