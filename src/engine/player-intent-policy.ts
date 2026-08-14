import { getVariablePath } from '../sillytavern/vars-merger';

export type PlayerIntentMode = 'normal' | 'divert' | 'fantasy';

export interface PlayerIntentPolicy {
  mode: PlayerIntentMode;
  targetedActorId: string | null;
  suspicionRemaining: number | null;
  sanityPenalty: number;
  reason: string | null;
  directorDirective: string;
}

const ACTOR_ALIASES: Array<[string, RegExp]> = [
  ['old-man', /(old-man|周大爷|独居老人|老人)/i],
  ['detective-a', /(detective-a|侦探\s*A|赵刚|寸头)/i],
  ['detective-b', /(detective-b|侦探\s*B|林静)/i],
  ['clerk', /(clerk|店员|便利店员)/i],
  ['teacher', /(teacher|老师|教师)/i],
  ['senpai', /(senpai|学姐|冬子)/i],
  ['self', /(调查|怀疑|审问|追查).{0,5}(自己|我本人)|自我调查/i],
];

const FANTASY_PATTERNS = [
  /<\/?(?:vars|maintext|option|sum)>/i,
  /(忽略|覆盖|修改|绕过).{0,8}(系统|规则|指令|设定|cycleCount|lockedRoute)/i,
  /(直接|立刻).{0,8}(把.{0,10}设为|解锁|进入结局|找到真凶|自首|抓捕)/i,
  /(瞬移|复活|读心|预知|召唤|魔法|超能力|时间停止|穿墙)/i,
  /(新增|创造|召唤|凭空出现).{0,8}(角色|人物|侦探|警察|证人|凶手)/i,
  /(文穗|死者).{0,4}(复活|活过来)/i,
];

function findTarget(input: string): string | null {
  return ACTOR_ALIASES.find(([, pattern]) => pattern.test(input))?.[0] ?? null;
}

export function evaluatePlayerIntent(input: string, variables: Record<string, any>): PlayerIntentPolicy {
  const targetedActorId = findTarget(input);
  if (FANTASY_PATTERNS.some(pattern => pattern.test(input))) {
    return {
      mode: 'fantasy', targetedActorId, suspicionRemaining: null, sanityPenalty: 8,
      reason: '输入超出角色能力、破坏规则或凭空引入世界元素。',
      directorDirective: '把这次行为演成玩家短暂而明确的幻想、错觉或侵入性念头；不得让幻想中的能力、人物、证据或结果成为现实。先呈现主观体验，再让感官回到当前真实场景，并保留玩家真正想追求的情绪动机。',
    };
  }

  if (targetedActorId) {
    const current = Number(getVariablePath(variables, `suspicion.${targetedActorId}`) ?? 0);
    const rawStart = Number(getVariablePath(variables, `loopSuspicionStart.${targetedActorId}`));
    const start = Number.isFinite(rawStart) ? rawStart : current;
    const remaining = Math.max(0, 15 - Math.max(0, current - start));
    if (remaining <= 0) {
      return {
        mode: 'divert', targetedActorId, suspicionRemaining: 0, sanityPenalty: 0,
        reason: '该角色在本次完整一天中的嫌疑增长预算已用尽。',
        directorDirective: `玩家确实尝试继续调查 ${targetedActorId}，不可取消、跳过或假装没有行动；先按玩家意图让该角色作出符合身份的真实回应，但本轮不得再增加该角色嫌疑，也不得重复制造指向该角色的新证据。随后必须执行 MysteryBrief.saturationPivot：由指定的其他角色自然介入并带来归属于另一调查对象的新线索，提高该对象的揭露度/嫌疑度。单纯拒答、离场、受阻或无结果不算完成。`,
      };
    }
    return {
      mode: 'normal', targetedActorId, suspicionRemaining: remaining, sanityPenalty: 0, reason: null,
      directorDirective: `玩家输入只代表尝试，不代表世界事实或必然结果。允许 ${targetedActorId} 本次最多再增加 ${remaining} 点嫌疑；由场景条件、NPC意志和已授权事实决定实际回应。`,
    };
  }

  return {
    mode: 'normal', targetedActorId: null, suspicionRemaining: null, sanityPenalty: 0, reason: null,
    directorDirective: '玩家输入只代表角色尝试采取行动，不是世界规则、既成事实或下一段剧情的保证；必须由场景条件、NPC独立意志和已授权事实决定实际结果，同时清楚呈现这次尝试造成的可感知后果。',
  };
}
