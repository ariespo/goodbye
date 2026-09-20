import { describe, expect, it } from 'vitest';
import { buildTurnPreparation, preparationContextKey, type TurnPreparationInput } from './turn-preparation';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatMessage } from '../../sillytavern/types';
import { resolveAction, type ResolvedActionOutcome } from '../../engine/action-resolution';
import { buildPendingActionSceneContext } from '../../engine/action-scene-continuity';
import { resolveActionNarrativeContext } from '../../engine/action-narrative-context';
import { prepareMysteryTurn } from './orchestrator';
import { buildActionAuthorityInput } from './action-authority';
import {
  buildCharacterContinuityCandidateEvidence,
  validateCharacterContinuityAudit,
} from '../../memory/character-continuity';
import { buildTurnCommit, normalizeWorldMemory } from '../../memory/world-memory';

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
  it('keeps the same summary projection when actual execution recalculates time and location', () => {
    const input = fixture();
    input.settings.contextCompressionThresholdTokens = 2000;
    input.history = Array.from({ length: 5 }, (_, index) => ({
      id: `old-${index}`, role: 'assistant', timestamp: index, variables: { cycleCount: 1 },
      content: `<maintext>对话|旁白|calm|原文细节${index}${'雨'.repeat(800)}</maintext><sum>第${index}段：玩家在公寓查看纸条。</sum>`,
    }));
    const prepared = buildTurnPreparation(input);
    const execution = prepared.request.projectExecution!(interrupted);
    expect(execution.turnContext.recentHistory).toEqual(prepared.request.turnContext.recentHistory);
    expect(execution.presentationContext.recentHistory).toEqual(prepared.request.presentationContext.recentHistory);
    expect(JSON.stringify(execution.presentationContext.recentHistory)).not.toContain('原文细节0');
    expect(JSON.stringify(execution.presentationContext.recentHistory)).toContain('原文细节4');
    expect(execution.contextBundle.compression?.compressedMessageIds).toHaveLength(3);
  });

  it('keeps canonical continuity bindings out of the full Writer payload while retaining public cognition text', async () => {
    const narrative = [
      '对话|玩家|calm|收据显示文穗买过牛奶。',
      '对话|门卫|calm|我听见了。',
      '对话|玩家|calm|我相信文穗买过牛奶。',
    ].join('\n');
    const acceptedScene = {
      id: 'accepted',
      lines: [
        { id: 'accepted:0', speaker: '玩家', text: '收据显示文穗买过牛奶。' },
        { id: 'accepted:1', speaker: '门卫', text: '我听见了。' },
        { id: 'accepted:2', speaker: '玩家', text: '我相信文穗买过牛奶。' },
      ],
    };
    const source = {
      id: 'fact:F001:clue', kind: 'fact' as const, text: '收据显示文穗买过牛奶。', factId: 'F001', level: 'clue' as const,
    };
    const evidence = buildCharacterContinuityCandidateEvidence({
      candidateText: narrative,
      scene: acceptedScene,
      assertionAudit: { reviewedFields: ['maintext'], assertions: [{
        field: 'maintext', quote: '收据显示文穗买过牛奶', proposition: '文穗买过牛奶', status: 'supported',
        citations: [{ sourceId: source.id, quote: '收据显示文穗买过牛奶' }], reason: '收据支持',
      }] },
      assertionSources: [source], possibleAudienceIds: ['school-guard'], resolvedEndTime: '2024-09-09T09:00:00',
      canonicalPropositionBySourceId: { [source.id]: 'fact:private-canonical-receipt' },
    });
    const validation = validateCharacterContinuityAudit({
      audit: { reviewed: true, disclosures: [{
        assertionIndex: 0, lineIndex: 0, quote: '收据显示文穗买过牛奶', listenerIds: ['school-guard'],
        audienceEvidence: [{ lineIndex: 1, quote: '我听见了' }],
      }], beliefs: [{
        assertionIndex: 0, observerId: 'player', status: 'believed',
        evidence: [{ lineIndex: 2, quote: '我相信文穗买过牛奶' }],
      }], commitments: [] },
      evidence, memory: normalizeWorldMemory({ cycleCount: 1 }), cycleCount: 1,
    });
    expect(validation.approved).toBe(true);
    const commit = buildTurnCommit({
      turnId: 'private-binding', turnIndex: 1, createdAt: 1, occurredAt: '2024-09-09T09:00:00',
      locationId: 'school', cycleCount: 1, summary: '玩家向门卫提到收据。', scene: acceptedScene,
      beforeVariables: { cycleCount: 1 }, settledVariables: { cycleCount: 1 },
      narrativeText: narrative, continuityEffects: validation.effects,
    });
    const input = fixture();
    input.userInput = '继续询问门卫';
    input.variables = {
      ...input.variables, cycleCount: 1, location: 'school', time: '2024-09-09T09:00:00',
      worldMemory: commit.worldMemory,
    };
    input.gameStatus.time = new Date('2024-09-09T09:00:00');
    input.currentState = { ...input.currentState, background: 'school-day' };
    const preparation = buildTurnPreparation(input);
    const prepared = await prepareMysteryTurn({
      ...preparation.request,
      complete: async messages => messages[0].content.includes('事实复核')
        || messages[0].content.includes('节奏与玩家能动性')
        ? JSON.stringify({ approved: true, violations: [], corrections: [] })
        : JSON.stringify({
            turnGoal: '继续询问门卫', tone: '克制', timeCostMinutes: 1,
            beats: [{ id: 'b', purpose: '回应', description: '门卫继续回应玩家。',
              locationId: 'school', speakerIds: ['school-guard'],
              sourceMemoryIds: ['school-guard|fact:private-canonical-receipt'] }],
            revelations: [], assetRequests: [], optionIntents: [
              { id: 'o1', intent: '继续询问', tone: '克制', expectedPressure: 'low' },
              { id: 'o2', intent: '离开学校', tone: '克制', expectedPressure: 'low' },
            ],
          }),
    });
    const writerPayload = JSON.stringify(prepared.writerMessages);

    expect(writerPayload).toContain('school-guard 听到 player 陈述：文穗买过牛奶');
    expect(writerPayload).toContain('heard');
    expect(writerPayload).toContain('believed');
    expect(writerPayload).toContain('收据显示文穗买过牛奶');
    expect(writerPayload).not.toContain('fact:private-canonical-receipt');
    expect(writerPayload).not.toContain('school-guard|fact:private-canonical-receipt');
    expect(writerPayload).not.toContain('propositionId');
  });

  it('keeps the legal source map private while projecting only public opportunity fields', () => {
    const prepared = buildTurnPreparation(fixture());
    const id = 'investigation:c1:F001:clue:home';

    expect(prepared.request.legalOpportunityMap?.[id]?.sourceIds).toEqual(['fact:F001:clue']);
    expect(prepared.request.turnContext.publicOpportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, locationId: 'home', publicGoal: '检查文穗留下的衣物和随身物品' }),
    ]));
    expect(prepared.request.turnContext.opportunityPolicy).toContain(id);
    expect(JSON.stringify(prepared.request.turnContext)).not.toContain('sourceIds');
    expect(JSON.stringify(prepared.request.presentationContext)).not.toContain('topicKey');
  });

  it('revalidates an exhausted same-cycle opportunity by exact id but rejects an unknown id', () => {
    const input = fixture();
    const id = 'investigation:c1:F001:clue:home';
    input.variables.opportunityProgress = {
      cycleCount: 1,
      completedIds: [id],
      noProgressByTopic: { 'home:belongings': 2 },
      settledResolutionIds: ['old'],
    };
    input.actionSelection = { opportunityId: id, kind: 'investigation', scope: 'short', locationId: 'home' };

    expect(buildTurnPreparation(input).request.actionAuthority?.selectedOpportunity?.id).toBe(id);
    expect(() => buildTurnPreparation({
      ...input,
      actionSelection: { ...input.actionSelection, opportunityId: 'investigation:c0:stale' },
    })).toThrow(/机会|opportunity|失效/i);
  });

  it('binds a trusted menu opportunity destination before preparing its scene and fact context', () => {
    const input = fixture();
    input.userInput = '[系统] 玩家选择了一项调查';
    input.originalActionInput = '向门卫确认文穗今天是否到校';
    input.hasPendingAction = true;
    input.actionSelection = {
      opportunityId: 'investigation:c1:F002:clue:school',
      kind: 'investigation',
      scope: 'normal',
      locationId: 'school',
    };

    const prepared = buildTurnPreparation(input);

    expect(prepared.request.actionAuthority?.selectedOpportunity?.sourceIds)
      .toEqual(['fact:F002:clue']);
    expect(prepared.request.truthContext).toMatchObject({
      currentLocation: 'school',
      sceneContract: {
        destinationLocationId: 'school',
        requiredDestinationNpcIds: ['school-guard'],
      },
    });
    expect(prepared.request.pendingActionSceneContext?.contextsByLocation.school)
      .toMatchObject({ locationId: 'school' });
  });
  it('revalidates a generated travel menu against the pre-action location', () => {
    const input = fixture();
    input.userInput = '[系统] 玩家执行了行动："前往玩家公寓"';
    input.originalActionInput = '前往玩家公寓';
    input.hasPendingAction = true;
    input.variables.location = 'school';
    input.variables.mysteryKnowledge = {
      'shared-apron-missing': 'clue', 'shared-school-absence': 'clue', 'red-herring-part-time-job': 'hint',
    };
    input.variables.opportunityProgress = {
      cycleCount: 1,
      completedIds: [
        'investigation:c1:F001:clue:home',
        'investigation:c1:F002:clue:school',
        'investigation:c1:F007:hint:supermarket',
      ],
      noProgressByTopic: {},
      settledResolutionIds: ['prior-school-inquiry'],
    };
    input.gameStatus.time = new Date('2024-09-09T10:00:00');
    input.variables.time = '2024-09-09T10:00:00';
    input.currentState.background = 'school-day';
    input.actionSelection = {
      actionId: 'program:travel:home', kind: 'travel', scope: 'normal', locationId: 'home',
    };
    input.pendingNarrativeContext = resolveActionNarrativeContext('前往玩家公寓', input.gameStatus.time, 0, {
      currentLocationId: 'school', cycleCount: 1, destinationLocationId: 'home', enRouteEncounterRoll: 1,
    });

    const prepared = buildTurnPreparation(input);
    const authority = prepared.request.actionAuthority!;
    const resolved = resolveAction(buildActionAuthorityInput({
      turnGoal: '回家', tone: '克制', beats: [], revelations: [], assetRequests: [], optionIntents: [],
    }, authority, 'travel-home'));

    expect(authority.currentLocationId).toBe('school');
    expect(authority.selectedProgramAction).toMatchObject({
      id: 'program:travel:home', kind: 'travel', locationId: 'home',
    });
    expect(resolved.segments).toHaveLength(1);
    expect(resolved.segments[0]).toMatchObject({
      step: { kind: 'travel', locationId: 'home' }, executedMinutes: 10, staminaDelta: -4,
    });
  });
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
          { id: 'work:0', kind: 'investigation', scope: 'normal', locationId: 'school',
            opportunityId: 'investigation:c1:F002:clue:school', completionSourceIds: [] },
        ],
        previousResolutionId: 'first', stepsDigest: 'steps-original', resumableFromTime: '2024-09-09T16:00:00',
        expectedLocationId: 'home', activeStepId: '__travel__:0:home:school:work%3A0',
        completedMinutesByStep: { '__travel__:0:home:school:work%3A0': 5 },
        chargedStaminaByStep: { '__travel__:0:home:school:work%3A0': 2 },
      },
      sceneContext: { ...pending, actionId: 'school-investigation' },
      selectedOpportunity: {
        id: 'investigation:c1:F002:clue:school', locationId: 'school',
        publicGoal: '向门卫确认文穗今天是否到校', scope: 'normal',
        sourceIds: ['fact:F002:clue'], topicKey: 'school:attendance',
      },
    };

    const prepared = buildTurnPreparation({ ...input, resumeActionId: 'school-investigation' });
    expect(prepared.request.truthContext.sceneContract).toMatchObject({
      destinationLocationId: 'school', entryMode: 'exterior',
      requiredDestinationNpcIds: ['school-guard'], forbiddenNpcIds: ['liu-renguang'],
    });
    expect(prepared.request.pendingActionSceneContext?.contextsByLocation.school.forbiddenNpcIds)
      .toEqual(['liu-renguang']);
    expect(prepared.request.actionAuthority?.selectedOpportunity?.id)
      .toBe('investigation:c1:F002:clue:school');
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

  it('does not apply an abandoned partial route to a new completed destination travel', () => {
    const input = fixture();
    const pending = buildPendingActionSceneContext(input.userInput, input.gameStatus.time, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1,
    });
    input.userInput = '前往便利店';
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
        ], previousResolutionId: 'first', stepsDigest: 'steps-original', resumableFromTime: '2024-09-09T16:00:00',
        expectedLocationId: 'home', activeStepId: '__travel__:0:home:school:work%3A0',
        completedMinutesByStep: { '__travel__:0:home:school:work%3A0': 5 },
        chargedStaminaByStep: { '__travel__:0:home:school:work%3A0': 2 },
      },
      sceneContext: { ...pending, actionId: 'school-investigation' },
    };
    const completedTravel: ResolvedActionOutcome = {
      id: 'new-market-travel', cycleCount: 1,
      startTime: '2024-09-09T16:00:00', endTime: '2024-09-09T16:15:00',
      startLocationId: 'home', endLocationId: 'supermarket', plannedMinutes: 15, executedMinutes: 15,
      segments: [{
        step: { id: '__travel__:0:home:supermarket:move', kind: 'travel', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] },
        plannedMinutes: 15, executedMinutes: 15, cumulativeExecutedMinutes: 15, staminaDelta: -5, completed: true,
      }],
      resources: { before: { stamina: 99, sanity: 58 }, after: { stamina: 94, sanity: 58 } },
      completedSourceIds: [], eventEffectIds: [],
    };

    const projected = buildTurnPreparation(input).request.projectExecution!(completedTravel);
    expect(projected.mysteryLocation).toBe('supermarket');
    expect(projected.presentationContext.currentBackground).toBe('supermarket-day');
    expect(projected.narrativeBackground).toBe('supermarket-day');
  });

  it('projects a resumed pure-travel continuation at its completed destination', () => {
    const input = fixture();
    const pending = buildPendingActionSceneContext(input.userInput, input.gameStatus.time, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1,
    });
    input.userInput = '继续未完成的行程';
    input.variables.time = '2024-09-09T16:00:00';
    input.gameStatus.time = new Date('2024-09-09T16:00:00');
    input.variables.actionContinuity = {
      cycleCount: 1,
      continuation: {
        actionId: 'school-travel', cycleCount: 1,
        steps: [{ id: '__travel__:0:home:school:move', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] }],
        previousResolutionId: 'first', stepsDigest: 'steps-original', resumableFromTime: '2024-09-09T16:00:00',
        expectedLocationId: 'home', activeStepId: '__travel__:0:home:school:move',
        completedMinutesByStep: { '__travel__:0:home:school:move': 5 },
        chargedStaminaByStep: { '__travel__:0:home:school:move': 2 },
      },
      sceneContext: { ...pending, actionId: 'school-travel' },
    };
    const completedTravel: ResolvedActionOutcome = {
      id: 'school-travel', cycleCount: 1,
      startTime: '2024-09-09T16:00:00', endTime: '2024-09-09T16:10:00',
      startLocationId: 'home', endLocationId: 'school', plannedMinutes: 10, executedMinutes: 10,
      segments: [{
        step: { id: '__travel__:0:home:school:move', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
        plannedMinutes: 15, executedMinutes: 10, cumulativeExecutedMinutes: 15, staminaDelta: -3, completed: true,
      }],
      resources: { before: { stamina: 99, sanity: 58 }, after: { stamina: 96, sanity: 58 } },
      completedSourceIds: [], eventEffectIds: [],
    };

    const projected = buildTurnPreparation({ ...input, resumeActionId: 'school-travel' })
      .request.projectExecution!(completedTravel);
    expect(projected.mysteryLocation).toBe('school');
    expect(projected.presentationContext.currentBackground).toBe('school-day');
    expect(projected.narrativeBackground).toBe('school-day');
  });

  it('keeps a same-anchor wait on the street while partial travel is retained', () => {
    const input = fixture();
    const pending = buildPendingActionSceneContext(input.userInput, input.gameStatus.time, {
      currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1,
    });
    input.userInput = '原地等待半小时';
    input.variables.time = '2024-09-09T16:00:00';
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
    const wait: ResolvedActionOutcome = {
      id: 'wait', cycleCount: 1,
      startTime: '2024-09-09T16:00:00', endTime: '2024-09-09T16:30:00',
      startLocationId: 'home', endLocationId: 'home', plannedMinutes: 30, executedMinutes: 30,
      segments: [{
        step: { id: 'wait', kind: 'wait', scope: 'normal', locationId: 'home', completionSourceIds: [], requestedMinutes: 30 },
        plannedMinutes: 30, executedMinutes: 30, cumulativeExecutedMinutes: 30, staminaDelta: 0, completed: true,
      }],
      resources: { before: { stamina: 99, sanity: 58 }, after: { stamina: 99, sanity: 58 } },
      completedSourceIds: [], eventEffectIds: [],
    };

    const projected = buildTurnPreparation(input).request.projectExecution!(wait);
    expect(projected.mysteryLocation).toBe('home');
    expect(projected.presentationContext.currentBackground).toBe('street');
    expect(projected.actionNarrativeContext).toBeNull();
  });

  it('retains executed work contracts while withholding the unreached destination in transit', () => {
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
    expect(projected.truthContext.sceneContracts?.map(contract => contract.destinationLocationId)).toEqual(['supermarket']);
    expect(projected.executedActionContexts?.map(context => context.locationId)).toEqual(['supermarket']);
    expect(projected.pendingActionSceneContext?.contextsByLocation.school.forbiddenNpcIds)
      .toEqual(['liu-renguang']);
  });

  it('projects travel-only arrival without destination reception or recognition work', () => {
    const input = fixture();
    input.userInput = '去便利店';
    const prepared = buildTurnPreparation(input);
    prepared.request.prepareActionScenes!([{ id: 'move', kind: 'travel', scope: 'normal', locationId: 'supermarket' }]);
    const travel = { ...interrupted, endLocationId: 'supermarket', executedMinutes: 15,
      segments: [{ ...interrupted.segments[0], completed: true, executedMinutes: 15,
        step: { ...interrupted.segments[0].step, locationId: 'supermarket' } }] };
    const projected = prepared.request.projectExecution!(travel);
    expect(projected.truthContext.sceneContracts).toEqual([expect.objectContaining({ destinationLocationId: 'supermarket',
      requiredDestinationNpcIds: [], requiredKnowledgeEvents: [] })]);
    expect(projected.executedActionContexts).toEqual([]);
    expect(projected.actionNarrativeContext).toBeNull();
  });
});
