import { describe, expect, it } from 'vitest';
import type { Scene } from '../sillytavern/types';
import {
  actionNarrativeContextError,
  applyActionNarrativeKnowledgeFallback,
  resolveActionNarrativeContext,
} from './action-narrative-context';

const morning = new Date('2025-09-09T08:00:00');

describe('action narrative context semantic planning', () => {
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
