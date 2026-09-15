import { describe, expect, it } from 'vitest';
import { maintextToScene } from './scene-parser';
import { hasDeliveredDeathNews, validateNarrativeContract } from './narrative-contract';
import type { ResolvedActionOutcome } from './action-resolution';

const resolved: ResolvedActionOutcome = { id: 'r', cycleCount: 1,
  startTime: '2024-09-09T08:00:00', endTime: '2024-09-09T08:55:00',
  startLocationId: 'home', endLocationId: 'home', plannedMinutes: 55, executedMinutes: 55,
  segments: [], completedSourceIds: [], eventEffectIds: [],
  resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } } };

describe('rendered narrative contracts', () => {
  it.each(['stamina', 'sanity'] as const)('also requires an ending when %s is exhausted before midnight', resource => {
    const outcome = { ...resolved, resources: { ...resolved.resources, after: { ...resolved.resources.after, [resource]: 0 } } };
    const errors = validateNarrativeContract(maintextToScene('对话|旁白|calm|你还在继续翻找。'), {
      time: new Date(resolved.startTime), timeMinutes: 55, pendingDeathNews: false, resolvedAction: outcome,
    });
    expect(errors).toContainEqual(expect.objectContaining({ code: 'CYCLE_RESET_NOT_RENDERED', message: expect.stringContaining(resource) }));
  });
  it('returns a concrete writer correction when settled midnight lacks a reset ending', () => {
    const outcome = { ...resolved, startTime: '2024-09-09T23:30:00', endTime: '2024-09-10T00:00:00', executedMinutes: 30 };
    const options = { time: new Date(outcome.startTime), timeMinutes: 30, pendingDeathNews: false, resolvedAction: outcome };
    expect(validateNarrativeContract(maintextToScene('对话|旁白|calm|你还在继续翻找。'), options))
      .toContainEqual(expect.objectContaining({ code: 'CYCLE_RESET_NOT_RENDERED' }));
    expect(validateNarrativeContract(maintextToScene('效果|loop-transition\n对话|旁白|calm|午夜到了。眼前的一切断开，你再也无法继续翻找。'), options)).toEqual([]);
  });
  it.each(['这次调查耗时两小时。', '整个行动用了120分钟。'])('rejects explicit elapsed duration conflicting with resolution: %s', text => {
    const errors = validateNarrativeContract(maintextToScene(`对话|旁白|calm|${text}`), {
      time: new Date(resolved.startTime), timeMinutes: 55, pendingDeathNews: false, resolvedAction: resolved,
    });
    expect(errors.some(error => error.code === 'RESOLVED_DURATION_CONFLICT')).toBe(true);
  });
  it.each(['这次调查耗时55分钟。', '你想起两小时前的那句话，心里很疲惫。',
    '这次调查没有耗时两小时。', '这次调查原计划耗时两小时，实际只进行了55分钟。'])('accepts accurate elapsed time and subjective grief: %s', text => {
    expect(validateNarrativeContract(maintextToScene(`对话|旁白|calm|${text}`), {
      time: new Date(resolved.startTime), timeMinutes: 55, pendingDeathNews: false, resolvedAction: resolved,
    })).toEqual([]);
  });
  it('uses the resolved long wait end rather than the legacy clock clamp', () => {
    expect(validateNarrativeContract(maintextToScene('效果|loop-transition\n对话|旁白|calm|午夜到了，这一天到头了。'), {
      time: new Date('2024-09-09T16:00:00'), timeMinutes: 480, pendingDeathNews: false,
      resolvedAction: { ...resolved, startTime: '2024-09-09T16:00:00', endTime: '2024-09-10T00:00:00', executedMinutes: 480, plannedMinutes: 480 },
    })).toEqual([]);
  });
  it.each([
    '警方来电，初步死亡通报中的死者疑似文穗，身份与死亡时间仍待核实。',
    '对话|警员|calm|现在向你送达涉及文穗的初步死亡通报。身份、死因和死亡时间仍待核实。',
    '对话|旁白|calm|警方的电话接通了。\n对话|旁白|calm|对方送来初步通报：发现一名疑似文穗的死者。你攥紧了手机。',
  ])('recognizes receipt while retaining uncertain identity and timing: %s', text => expect(hasDeliveredDeathNews(text)).toBe(true));
  it.each([
    '如果文穗已经死亡，我该怎么办？',
    '我猜文穗已经死亡。',
    '文穗没有死亡。',
    '文穗父母已经死亡，请带死亡证明。',
    '尚未确认，是文穗。人已经死亡。',
    '电话只说文穗的事情要当面说。',
    '对话|旁白|calm|“文穗已经死亡”的传闻尚无依据。',
    '对话|玩家|sad|文穗已经死亡。',
    '对话|灯织|sad|文穗已经死亡。',
    '对话|警员|calm|我们否认文穗死亡。',
    '警方不能确定文穗死亡。',
    '警方告知：文穗已经死亡。',
    '对话|警员|calm|文穗已经死亡，但死因尚未确认。',
    '警方尚未送达涉及文穗的初步死亡通报。',
    '如果警方送达文穗的初步死亡通报，我该怎么办？',
    '警方初步死亡通报中的死者疑似文穗。\n对话|旁白|calm|文穗确实已经死亡，时间就是今天下午。',
    '警方准备向你送达文穗的初步死亡通报。',
    '警方的初步死亡通报涉及文穗。文穗已经死亡，身份尚未核实。',
  ])('does not turn guesses, denials or vague calls into delivery: %s', text => expect(hasDeliveredDeathNews(text)).toBe(false));
  it('rejects a missing event and a premature midnight before commit', () => {
    const errors = validateNarrativeContract(maintextToScene('对话|旁白|calm|午夜到了，警方叫你到所当面说文穗的事。'), {
      time: new Date('2024-09-09T16:20:00'), timeMinutes: 10, pendingDeathNews: true,
    });
    expect(errors.map(e => e.code)).toEqual(expect.arrayContaining(['DEATH_NEWS_NOT_DELIVERED', 'PREMATURE_MIDNIGHT']));
  });
  it('uses the same 180-minute maximum as settlement before allowing midnight', () => {
    const errors = validateNarrativeContract(maintextToScene('对话|旁白|calm|午夜到了。'), {
      time: new Date('2024-09-09T16:00:00'), timeMinutes: 480, pendingDeathNews: false,
    });
    expect(errors.map(error => error.code)).toContain('PREMATURE_MIDNIGHT');
  });
});
