import { describe, expect, it } from 'vitest';
import { maintextToScene } from './scene-parser';
import { hasDeliveredDeathNews, validateNarrativeContract } from './narrative-contract';

describe('rendered narrative contracts', () => {
  it.each([
    '警方告知：文穗已经死亡。',
    '经初步确认，是文穗。人已经死亡。',
    '对面的声音说，文穗今天上午被发现死亡，需要你配合后续确认。',
    '警方告诉你文穗已经死亡，让你通知她的父母。',
    '对话|警员|calm|文穗已经死亡。',
    '对话|警员|calm|文穗已经死亡，但死因尚未确认。',
  ])('recognizes an explicit death report: %s', text => expect(hasDeliveredDeathNews(text)).toBe(true));
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
