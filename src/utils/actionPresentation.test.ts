import { describe, expect, it } from 'vitest';
import { resolveAction } from '../engine/action-resolution';
import {
  projectPublicActionOutcome,
  resolveChecklistAction,
  buildActionOptionBindings,
  validatedOptionBinding,
  acceptedActionUiFromMessage,
  type ChecklistActionRow,
} from './actionPresentation';

const normalSchoolInvestigation: ChecklistActionRow = {
  desc: '前往学校询问门卫',
  time: '2分钟',
  stamina: 0,
  sanity: 0,
  actionId: 'school-guard-inquiry',
  opportunityId: 'shared-school-absence',
  kind: 'inquiry',
  scope: 'normal',
  locationId: 'school',
};

describe('ordinary narrative option identity', () => {
  it('binds the displayed destination before selection and preserves it on reload', () => {
    const options = ['前往旧街区向周大爷打听清晨动静', '在这里休息一会儿'];
    const bindings = buildActionOptionBindings(options, 'senpai-building', new Date('2024-09-09T14:10:00'), 'scene-1');
    expect(bindings[0]).toMatchObject({ optionIndex: 0, optionText: options[0], actionId: 'scene-1:option:0',
      playerActionIntent: { originalInput: options[0], startLocationId: 'senpai-building',
        steps: [expect.objectContaining({ locationId: 'old-man-building' })] } });
    expect(bindings[1].playerActionIntent?.steps).toEqual([expect.objectContaining({ kind: 'rest', locationId: 'senpai-building' })]);
    expect(acceptedActionUiFromMessage({ parsed: { options, optionBindings: bindings }, variables: {} } as never, options).optionBindings)
      .toEqual(bindings);
    expect(validatedOptionBinding(bindings[0], 0, '留在商住楼')).toBeUndefined();
    const tampered = structuredClone(bindings[0]);
    tampered.playerActionIntent!.steps[0].locationId = 'home';
    expect(validatedOptionBinding(tampered, 0, options[0])).toBeUndefined();
  });

  it('does not silently downgrade an invalid persisted intent into a free-text option', () => {
    const options = ['前往中学询问门卫'];
    const broken = { optionIndex: 0, optionText: options[0], actionId: 'scene:option:0', playerActionIntent: { version: 999 } };
    const restored = acceptedActionUiFromMessage({ parsed: { options, optionBindings: [broken] }, variables: {} } as never, options);
    expect(restored.optionBindings).toEqual([{ optionIndex: 0, optionText: options[0], unavailable: true }]);
  });

  it('rejects an unresolved travel option rather than binding the current location', () => {
    expect(() => buildActionOptionBindings(['前往完全未知的地方调查'], 'home', new Date('2024-09-09T08:00:00'), 's'))
      .toThrow(/目的地|行动|选项/);
  });
});

describe('resolveChecklistAction', () => {
  it('quotes a normal investigation plus the actual home-to-school leg from program metadata', () => {
    const action = resolveChecklistAction(normalSchoolInvestigation, {
      sceneId: 'morning', itemIndex: 0, type: 'investigate', currentLocationId: 'home',
    });

    expect(action.quote).toEqual({ workMinutes: 55, travelMinutes: 10, totalMinutes: 65, staminaCost: 11 });
    expect(action.selection).toMatchObject({
      actionId: 'school-guard-inquiry', opportunityId: 'shared-school-absence',
      kind: 'inquiry', scope: 'normal', locationId: 'school',
    });
  });

  it('quotes the same normal investigation as 55 minutes at its destination', () => {
    expect(resolveChecklistAction(normalSchoolInvestigation, {
      sceneId: 'school', itemIndex: 0, type: 'investigate', currentLocationId: 'school',
    }).quote).toEqual({ workMinutes: 55, travelMinutes: 0, totalMinutes: 55, staminaCost: 7 });
  });

  it('migrates an authored legacy inquiry without treating its old display time as authority', () => {
    const action = resolveChecklistAction({
      desc: '前往中学确认文穗的请假情况', time: '15分钟', stamina: 10, sanity: 0,
    }, {
      sceneId: 'opening', itemIndex: 0, type: 'act', currentLocationId: 'home',
    });

    expect(action.selection).toEqual({
      actionId: 'legacy:opening:act:0',
      kind: 'inquiry', scope: 'normal', locationId: 'school',
    });
    expect(action.quote).toEqual({ workMinutes: 55, travelMinutes: 10, totalMinutes: 65, staminaCost: 11 });
  });

  it('requires program-authored duration for rest and wait instead of trusting model display time', () => {
    expect(() => resolveChecklistAction({
      desc: '休息一会儿', time: '60分钟', stamina: -12, sanity: 0,
      actionId: 'rest', kind: 'rest', scope: 'normal', locationId: 'home',
    }, {
      sceneId: 'home', itemIndex: 0, type: 'act', currentLocationId: 'home',
    })).toThrow(/requestedMinutes/);
  });
});

describe('projectPublicActionOutcome', () => {
  it('shows exact executed work, travel, remaining quote and resume identity without private sources', () => {
    const resolved = resolveAction({
      id: 'school-deep-search',
      cycleCount: 3,
      startTime: '2024-09-09T15:30:00',
      currentLocationId: 'school',
      stamina: 100,
      sanity: 70,
      steps: [{
        id: 'search', kind: 'search', scope: 'deep', locationId: 'school',
        completionSourceIds: ['fact:private-result'],
      }],
      nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' },
    });

    const projected = projectPublicActionOutcome(resolved);

    expect(projected).toEqual({
      resolutionId: resolved.id,
      actionId: 'school-deep-search',
      executedMinutes: 30,
      executedWorkMinutes: 30,
      executedTravelMinutes: 0,
      endTime: '2024-09-09T16:00:00',
      staminaDelta: -7,
      sanityDelta: 0,
      interruption: { id: 'death-news', at: '2024-09-09T16:00:00' },
      remaining: {
        workMinutes: 75, travelMinutes: 0, totalMinutes: 75, staminaCost: 17,
        continuationId: 'school-deep-search',
      },
    });
    expect(projected).not.toHaveProperty('completedSourceIds');
    expect(projected).not.toHaveProperty('steps');
  });

  it('keeps rest recovery signed as a gain', () => {
    const resolved = resolveAction({
      id: 'rest-hour', cycleCount: 1, startTime: '2024-09-09T09:00:00', currentLocationId: 'home',
      stamina: 80, sanity: 70,
      steps: [{ id: 'rest', kind: 'rest', scope: 'normal', locationId: 'home', requestedMinutes: 60, completionSourceIds: [] }],
    });

    expect(projectPublicActionOutcome(resolved).staminaDelta).toBe(12);
  });
});
