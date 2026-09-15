import { maintextToScene } from './scene-parser';
import type { Scene } from '../sillytavern/types';
import { clampTimeCost } from './game-clock';
import type { ResolvedActionOutcome } from './action-resolution';
import { checkCycleFailure } from './cycle-failure';

/** Compatibility API: this records receipt of a preliminary report, never a confirmed death. */
export function hasDeliveredDeathNews(narrative: string | Pick<Scene, 'lines'>): boolean {
  const scene = typeof narrative === 'string' ? maintextToScene(narrative) : narrative;
  const official = /警方|警员|警察|民警|派出所|警官/u;
  // A correct notification cannot license an adjacent omniscient confirmation.
  if (scene.lines.some(line => line.text.split(/[。！？\n]/u).some(sentence => {
    const assertion = /文穗(?:确实|确定|已确认)?(?:已经|已)?(?:死亡|死了|去世)|(?:确认|证实)(?:死者)?(?:就是|是)文穗/u.exec(sentence);
    if (!assertion) return false;
    const prefix = sentence.slice(0, assertion.index);
    return !/尚未|未经|不能|无法|没有|并未|如果|假如|猜|传闻|传言|谣言|否认/u.test(prefix)
      && !/[？?]|传闻|谣言/u.test(sentence);
  }))) return false;
  return scene.lines.some((line, index) => {
    const isNarrator = /^(?:旁白|narration)$/i.test(line.speaker);
    const context = scene.lines.slice(Math.max(0, index - 1), index + 1).map(item => item.text).join(' ');
    const sourced = official.test(line.speaker) || official.test(line.text)
      || (isNarrator && official.test(context));
    const text = line.text;
    const noDelivery = /(?:没有|并未|未曾|尚未|不能|无法|准备|即将|将要|打算)[^。！？]{0,16}(?:送达|收到|通报|通知)|假如|如果|我猜|梦见|梦里|传闻|传言|谣言|[？?]/u.test(text);
    return sourced && !noDelivery && /文穗(?!父母|父亲|母亲|爸爸|妈妈)/u.test(text)
      && /死亡|死者|遗体|遇难/u.test(text)
      && /初步(?:死亡)?(?:通报|报告|通知)|疑似[^。！？]{0,16}文穗/u.test(text)
      && /通报|报告|通知|告知|送达|送来/u.test(text);
  });
}

export function validateNarrativeContract(scene: Pick<Scene, 'lines'> | null, options: {
  time: Date; timeMinutes: number; pendingDeathNews: boolean;
  resolvedAction?: ResolvedActionOutcome;
}): Array<{ code: string; message: string }> {
  const errors: Array<{ code: string; message: string }> = [];
  if (!scene?.lines.some(line => line.text.trim())) {
    return [{ code: 'EMPTY_PLAYABLE_SCENE', message: '必须有实际可播放台词，不能仅输出场景、音乐或观察面板。' }];
  }
  if (options.pendingDeathNews && !hasDeliveredDeathNews(scene)) {
    errors.push({ code: 'DEATH_NEWS_NOT_DELIVERED', message: '本回合必须演出警方向玩家送达初步死亡通报：发现一名疑似文穗的死者，并写出玩家收到消息的反应。死者身份、死亡时刻与死因仍待核实；不能旁白确认文穗已死、当天死亡或凶手。仅叫去派出所、假设收到或父母死亡证明不算送达。' });
  }
  const midnight = new Date(options.time);
  midnight.setHours(24, 0, 0, 0);
  const end = options.resolvedAction ? new Date(options.resolvedAction.endTime).getTime()
    : options.time.getTime() + clampTimeCost(options.timeMinutes) * 60_000;
  const narration = scene.lines.filter(line => /^(?:旁白|narration)$/i.test(line.speaker)).map(line => line.text).join('\n');
  if (end < midnight.getTime() && /午夜(?:已经)?到了|时间(?:已经)?(?:越过|跨过)午夜|已经是(?:第二天|次日)早晨/u.test(narration)) {
    errors.push({ code: 'PREMATURE_MIDNIGHT', message: '本回合获准分钟数尚未抵达午夜，不能写午夜已到、过夜或次日晨起；按权威本地时钟重写，日终重置由程序执行。' });
  }
  if (options.resolvedAction) {
    const resetReason = checkCycleFailure({ ...options.resolvedAction.resources.after, time: new Date(options.resolvedAction.endTime) });
    if (resetReason && scene.lines.at(-1)?.effect !== 'loop-transition') {
      errors.push({ code: 'CYCLE_RESET_NOT_RENDERED',
        message: `程序结算到${options.resolvedAction.endTime}已到当日行动终止边界（${resetReason}），但正文没有边界收尾。请修改剧情：保留实际完成的行动与后果，演出对应的午夜/体力/理智中断；在最后一段旁白之前添加“效果|loop-transition”作为视觉衔接，不得继续当天行动、补完未执行阶段或改动结算。后续进入结局还是08:00重置由程序决定，当前正文不得提前宣告。` });
    }
    // A narrow numerical sentinel. Semantic assertion review handles other
    // duration claims, figurative language and sub-scenes within this interval.
    const elapsedClaims = narration.matchAll(/(?:^|[。！？\n])(?:这(?:次|场|轮)(?:调查|问询|搜查|走访|行动|休息|等待)|整个(?:过程|调查|行动))(?:共|总共|一共)?(?:耗时|持续了|花了|用了|用去)([零一二两三四五六七八九十百\d]+)(分钟|小时)(?=[。！？\n]|$)/gu);
    for (const claim of elapsedClaims) {
      const count = readSmallDurationNumber(claim[1]);
      if (count === null) continue;
      const minutes = count * (claim[2] === '小时' ? 60 : 1);
      if (minutes !== options.resolvedAction.executedMinutes) {
        errors.push({ code: 'RESOLVED_DURATION_CONFLICT',
          message: `正文把整个行动写成${minutes}分钟，但程序实际执行${options.resolvedAction.executedMinutes}分钟。按权威起止时间重写，只需演绎关键片段。` });
      }
    }
  }
  return errors;
}

function readSmallDurationNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text.length === 1 && text in digits) return digits[text];
  if (/^[一二两三四五六七八九]?十[一二三四五六七八九]?$/.test(text)) {
    const [tens, units] = text.split('十');
    return (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0);
  }
  return null;
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
