import { maintextToScene } from './scene-parser';
import type { Scene } from '../sillytavern/types';
import { clampTimeCost } from './game-clock';

/** Evidence must name this victim and report death, not hint at a meeting or her parents. */
export function hasDeliveredDeathNews(narrative: string | Pick<Scene, 'lines'>): boolean {
  const scene = typeof narrative === 'string' ? maintextToScene(narrative) : narrative;
  const speculative = /没有|并未|未曾|尚未|不能确认|无法确认|不能确定|无法确定|否认|不属实|假如|如果|也许|可能|我猜|猜测|怀疑|担心|以为|梦见|梦里|传闻|传言|谣言|尚无依据|未经证实|[？?]/u;
  const official = /警方|警员|警察|民警|派出所|警官/u;
  const sentences = scene.lines.flatMap((line, index) => {
    const isNarrator = /^(?:旁白|narration)$/i.test(line.speaker);
    const context = scene.lines.slice(Math.max(0, index - 1), index + 1).map(item => item.text).join(' ');
    const sourced = official.test(line.speaker) || official.test(line.text)
      || (isNarrator && (official.test(context) || /(?:确认|证实)[^。]{0,16}是文穗|对面的声音说/u.test(line.text)));
    return (line.text.match(/[^。！？\n!?]+[。！？!?]?/gu) ?? []).map(text => ({
      // Uncertainty about cause does not negate an explicitly confirmed death.
      text: text.replace(/[，,](?:但|而)?死因[^，,。！？!?]*/gu, ''), sourced,
    }));
  });
  return sentences.some(({ text: sentence, sourced }) => sourced && !speculative.test(sentence)
    && /文穗(?:(?!父母|父亲|母亲|爸爸|妈妈)[^。！？\n]){0,24}(?:死亡|去世|遇难)/u.test(sentence))
    || sentences.some(({ text: sentence, sourced }, i) => sourced && !speculative.test(sentence)
      && /(?:确认|证实)[^。！？\n]{0,16}是文穗/u.test(sentence)
      && /^(?:人)?已经死亡[。！!]?$/u.test((sentences[i + 1]?.text ?? '').trim()));
}

export function validateNarrativeContract(scene: Pick<Scene, 'lines'> | null, options: {
  time: Date; timeMinutes: number; pendingDeathNews: boolean;
}): Array<{ code: string; message: string }> {
  const errors: Array<{ code: string; message: string }> = [];
  if (!scene?.lines.some(line => line.text.trim())) {
    return [{ code: 'EMPTY_PLAYABLE_SCENE', message: '必须有实际可播放台词，不能仅输出场景、音乐或观察面板。' }];
  }
  if (options.pendingDeathNews && !hasDeliveredDeathNews(scene)) {
    errors.push({ code: 'DEATH_NEWS_NOT_DELIVERED', message: '本回合警方必须明确告知“文穗已经死亡”，并写出玩家听到消息的反应；叫去派出所、欲言又止、猜测或父母死亡证明不算送达。不得补写死因或凶手。' });
  }
  const midnight = new Date(options.time);
  midnight.setHours(24, 0, 0, 0);
  const end = options.time.getTime() + clampTimeCost(options.timeMinutes) * 60_000;
  const narration = scene.lines.filter(line => /^(?:旁白|narration)$/i.test(line.speaker)).map(line => line.text).join('\n');
  if (end < midnight.getTime() && /午夜(?:已经)?到了|时间(?:已经)?(?:越过|跨过)午夜|已经是(?:第二天|次日)早晨/u.test(narration)) {
    errors.push({ code: 'PREMATURE_MIDNIGHT', message: '本回合获准分钟数尚未抵达午夜，不能写午夜已到、过夜或次日晨起；按权威本地时钟重写，日终重置由程序执行。' });
  }
  return errors;
}

export function buildNarrativeClock(time: Date, cycleCount: number) {
  const pad = (value: number) => String(value).padStart(2, '0');
  const localDate = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  const localTime = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
  const minutes = time.getHours() * 60 + time.getMinutes();
  return { localDate, localTime, cycleCount, period: minutes >= 480 && minutes <= 1110 ? 'day' : 'night',
    minutesUntilMidnight: 1440 - minutes,
    directive: `权威游戏时间：第${cycleCount}次重复日，${localDate} ${localTime}（游戏本地时间）。当前回合只能消耗获准分钟数；午夜重置仅由程序执行，不得提前宣告午夜、过夜、次日晨起或把当天事实称作昨天。` };
}
