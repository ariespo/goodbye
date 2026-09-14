import { describe, expect, it } from 'vitest';
import type { Scene } from '../sillytavern/types';
import {
  actionNarrativeContextError,
  applyActionNarrativeKnowledgeFallback,
  resolveExecutedActionNarrativeContext,
  resolveActionNarrativeContext,
} from './action-narrative-context';
import { resolveAction } from './action-resolution';

const morning = new Date('2025-09-09T08:00:00');

describe('action narrative context semantic planning', () => {
  it.each([
    ['离开便利店，前往对面商住楼找灯织', 'senpai-building'],
    ['从学校走到社区医院问问护士', 'community-hospital'],
    ['前往文穗的中学向门卫打听情况', 'school'],
    ['不去便利店，改去学校找门卫', 'school'],
    ['去医院问问学校的情况', 'community-hospital'],
    ['回家休息一段时间', 'home'],
  ])('binds the destination to the actual movement: %s', (input, destination) => {
    const context = resolveActionNarrativeContext(input, morning, 0, {
      currentLocationId: 'street', enRouteEncounterRoll: 1,
    });
    expect(context?.locationId).toBe(destination);
    expect(context?.costs.timeMinutes).toBeGreaterThan(0);
  });

  it.each([
    '我想核实学校现在能够告诉家属的情况，请告诉我接下来应该去哪里找她',
    '查看便利店的小票，寻找学校的联系电话',
    '我想问问灯织，要不要去学校？',
    '请告诉我怎么去医院',
    '暂时不要回家，留在这里等消息',
    '我没有去学校，只是在便利店门口等人',
    '想起昨天去学校找她的事',
    '和门卫谈到学校最近发生的事情',
    '问她是否见到灯织',
    '听到医院传来的消息后，先留在原地',
  ])('leaves questions, mentions and rejected movement to the director: %s', input => {
    expect(resolveActionNarrativeContext(input, morning)).toBeNull();
  });

  it.each(['如果暂时没有可做的事，就回家休息一段时间', '回到家里休息一段时间'])('leaves rest duration to the director: %s', input => {
    const context = resolveActionNarrativeContext(input, morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 0,
    });
    expect(context?.locationId).toBe('home');
    expect(context?.costs.timeMinutes).toBeUndefined();
    expect(context?.costs.stamina ?? 0).toBe(0);
    expect(context?.enRouteNpcIds).toEqual([]);
  });

  it('preserves an explicit action duration while already at the destination', () => {
    const context = resolveActionNarrativeContext('回家休息一段时间', morning, 30, {
      currentLocationId: 'home',
    });
    expect(context?.costs.timeMinutes).toBe(30);
    expect(context?.costs.stamina).toBeUndefined();
  });

  it('stages Huihui as clerk, recognition narration, archive event, then her known name', () => {
    const context = resolveActionNarrativeContext(
      '去便利店打听文穗早上的行踪',
      morning,
      10,
      { currentLocationId: 'home', enRouteEncounterRoll: 1 },
    );
    expect(context).toMatchObject({
      locationId: 'supermarket',
      background: 'supermarket-day',
      requiredNpcIds: ['chen-huihui'],
      enRouteNpcIds: [],
    });
    expect(context?.sceneContract.requiredDestinationNpcIds).toEqual(['chen-huihui']);
    expect(context?.sceneContract.requiredKnowledgeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: 'meet:chen-huihui' }),
    ]));
    expect(context?.directive).toContain('首个显示称呼固定写“店员”');
    expect(actionNarrativeContextError(context, {
      lines: [{ background: 'supermarket-day', speaker: '店员', character: 'chen-huihui-normal.png', text: '欢迎光临。', emotion: 'calm' }],
    })).toContain('结巴');
    expect(actionNarrativeContextError(context, {
      lines: [{ background: 'supermarket-day', speaker: '陈慧慧', character: 'chen-huihui-normal.png', text: '欢、欢迎光临。', emotion: 'calm' }],
    })).toContain('先以“店员”');
    expect(actionNarrativeContextError(context, {
      lines: [
        { background: 'supermarket-day', speaker: '店员', character: 'chen-huihui-normal.png', text: '欢、欢迎光临……吃、吃吃。', emotion: 'calm' },
        { background: 'supermarket-day', speaker: '旁白', text: '这是附近便利店的店员陈慧慧。她总是紧张兮兮的，笑得很不自然，看起来有些奇怪。', emotion: 'calm', knowledgeEvents: ['meet:chen-huihui'] },
        { background: 'supermarket-day', speaker: '陈慧慧', character: 'chen-huihui-normal.png', text: '今、今天想找什么？', emotion: 'calm' },
      ],
    })).toBeNull();
  });

  it('recovers Huihui archive knowledge when the narration is complete but the LLM omits the command', () => {
    const context = resolveActionNarrativeContext(
      '去便利店找陈慧慧问话',
      morning,
      10,
      { currentLocationId: 'home', enRouteEncounterRoll: 1 },
    );
    const scene: Pick<Scene, 'lines'> = {
      lines: [
        { background: 'supermarket-day', speaker: '店员', character: 'chen-huihui-normal.png', text: '欢、欢迎光临……吃、吃吃。', emotion: 'calm' as const },
        { background: 'supermarket-day', speaker: '旁白', text: '这是附近便利店的店员陈慧慧。她总是紧张兮兮的，笑得很不自然，看起来有些奇怪。', emotion: 'calm' as const },
        { background: 'supermarket-day', speaker: '陈慧慧', character: 'chen-huihui-normal.png', text: '今、今天想找什么？', emotion: 'calm' as const },
      ],
    };

    const recovered = applyActionNarrativeKnowledgeFallback(context, scene);
    expect(recovered.lines[1].knowledgeEvents).toEqual(['meet:chen-huihui']);
    expect(actionNarrativeContextError(context, scene)).toBeNull();
  });

  it('uses Huihui directly after her archive has been unlocked', () => {
    const context = resolveActionNarrativeContext('去便利店', morning, 10, {
      currentLocationId: 'home', enRouteEncounterRoll: 1, knowledgeEvents: ['meet:chen-huihui'],
    });
    expect(context?.presentationMode).toBe('huihui-known');
    expect(actionNarrativeContextError(context, {
      lines: [{ background: 'supermarket-day', speaker: '陈慧慧', text: '欢、欢迎回来。', emotion: 'calm' }],
    })).toBeNull();
  });

  it('assigns the public nurse identity to the hospital without revealing the detective identity', () => {
    const context = resolveActionNarrativeContext('前往社区医院查值班记录', morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 1,
    });
    expect(context?.requiredNpcIds).toEqual(['detective-b']);
    expect(context?.directive).toContain('显示称呼固定写“新来的护士”');
    expect(context?.directive).toContain('不得提前揭露侦探身份');
    expect(context?.sceneContract.forbiddenKnowledgeEventIds).toContain('identify:lin-jing-name');
    expect(actionNarrativeContextError(context, {
      lines: [
        { background: 'community-hospital', speaker: '新来的护士', text: '请在这里登记。', emotion: 'calm' },
        { background: 'community-hospital', speaker: '旁白', text: '这是小地方，这家医院的护士大多面熟；她却漂亮得让人见过就会有印象，这张脸很陌生，大概是新来的。', emotion: 'calm' },
      ],
    })).toBeNull();
    expect(actionNarrativeContextError(context, {
      lines: [
        { background: 'community-hospital', speaker: '新来的护士', text: '请登记。', emotion: 'calm' },
        { background: 'community-hospital', speaker: '旁白', text: '这是小地方，医院护士大多面熟，她很漂亮却陌生，大概是新来的。', emotion: 'calm', knowledgeEvents: ['learn:lin-jing-job'] },
      ],
    })).toContain('不得更新她的事实');
  });

  it('keeps the PE teacher outside an exterior-only school visit', () => {
    const context = resolveActionNarrativeContext('到中学校门口问门卫', morning, 10, {
      currentLocationId: 'home', enRouteEncounterRoll: 1, schoolEncounterRoll: 0,
    });
    expect(context?.entryMode).toBe('exterior');
    expect(context?.requiredNpcIds).toEqual(['school-guard']);
    expect(context?.forbiddenNpcIds).toEqual(['liu-renguang']);
    expect(actionNarrativeContextError(context, {
      lines: [
        { background: 'school-day', speaker: '门卫老张', text: '你找谁？', emotion: 'calm' },
        { background: 'school-day', speaker: '体育老师', text: '进来吧。', emotion: 'calm' },
      ],
    })).toContain('禁止当前未满足进入条件');
  });

  it('only rolls the PE teacher after the player enters the school', () => {
    const met = resolveActionNarrativeContext('进入中学去体育办公室', morning, 10, {
      currentLocationId: 'home', enRouteEncounterRoll: 1, schoolEncounterRoll: 0.2,
    });
    const missed = resolveActionNarrativeContext('进入中学去体育办公室', morning, 10, {
      currentLocationId: 'home', enRouteEncounterRoll: 1, schoolEncounterRoll: 0.9,
    });
    expect(met?.requiredNpcIds).toEqual(['school-guard', 'liu-renguang']);
    expect(missed?.requiredNpcIds).toEqual(['school-guard']);
    expect(missed?.directive).toContain('不得强行让刘仁光出场');
  });

  it.each([
    ['去周大爷家问问', 'old-man-building', 'old-man'],
    ['去找灯织学姐', 'senpai-building', 'touko'],
  ])('keeps residents in their own homes: %s', (input, locationId, npcId) => {
    const context = resolveActionNarrativeContext(input, morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 1,
    });
    expect(context?.locationId).toBe(locationId);
    expect(context?.requiredNpcIds).toContain(npcId);
  });

  it('plans a stable truck-driver encounter before the destination when the probability hits', () => {
    const context = resolveActionNarrativeContext('前往便利店', morning, 10, {
      currentLocationId: 'home', enRouteEncounterRoll: 0.1, knowledgeEvents: ['meet:chen-huihui'],
    });
    expect(context?.enRouteNpcIds).toEqual(['detective-a']);
    expect(context?.sceneContract.requiredEnRouteNpcIds).toEqual(['detective-a']);
    expect(actionNarrativeContextError(context, {
      lines: [
        { background: 'street-day', speaker: '寸头男人', text: '雨大，慢点走。', emotion: 'calm' },
        { background: 'supermarket-day', speaker: '陈慧慧', text: '欢、欢迎。', emotion: 'calm' },
      ],
    })).toBeNull();
  });

  it('does not treat a mere mention as a travel decision', () => {
    expect(resolveActionNarrativeContext('便利店的小票上写了什么？', morning, 5)).toBeNull();
    expect(resolveActionNarrativeContext('我不去便利店，先留在这里', morning, 5)).toBeNull();
    expect(resolveActionNarrativeContext('检查自己的身体状况', morning, 5)).toBeNull();
  });
});

describe('executed action narrative context', () => {
  it('does not construct a destination scene while travel is still incomplete', () => {
    const proposed = resolveActionNarrativeContext('前往便利店询问店员', morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 0.1,
    });
    const resolution = resolveAction({
      id: 'interrupted-trip', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'ask', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] }],
      nextBoundary: { id: 'appointment', at: '2024-09-09T08:08:00' },
    });

    expect(resolution.endLocationId).toBe('home');
    expect(resolveExecutedActionNarrativeContext(proposed, resolution)).toBeNull();
  });

  it('selects a requested destination clause from compound input', () => {
    const context = resolveActionNarrativeContext('先调查便利店，再去学校调查', morning, 0, {
      currentLocationId: 'supermarket', destinationLocationId: 'school',
      enRouteEncounterRoll: 1, schoolEncounterRoll: 0,
    });
    expect(context).toMatchObject({
      locationId: 'school', entryMode: 'exterior', requiredNpcIds: ['school-guard'],
      forbiddenNpcIds: ['liu-renguang'],
    });
  });

  it('rebuilds the proposed scene from the real arrival clock and charged resources', () => {
    const proposed = resolveActionNarrativeContext('前往便利店询问店员', morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 0.1,
    });
    const resolution = resolveAction({
      id: 'arrived-trip', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'ask', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] }],
      nextBoundary: { id: 'appointment', at: '2024-09-09T08:20:00' },
    });

    const executed = resolveExecutedActionNarrativeContext(proposed, resolution);
    expect(executed).toMatchObject({
      locationId: 'supermarket',
      background: 'supermarket-day',
      costs: { timeMinutes: 20, stamina: 6 },
      enRouteNpcIds: ['detective-a'],
    });
    expect(executed?.sceneContract.destinationBackground).toBe('supermarket-day');
    expect(executed?.sceneContract.requiredEnRouteNpcIds).toEqual(['detective-a']);
    expect(executed?.directive).toContain('street 场景遭遇');
    expect(executed?.directive).toContain('detective-a');
  });

  it('does not replay a prior travel encounter when destination work resumes', () => {
    const proposed = resolveActionNarrativeContext('前往便利店询问店员', morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 0.1,
    });
    const first = resolveAction({
      id: 'resume-at-store', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'ask', kind: 'inquiry', scope: 'normal', locationId: 'supermarket', completionSourceIds: [] }],
      explicitBudgetMinutes: 20,
    });
    const resumed = resolveAction({
      id: 'resume-at-store', cycleCount: 1, startTime: first.endTime,
      currentLocationId: first.endLocationId,
      stamina: first.resources.after.stamina,
      sanity: first.resources.after.sanity,
      steps: first.continuation!.steps,
      continuation: first.continuation,
    });

    const executed = resolveExecutedActionNarrativeContext(proposed, resumed);
    expect(executed?.enRouteNpcIds).toEqual([]);
    expect(executed?.sceneContract.requiredEnRouteNpcIds).toEqual([]);
    expect(executed?.directive).not.toContain('street 场景遭遇');
    expect(executed?.directive).toContain('本次途中没有固定人物遭遇');
  });

  it('does not replay an en-route encounter after resuming a partly completed journey', () => {
    const proposed = resolveActionNarrativeContext('前往学校调查文穗的情况', morning, 0, {
      currentLocationId: 'home', enRouteEncounterRoll: 0.1,
    });
    const resumed: import('./action-resolution').ResolvedActionOutcome = {
      id: 'resumed-school', cycleCount: 1,
      startTime: '2025-09-09T08:05:00', endTime: '2025-09-09T09:05:00',
      startLocationId: 'home', endLocationId: 'school', plannedMinutes: 60, executedMinutes: 60,
      segments: [
        { step: { id: '__travel__:0:home:school:work%3A0', kind: 'travel', scope: 'normal', locationId: 'school', completionSourceIds: [] },
          plannedMinutes: 10, executedMinutes: 5, cumulativeExecutedMinutes: 10, staminaDelta: -2, completed: true },
        { step: { id: 'work:0', kind: 'investigation', scope: 'normal', locationId: 'school', completionSourceIds: [] },
          plannedMinutes: 55, executedMinutes: 55, cumulativeExecutedMinutes: 55, staminaDelta: -7, completed: true },
      ],
      resources: { before: { stamina: 98, sanity: 58 }, after: { stamina: 89, sanity: 58 } },
      completedSourceIds: [], eventEffectIds: [],
    };

    const executed = resolveExecutedActionNarrativeContext(proposed, resumed);
    expect(executed?.enRouteNpcIds).toEqual([]);
    expect(executed?.sceneContract.requiredEnRouteNpcIds).toEqual([]);
    expect(executed?.directive).toContain('本次途中没有固定人物遭遇');
  });

  it('uses the executed end time when selecting the destination background', () => {
    const proposed = resolveActionNarrativeContext('回到家里休息一段时间', new Date('2024-09-09T17:50:00'), 0, {
      currentLocationId: 'school', enRouteEncounterRoll: 1,
    });
    const resolution = resolveAction({
      id: 'return-home', cycleCount: 1, startTime: '2024-09-09T17:50:00',
      currentLocationId: 'school', stamina: 100, sanity: 70,
      steps: [{ id: 'return', kind: 'travel', scope: 'short', locationId: 'home', completionSourceIds: [] }],
    });

    expect(resolveExecutedActionNarrativeContext(proposed, resolution)).toMatchObject({
      locationId: 'home', background: 'home-night', costs: { timeMinutes: 10, stamina: 4 },
    });
  });
});
