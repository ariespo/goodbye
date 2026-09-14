import { describe, expect, it } from 'vitest';
import { buildTurnPreparation, preparationContextKey, type TurnPreparationInput } from './turn-preparation';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatMessage } from '../../sillytavern/types';
import type { ResolvedActionOutcome } from '../../engine/action-resolution';
import { buildPendingActionSceneContext } from '../../engine/action-scene-continuity';

function fixture(): TurnPreparationInput {
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
  it('keeps the execution callback independent from mutations to its exposed scene map', () => {
    const prepared = buildTurnPreparation(fixture());
    prepared.request.pendingActionSceneContext!.contextsByLocation.school.forbiddenNpcIds.length = 0;

    const projected = prepared.request.projectExecution!(interrupted);
    expect(projected.pendingActionSceneContext?.contextsByLocation.school.forbiddenNpcIds)
      .toEqual(['liu-renguang']);
  });
  it('keeps full state snapshots and callbacks outside both model prompt contexts', () => {
    const prepared = buildTurnPreparation(fixture());
    expect(prepared.request.actionAuthority?.currentLocationId).toBe('home');
    expect(prepared.request.actionAuthority?.startTime).toBe('2024-09-09T15:55:00');
    expect(JSON.stringify(prepared.request.turnContext)).not.toContain('projectionSnapshot');
    expect(JSON.stringify(prepared.request.presentationContext)).not.toContain('projectionSnapshot');
  });

  it('restores the original exterior school contract before resumed Director review', () => {
    const input = fixture();
    const pending = buildPendingActionSceneContext(input.userInput, input.gameStatus.time, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1, schoolEncounterRoll: 0,
    });
    input.userInput = '继续未完成的调查';
    input.variables.time = '2024-09-09T16:00:00';
    input.variables.deathNews = 'delivered';
    input.gameStatus.time = new Date('2024-09-09T16:00:00');
    input.variables.actionContinuity = {
      cycleCount: 1,
      continuation: {
        actionId: 'school-investigation', cycleCount: 1,
        steps: [
          { id: '__travel__:0:home:school:work%3A0', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
          { id: 'work:0', kind: 'investigation', scope: 'normal', locationId: 'school', completionSourceIds: [] },
        ],
        previousResolutionId: 'first', stepsDigest: 'steps-original', resumableFromTime: '2024-09-09T16:00:00',
        expectedLocationId: 'home', activeStepId: '__travel__:0:home:school:work%3A0',
        completedMinutesByStep: { '__travel__:0:home:school:work%3A0': 5 },
        chargedStaminaByStep: { '__travel__:0:home:school:work%3A0': 2 },
      },
      sceneContext: { ...pending, actionId: 'school-investigation' },
    };

    const prepared = buildTurnPreparation({ ...input, resumeActionId: 'school-investigation' });
    expect(prepared.request.truthContext.sceneContract).toMatchObject({
      destinationLocationId: 'school', entryMode: 'exterior',
      requiredDestinationNpcIds: ['school-guard'], forbiddenNpcIds: ['liu-renguang'],
    });
    expect(prepared.request.pendingActionSceneContext?.contextsByLocation.school.forbiddenNpcIds)
      .toEqual(['liu-renguang']);
  });

  it('keeps the street presentation for an intervening zero-time event during partial travel', () => {
    const input = fixture();
    const pending = buildPendingActionSceneContext(input.userInput, input.gameStatus.time, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1,
    });
    input.variables.time = '2024-09-09T16:00:00';
    input.variables.deathNews = 'pending';
    input.gameStatus.time = new Date('2024-09-09T16:00:00');
    input.variables.actionContinuity = {
      cycleCount: 1,
      continuation: {
        actionId: 'school-investigation', cycleCount: 1,
        steps: [
          { id: '__travel__:0:home:school:work%3A0', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
          { id: 'work:0', kind: 'investigation', scope: 'normal', locationId: 'school', completionSourceIds: [] },
        ], previousResolutionId: 'first', stepsDigest: 'steps-original', resumableFromTime: '2024-09-09T16:00:00',
        expectedLocationId: 'home', activeStepId: '__travel__:0:home:school:work%3A0',
        completedMinutesByStep: { '__travel__:0:home:school:work%3A0': 5 },
        chargedStaminaByStep: { '__travel__:0:home:school:work%3A0': 2 },
      },
      sceneContext: { ...pending, actionId: 'school-investigation' },
    };
    const event: ResolvedActionOutcome = {
      id: 'event', cycleCount: 1, startTime: '2024-09-09T16:00:00', endTime: '2024-09-09T16:00:00',
      startLocationId: 'home', endLocationId: 'home', plannedMinutes: 0, executedMinutes: 0,
      segments: [{ step: { id: 'death-news', kind: 'event', eventId: 'death-news', scope: 'normal', locationId: 'home', completionSourceIds: [] },
        plannedMinutes: 0, executedMinutes: 0, cumulativeExecutedMinutes: 0, staminaDelta: 0, completed: true }],
      resources: { before: { stamina: 99, sanity: 70 }, after: { stamina: 99, sanity: 58 } },
      completedSourceIds: [], eventEffectIds: ['death-news:cycle:1'],
    };

    const projected = buildTurnPreparation(input).request.projectExecution!(event);
    expect(projected.presentationContext.currentBackground).toBe('street');
    expect(projected.actionNarrativeContext).toBeNull();
    expect(projected.activeNpcIds).toEqual([]);
  });

  it('maps completed compound work participants while withholding every scene contract in transit', () => {
    const input = fixture();
    input.userInput = '先调查便利店，再去学校调查';
    input.originalActionInput = input.userInput;
    input.variables.location = 'supermarket';
    input.variables.time = '2024-09-09T15:00:00';
    input.gameStatus.time = new Date('2024-09-09T15:00:00');
    input.currentState.background = 'supermarket-day';
    const compound: ResolvedActionOutcome = {
      id: 'compound', cycleCount: 1, startTime: '2024-09-09T15:00:00', endTime: '2024-09-09T16:00:00',
      startLocationId: 'supermarket', endLocationId: 'supermarket', plannedMinutes: 120, executedMinutes: 60,
      segments: [
        { step: { id: 'store', kind: 'investigation', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] },
          plannedMinutes: 55, executedMinutes: 55, cumulativeExecutedMinutes: 55, staminaDelta: -7, completed: true },
        { step: { id: '__travel__:1:supermarket:school:school', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
          plannedMinutes: 10, executedMinutes: 5, cumulativeExecutedMinutes: 5, staminaDelta: -2, completed: false },
      ],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 91, sanity: 70 } },
      completedSourceIds: [], eventEffectIds: [], interruption: { id: 'death-news', at: '2024-09-09T16:00:00' },
    };

    const projected = buildTurnPreparation(input).request.projectExecution!(compound);
    expect(projected.actionNarrativeContext).toBeNull();
    expect(projected.presentationContext.currentBackground).toBe('street');
    expect(projected.activeNpcIds).toEqual([]);
    expect(projected.segmentNpcIdsByLocation).toEqual({ supermarket: ['chen-huihui'] });
    expect(projected.pendingActionSceneContext?.contextsByLocation.school.forbiddenNpcIds)
      .toEqual(['liu-renguang']);
  });
});
