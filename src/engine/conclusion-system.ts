import { getVariablePath } from '../sillytavern/vars-merger';

export type ConclusionRouteId = 'A' | 'B' | 'C' | 'NONE' | 'FAKE';
export type ConclusionOverlayId = 'CULT' | 'PSYCH';
export type ConclusionChoiceId =
  | 'report'
  | 'private'
  | 'accept'
  | 'deny'
  | 'letgo'
  | 'refuse'
  | 'release'
  | 'pursue'
  | 'destroy'
  | 'sacrifice'
  | 'wake'
  | 'sink';

export type ConclusionVariables = Record<string, unknown>;

export interface ConclusionCriterion {
  id: string;
  label: string;
  valueLabel: string;
  progress: number;
  met: boolean;
}

export interface ConclusionRouteOption {
  id: ConclusionRouteId;
  index: string;
  title: string;
  thesis: string;
  accent: 'blue' | 'violet' | 'red' | 'silver' | 'gold';
  available: boolean;
  progress: number;
  criteria: ConclusionCriterion[];
}

export interface ConclusionOverlayOption {
  id: ConclusionOverlayId | null;
  title: string;
  description: string;
  available: boolean;
  hidden?: boolean;
}

export interface ConclusionChoiceOption {
  id: ConclusionChoiceId;
  endingId: string;
  title: string;
  description: string;
  tone: 'resolve' | 'rupture';
}

export interface ConclusionDecision<T = ConclusionVariables> {
  accepted: boolean;
  value: T;
  reason?: string;
}

export interface FinalConclusionDecision extends ConclusionDecision {
  endingId?: string;
}

const ROUTE_IDS = new Set<ConclusionRouteId>(['A', 'B', 'C', 'NONE', 'FAKE']);
const OVERLAY_IDS = new Set<ConclusionOverlayId>(['CULT', 'PSYCH']);

const ROUTE_COPY: Record<ConclusionRouteId, Omit<ConclusionRouteOption, 'available' | 'progress' | 'criteria'>> = {
  A: {
    id: 'A',
    index: '01',
    title: '独居老人',
    thesis: '他隐瞒的仪式，才是死亡真正的起点。',
    accent: 'gold',
  },
  B: {
    id: 'B',
    index: '02',
    title: '两名侦探',
    thesis: '一场失控的意外，被两个人共同掩盖。',
    accent: 'blue',
  },
  C: {
    id: 'C',
    index: '03',
    title: '被遗忘的自己',
    thesis: '记忆中的空白，最终都指向你自身。',
    accent: 'red',
  },
  NONE: {
    id: 'NONE',
    index: '04',
    title: '无人是凶手',
    thesis: '这场死亡无法被简单归咎于任何一个人。',
    accent: 'silver',
  },
  FAKE: {
    id: 'FAKE',
    index: '05',
    title: '她仍然活着',
    thesis: '也许连“死亡”本身，都是被精心布置的假象。',
    accent: 'violet',
  },
};

const BASE_OVERLAY_COPY: Partial<Record<ConclusionRouteId, ConclusionOverlayOption>> = {
  A: {
    id: null,
    title: '停留在人的罪行',
    description: '只依据可以被证实的人证、物证与行为作出判断。',
    available: true,
  },
  C: {
    id: null,
    title: '停留在记忆裂缝',
    description: '把异常解释为创伤、遗忘与自我保护留下的缺口。',
    available: true,
  },
};

const CHOICES: Record<ConclusionRouteId | ConclusionOverlayId, ConclusionChoiceOption[]> = {
  A: [
    { id: 'report', endingId: 'A-1', title: '公开指认', description: '把全部证据交出去，让他的名字进入公共记录。', tone: 'resolve' },
    { id: 'private', endingId: 'A-2', title: '私下对质', description: '独自走进那扇门，要求他亲口承认一切。', tone: 'rupture' },
  ],
  B: [
    { id: 'report', endingId: 'B-1', title: '揭发掩盖', description: '撕开两人的同盟，把那晚的失控公之于众。', tone: 'resolve' },
    { id: 'accept', endingId: 'B-2', title: '接受封口', description: '接受他们给出的解释，让秘密继续沉下去。', tone: 'rupture' },
  ],
  C: [
    { id: 'accept', endingId: 'C-1', title: '承认记忆', description: '接住那段最痛苦的记忆，并承担它留下的一切。', tone: 'resolve' },
    { id: 'deny', endingId: 'C-2', title: '否认一切', description: '拒绝相信记忆中的自己，让裂缝重新合拢。', tone: 'rupture' },
  ],
  NONE: [
    { id: 'letgo', endingId: 'N-1', title: '让她离开', description: '停止寻找一个凶手，接受告别本身没有答案。', tone: 'resolve' },
    { id: 'refuse', endingId: 'N-2', title: '拒绝告别', description: '只要还没有答案，就拒绝让这段旅程结束。', tone: 'rupture' },
  ],
  FAKE: [
    { id: 'release', endingId: 'F-1', title: '放下追寻', description: '相信她选择了自己的去处，不再继续追逐踪迹。', tone: 'resolve' },
    { id: 'pursue', endingId: 'F-2', title: '继续追她', description: '沿着最后的痕迹追下去，无论前方是否仍是真实。', tone: 'rupture' },
  ],
  CULT: [
    { id: 'destroy', endingId: 'X-1', title: '摧毁仪式', description: '切断仪式留下的回路，不让它再索取任何名字。', tone: 'resolve' },
    { id: 'sacrifice', endingId: 'X-2', title: '代替献祭', description: '走进原本属于她的位置，以自己换取循环的终止。', tone: 'rupture' },
  ],
  PSYCH: [
    { id: 'wake', endingId: 'P-1', title: '选择醒来', description: '承认眼前世界的裂缝，尝试回到真实的病房。', tone: 'resolve' },
    { id: 'sink', endingId: 'P-2', title: '留在梦里', description: '拒绝门外的现实，让这段记忆永远继续播放。', tone: 'rupture' },
  ],
};

function numberAt(variables: ConclusionVariables, path: string): number {
  const value = Number(getVariablePath(variables, path) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function numericCriterion(id: string, label: string, value: number, target: number): ConclusionCriterion {
  return {
    id,
    label,
    valueLabel: `${Math.min(value, target)} / ${target}`,
    progress: clampProgress(value / target),
    met: value >= target,
  };
}

function routeCriteria(route: ConclusionRouteId, variables: ConclusionVariables): ConclusionCriterion[] {
  const oldMan = numberAt(variables, 'suspicion.old-man');
  const detectiveA = numberAt(variables, 'suspicion.detective-a');
  const detectiveB = numberAt(variables, 'suspicion.detective-b');
  const self = numberAt(variables, 'suspicion.self');

  switch (route) {
    case 'A':
      return [numericCriterion('old-man', '对独居老人的怀疑', oldMan, 50)];
    case 'B': {
      const detective = Math.max(detectiveA, detectiveB);
      return [numericCriterion('detectives', '任一侦探的嫌疑', detective, 50)];
    }
    case 'C':
      return [numericCriterion('self', '对自身记忆的怀疑', self, 50)];
    case 'NONE': {
      const letters = arrayLength(variables.letterFragments);
      const progress = numberAt(variables, 'tripProgress');
      const suspectsBelowThreshold = [oldMan, detectiveA, detectiveB, self].every(value => value < 50);
      return [
        numericCriterion('letters', '拼合信件碎片', letters, 3),
        numericCriterion('journey', '完成整段旅程', progress, 100),
        {
          id: 'no-lock',
          label: '主要嫌疑均未锁死',
          valueLabel: suspectsBelowThreshold ? '成立' : '不成立',
          progress: suspectsBelowThreshold ? 1 : 0,
          met: suspectsBelowThreshold,
        },
      ];
    }
    case 'FAKE':
      return [numericCriterion('fake-evidence', '收集生还迹象', arrayLength(variables.fakeEvidence), 3)];
  }
}

export function isConclusionRouteId(value: unknown): value is ConclusionRouteId {
  return typeof value === 'string' && ROUTE_IDS.has(value as ConclusionRouteId);
}

export function isConclusionOverlayId(value: unknown): value is ConclusionOverlayId {
  return typeof value === 'string' && OVERLAY_IDS.has(value as ConclusionOverlayId);
}

export function getConclusionRoutes(variables: ConclusionVariables): ConclusionRouteOption[] {
  return (Object.keys(ROUTE_COPY) as ConclusionRouteId[]).map(id => {
    const criteria = routeCriteria(id, variables);
    const available = criteria.every(item => item.met);
    const progress = criteria.length > 0
      ? criteria.reduce((sum, item) => sum + item.progress, 0) / criteria.length
      : 0;
    return { ...ROUTE_COPY[id], criteria, available, progress };
  });
}

export function lockConclusionRoute(
  variables: ConclusionVariables,
  route: ConclusionRouteId,
): ConclusionDecision {
  const locked = variables.lockedRoute;
  if (locked && locked !== route) {
    return { accepted: false, value: variables, reason: '本轮路线已经锁定，无法重新指认。' };
  }
  const option = getConclusionRoutes(variables).find(item => item.id === route);
  if (!option?.available) {
    return { accepted: false, value: variables, reason: '支撑这条指认的证据尚未达到门槛。' };
  }
  const routesLockedEver = Array.isArray(variables.routesLockedEver)
    ? variables.routesLockedEver.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    accepted: true,
    value: {
      ...variables,
      lockedRoute: route,
      overlay: null,
      finalChoice: null,
      routesLockedEver: routesLockedEver.includes(route)
        ? routesLockedEver
        : [...routesLockedEver, route],
    },
  };
}

function eligibleDeepOverlay(variables: ConclusionVariables): ConclusionOverlayOption | null {
  if (
    variables.lockedRoute === 'A'
    && numberAt(variables, 'cycleCount') >= 4
    && arrayLength(variables.cultClues) >= 3
  ) {
    return {
      id: 'CULT',
      title: '仪式确实存在',
      description: '把重复、献祭记录与异常现象视为同一个真实仪式的残留。',
      available: true,
    };
  }
  if (
    variables.lockedRoute === 'C'
    && numberAt(variables, 'sanity') < 20
    && arrayLength(variables.worldGlitchClues) >= 3
  ) {
    return {
      id: 'PSYCH',
      title: '世界是一段重构',
      description: '把循环视为病房意识对创伤与记忆的持续重演。',
      available: true,
    };
  }
  return null;
}

export function getConclusionOverlays(variables: ConclusionVariables): ConclusionOverlayOption[] {
  if (!isConclusionRouteId(variables.lockedRoute)) return [];
  const base = BASE_OVERLAY_COPY[variables.lockedRoute];
  if (!base) return [];
  const deep = eligibleDeepOverlay(variables);
  return deep ? [base, deep] : [base];
}

export function selectConclusionOverlay(
  variables: ConclusionVariables,
  overlay: ConclusionOverlayId | null,
): ConclusionDecision {
  if (!isConclusionRouteId(variables.lockedRoute)) {
    return { accepted: false, value: variables, reason: '必须先完成路线指认。' };
  }
  if (variables.finalChoice) {
    return { accepted: false, value: variables, reason: '最终选择已经作出。' };
  }
  const available = getConclusionOverlays(variables).some(option => option.id === overlay && option.available);
  if (!available) {
    return { accepted: false, value: variables, reason: '这层解释尚未被足够的证据支持。' };
  }
  return { accepted: true, value: { ...variables, overlay } };
}

export function getConclusionChoices(variables: ConclusionVariables): ConclusionChoiceOption[] {
  if (!isConclusionRouteId(variables.lockedRoute)) return [];
  const effectiveRoute = isConclusionOverlayId(variables.overlay)
    ? variables.overlay
    : variables.lockedRoute;
  return CHOICES[effectiveRoute].map(choice => ({ ...choice }));
}

export function chooseConclusion(
  variables: ConclusionVariables,
  choiceId: ConclusionChoiceId,
): FinalConclusionDecision {
  const choice = getConclusionChoices(variables).find(item => item.id === choiceId);
  if (!choice) {
    return { accepted: false, value: variables, reason: '这个选择不属于当前结论路线。' };
  }
  if (variables.finalChoice && variables.finalChoice !== choiceId) {
    return { accepted: false, value: variables, reason: '最终选择已经作出，无法改写。' };
  }
  return {
    accepted: true,
    value: { ...variables, finalChoice: choiceId },
    endingId: choice.endingId,
  };
}
