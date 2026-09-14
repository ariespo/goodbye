import { describe, expect, it } from 'vitest';
import type { ActionContinuation } from './action-resolution';
import {
  buildPendingActionSceneContext,
  selectContinuationSceneContext,
  type ActionSceneContinuity,
} from './action-scene-continuity';

const continuation: ActionContinuation = {
  actionId: 'school-investigation',
  cycleCount: 1,
  steps: [
    { id: '__travel__:0:home:school:work%3A0', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
    { id: 'work:0', kind: 'investigation', scope: 'normal', locationId: 'school', completionSourceIds: [] },
  ],
  previousResolutionId: 'first',
  stepsDigest: 'steps-original',
  resumableFromTime: '2024-09-09T16:00:00',
  expectedLocationId: 'home',
  activeStepId: '__travel__:0:home:school:work%3A0',
  completedMinutesByStep: { '__travel__:0:home:school:work%3A0': 5 },
  chargedStaminaByStep: { '__travel__:0:home:school:work%3A0': 2 },
};

describe('program-owned action scene continuity', () => {
  it('builds a separate original scene contract for every compound destination', () => {
    const pending = buildPendingActionSceneContext(
      '先调查便利店，再去学校调查',
      new Date('2024-09-09T15:00:00'),
      { currentLocationId: 'supermarket', cycleCount: 1, enRouteEncounterRoll: 1, schoolEncounterRoll: 0 },
    );

    expect(Object.keys(pending.contextsByLocation)).toEqual(['supermarket', 'school']);
    expect(pending.contextsByLocation.supermarket.requiredNpcIds).toEqual(['chen-huihui']);
    expect(pending.contextsByLocation.school).toMatchObject({
      locationId: 'school',
      entryMode: 'exterior',
      requiredNpcIds: ['school-guard'],
      forbiddenNpcIds: ['liu-renguang'],
    });
  });

  it('selects the original destination contract from the active continuation step', () => {
    const original = buildPendingActionSceneContext(
      '前往学校调查文穗的情况',
      new Date('2024-09-09T15:55:00'),
      { currentLocationId: 'home', cycleCount: 1, enRouteEncounterRoll: 1, schoolEncounterRoll: 0 },
    );
    const saved: ActionSceneContinuity = { ...original, actionId: continuation.actionId };

    expect(selectContinuationSceneContext(saved, continuation)).toMatchObject({
      locationId: 'school',
      entryMode: 'exterior',
      requiredNpcIds: ['school-guard'],
      forbiddenNpcIds: ['liu-renguang'],
    });
    expect(selectContinuationSceneContext({ ...saved, actionId: 'other' }, continuation)).toBeNull();
  });

  it('keeps an empty context map valid for same-place work without an explicit destination', () => {
    expect(buildPendingActionSceneContext(
      '继续仔细调查房间',
      new Date('2024-09-09T08:00:00'),
      { currentLocationId: 'home', cycleCount: 1 },
    )).toEqual({ cycleCount: 1, contextsByLocation: {} });
  });
});
