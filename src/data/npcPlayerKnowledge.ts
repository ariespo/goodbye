export interface PlayerIdentity {
  name: string;
  gender: 'male' | 'female';
}

export interface NpcPlayerKnowledgeBrief {
  npcId: string;
  knowsPlayerName: boolean;
  allowedAddress: string;
  knowledgeScope: 'full-name' | 'familiar-honorific' | 'family-nickname' | 'unknown';
  reason: string;
}

const ESTABLISHED_NAME_KNOWLEDGE: Record<string, NpcPlayerKnowledgeBrief['knowledgeScope']> = {
  fumi: 'full-name',
  touko: 'full-name',
  'chen-huihui': 'familiar-honorific',
  'old-man': 'family-nickname',
};

function familyNameOf(name: string): string {
  const normalized = name.trim();
  if (!normalized) return '';
  if (/^[\u3400-\u9fff]+$/u.test(normalized)) return normalized[0];
  const parts = normalized.split(/\s+/);
  if (parts.length > 1) return parts[parts.length - 1];
  // Latin names and player nicknames use one grapheme for familiar forms:
  // CC -> C姐/C哥 and 小C, instead of leaking the whole nickname.
  return Array.from(normalized)[0] ?? '';
}

export function resolveNpcPlayerKnowledge(
  npcId: string,
  identity: PlayerIdentity,
  variables: Record<string, unknown> = {},
): NpcPlayerKnowledgeBrief {
  const learnedBy = Array.isArray(variables.playerNameKnownByNpcIds)
    ? variables.playerNameKnownByNpcIds.filter((id): id is string => typeof id === 'string')
    : [];
  const scope = ESTABLISHED_NAME_KNOWLEDGE[npcId]
    ?? (learnedBy.includes(npcId) ? 'full-name' : 'unknown');
  const familyName = familyNameOf(identity.name);

  if (scope === 'full-name') {
    return {
      npcId,
      knowsPlayerName: true,
      allowedAddress: identity.name,
      knowledgeScope: scope,
      reason: npcId === 'fumi' ? '与玩家共同生活，当然知道姓名。' : '与玩家早已相识，知道姓名。',
    };
  }
  if (scope === 'familiar-honorific') {
    return {
      npcId,
      knowsPlayerName: true,
      allowedAddress: `${familyName}${identity.gender === 'male' ? '哥' : '姐'}`,
      knowledgeScope: scope,
      reason: '作为附近便利店的熟面孔，只用自己习惯的姓氏加哥/姐称呼。',
    };
  }
  if (scope === 'family-nickname') {
    return {
      npcId,
      knowsPlayerName: true,
      allowedAddress: `小${familyName}`,
      knowledgeScope: scope,
      reason: '作为熟悉附近年轻人的长辈，用“小+姓”称呼。',
    };
  }
  return {
    npcId,
    knowsPlayerName: false,
    allowedAddress: '你',
    knowledgeScope: 'unknown',
    reason: '当前没有可靠经历表明该角色知道玩家姓名，只能使用“你”、职业称呼或现场称呼。',
  };
}

export function buildNpcPlayerKnowledgeBrief(
  activeNpcIds: readonly string[],
  identity: PlayerIdentity | undefined,
  variables: Record<string, unknown> = {},
): NpcPlayerKnowledgeBrief[] {
  if (!identity?.name.trim()) return [];
  return [...new Set(activeNpcIds)].map(npcId => resolveNpcPlayerKnowledge(npcId, identity, variables));
}

export function doesPlayerIntroduceName(input: string, identity: PlayerIdentity | undefined): boolean {
  if (!identity || /(?:不|别|不要).{0,6}(?:告诉|说|介绍).{0,6}(?:名字|姓名)/.test(input)) return false;
  const escapedName = identity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`我叫(?:做)?\\s*${escapedName}|我的名字(?:是|叫)\\s*${escapedName}|自我介绍|告诉.{0,10}(?:我的)?(?:名字|姓名)`).test(input);
}

export function formatNpcPlayerKnowledgeDirective(briefs: readonly NpcPlayerKnowledgeBrief[]): string {
  if (briefs.length === 0) return '';
  return `[NPC 对玩家姓名的认知边界]\n${briefs.map(brief => (
    brief.knowsPlayerName
      ? `- ${brief.npcId} 知道玩家姓名；自然需要称呼时只使用“${brief.allowedAddress}”。${brief.reason}`
      : `- ${brief.npcId} 不知道玩家姓名；不得说出、猜中或用姓名称呼玩家。${brief.reason}`
  )).join('\n')}\n称呼用于自然增强关系感，不要求每句台词都重复。[/NPC 对玩家姓名的认知边界]`;
}

const SPEAKER_TO_NPC: Array<[RegExp, string]> = [
  [/^(?:文穗|fumi)$/i, 'fumi'],
  [/^(?:沈灯织|灯织|灯织学姐|学姐|touko)$/i, 'touko'],
  [/^(?:陈慧慧|店员|便利店员|chen-huihui)$/i, 'chen-huihui'],
  [/^(?:周德明|周大爷|old-man)$/i, 'old-man'],
  [/^(?:刘仁光|体育老师|liu-renguang)$/i, 'liu-renguang'],
  [/^(?:老张|门卫老张|学校门卫|门卫|school-guard)$/i, 'school-guard'],
  [/^(?:赵刚|寸头男人|货车司机|陌生货车司机|detective-a)$/i, 'detective-a'],
  [/^(?:林静|新来的护士|陌生护士|护士|detective-b)$/i, 'detective-b'],
];

export function npcPlayerKnowledgeError(
  lines: ReadonlyArray<{ speaker: string; text: string }>,
  identity: PlayerIdentity | undefined,
  briefs: readonly NpcPlayerKnowledgeBrief[],
): string | null {
  if (!identity) return null;
  const byNpc = new Map(briefs.map(brief => [brief.npcId, brief]));
  const familyName = familyNameOf(identity.name);
  for (const line of lines) {
    const npcId = SPEAKER_TO_NPC.find(([pattern]) => pattern.test(line.speaker.trim()))?.[1];
    if (!npcId) continue;
    const brief = byNpc.get(npcId);
    if (!brief) continue;
    const usesFullName = line.text.includes(identity.name);
    const usesUserMacro = line.text.includes('{{user}}');
    const usesNamedHonorific = familyName.length > 0
      && new RegExp(`${familyName}(?:哥|姐|先生|女士|同学)`).test(line.text);
    if (!brief.knowsPlayerName && (usesFullName || usesUserMacro || usesNamedHonorific)) {
      return `${npcId} 当前不知道玩家姓名，台词却使用了姓名或姓氏称呼。`;
    }
    if (brief.knowsPlayerName
      && brief.knowledgeScope !== 'full-name'
      && (usesFullName || usesUserMacro)
      && !line.text.includes(brief.allowedAddress)) {
      return `${npcId} 对玩家的称呼越过了认知范围；当前只允许使用“${brief.allowedAddress}”。`;
    }
  }
  return null;
}
