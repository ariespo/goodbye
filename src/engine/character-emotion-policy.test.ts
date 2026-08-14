import { describe, expect, it } from 'vitest';
import type { Scene } from '../sillytavern/types';
import {
  CHEN_HUIHUI_ANGRY_ANIMATION_MS,
  applyCharacterEmotionPolicies,
  isZhouDemingConfirmedKiller,
  sceneHasStructuredHuihuiAngryReveal,
} from './character-emotion-policy';

function scene(lines: Scene['lines']): Scene {
  return { id: 'policy-test', lines };
}

describe('character emotion policy', () => {
  it.each(['happy', 'sad', 'angry', 'horror', 'insane'] as const)(
    'forces Lin Jing %s presentation back to calm even when an emotion sprite is supplied',
    emotion => {
      const result = applyCharacterEmotionPolicies(scene([{
        speaker: '林静',
        emotion,
        character: `detective-b-${emotion}.png`,
        text: '没有必要。',
      }]), {});
      expect(result.lines[0]).toMatchObject({
        emotion: 'calm',
        character: 'detective-b-normal.png',
      });
    },
  );

  it('downgrades Huihui angry when the complete reveal is absent', () => {
    const result = applyCharacterEmotionPolicies(scene([{
      speaker: '陈慧慧', emotion: 'angry', character: 'chen-huihui-angry.png', text: '别再问了。',
    }]), {});
    expect(result.lines[0]).toMatchObject({ emotion: 'calm', character: 'chen-huihui-normal.png' });
  });

  it('allows Huihui angry only before a structurally complete chocolate reveal', () => {
    const source = scene([
      { speaker: '陈慧慧', emotion: 'angry', character: 'chen-huihui-angry.png', text: '我真的受够了。' },
      { speaker: '旁白', emotion: 'calm', text: '她等动作停下，撕开手中扁平物件，咬下一角巧克力。' },
      { speaker: '陈慧慧', emotion: 'calm', character: 'chen-huihui-normal.png', text: '我有低血糖。我一个收银员拿文件夹做什么？这是大号巧克力。', knowledgeEvents: ['insight:chen-huihui-hypoglycemia'] },
    ]);
    expect(sceneHasStructuredHuihuiAngryReveal(source)).toBe(true);
    const result = applyCharacterEmotionPolicies(source, {});
    expect(result.lines[0]).toMatchObject({
      emotion: 'angry',
      character: 'chen-huihui-angry.png',
      minimumDisplayMs: CHEN_HUIHUI_ANGRY_ANIMATION_MS,
    });
  });

  it('still rejects an event placed before the angry action', () => {
    const source = scene([
      { speaker: '陈慧慧', emotion: 'calm', text: '我有低血糖，我一个收银员拿文件夹做什么？这是巧克力。', knowledgeEvents: ['insight:chen-huihui-hypoglycemia'] },
      { speaker: '陈慧慧', emotion: 'angry', character: 'chen-huihui-angry.png', text: '现在才生气。' },
    ]);
    expect(sceneHasStructuredHuihuiAngryReveal(source)).toBe(false);
    const result = applyCharacterEmotionPolicies(source, {});
    expect(result.lines[1].emotion).toBe('calm');
    expect(result.lines[0].knowledgeEvents).toBeUndefined();
    expect(applyCharacterEmotionPolicies(source, {
      knowledgeEvents: ['insight:chen-huihui-hypoglycemia'],
    }).lines[1].emotion).toBe('calm');
  });

  it('blocks Zhou Deming insane until the murder fact is confirmed', () => {
    const source = scene([{
      speaker: '周德明', emotion: 'insane', character: 'old-man-insane.png', text: '轮到你了。',
    }]);
    expect(isZhouDemingConfirmedKiller({ mysteryKnowledge: { 'a-murder-staged-fall': 'clue' } })).toBe(false);
    expect(applyCharacterEmotionPolicies(source, {
      mysteryKnowledge: { 'a-murder-staged-fall': 'clue' },
    }).lines[0]).toMatchObject({ emotion: 'angry', character: 'old-man-angry.png' });

    const confirmed = { mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' } };
    expect(isZhouDemingConfirmedKiller(confirmed)).toBe(true);
    expect(applyCharacterEmotionPolicies(source, confirmed).lines[0]).toMatchObject({
      emotion: 'insane', character: 'old-man-insane.png',
    });
  });

  it('does not let turn settlement retroactively unlock insane before its confirmation line', () => {
    const source: Scene = {
      id: 'same-turn-confirmation',
      emotionPolicyContext: {
        huihuiChocolateKnownAtSceneStart: false,
        zhouKillerConfirmedAtSceneStart: false,
      },
      lines: [
        { speaker: '周德明', emotion: 'insane', character: 'old-man-insane.png', text: '你终于明白了。' },
        { speaker: '旁白', emotion: 'calm', text: '证据已经确认：周德明是凶手，他把文穗推下二楼。' },
        { speaker: '周德明', emotion: 'insane', character: 'old-man-insane.png', text: '现在，我们可以继续了。' },
      ],
    };
    const settledVariables = { mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' } };
    const result = applyCharacterEmotionPolicies(source, settledVariables);
    expect(result.lines[0]).toMatchObject({ emotion: 'angry', character: 'old-man-angry.png' });
    expect(result.lines[2]).toMatchObject({ emotion: 'insane', character: 'old-man-insane.png' });

    const replayWithoutStoredContext = { id: source.id, lines: source.lines };
    expect(applyCharacterEmotionPolicies(replayWithoutStoredContext, settledVariables).lines[0])
      .toMatchObject({ emotion: 'angry', character: 'old-man-angry.png' });
  });
});
