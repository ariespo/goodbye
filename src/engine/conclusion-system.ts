import { getVariablePath } from '../sillytavern/vars-merger';
import { ROUTE_SUPPORT_FACTS, ROUTE_CAUSAL_FACTS, SOLUTION_FACTS, FAKE_PREPARATION_FACTS, OVERLAY_BASE_ROUTES, OVERLAY_EVIDENCE_FACTS } from './story-rules';
import { getVerifiedItineraryProgress } from '../agents/mystery/itinerary';

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
    thesis: '独行经过、栏杆故障与伤情，需要一起解释这场意外。',
    accent: 'silver',
  },
  FAKE: {
    id: 'FAKE',
    index: '05',
    title: '她仍然活着',
    thesis: '初报中的身份疑点，需要与她本人的生还证据核对。',
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
    { id: 'private', endingId: 'A-2', title: '私下报复', description: '带着报复的打算独自上楼，让暴力替你作最后的回答。', tone: 'rupture' },
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
    { id: 'letgo', endingId: 'N-1', title: '接受告别', description: '接受已经查明的事故经过，留下她曾想怎样生活的那封信。', tone: 'resolve' },
    { id: 'refuse', endingId: 'N-2', title: '拒绝告别', description: '只要还没有答案，就拒绝让这段旅程结束。', tone: 'rupture' },
  ],
  FAKE: [
    { id: 'release', endingId: 'F-1', title: '放下追寻', description: '相信她选择了自己的去处，不再继续追逐踪迹。', tone: 'resolve' },
    { id: 'pursue', endingId: 'F-2', title: '继续追她', description: '继续寻找她；你已经知道，跟踪你的人也可能因此找到她。', tone: 'rupture' },
  ],
  CULT: [
    { id: 'destroy', endingId: 'X-1', title: '摧毁仪式', description: '切断仪式留下的回路，不让它再索取任何名字。', tone: 'resolve' },
    { id: 'sacrifice', endingId: 'X-2', title: '封存清晨', description: '用自己的余生维持同一个清晨，让循环永远继续。', tone: 'rupture' },
  ],
  PSYCH: [
    { id: 'wake', endingId: 'P-1', title: '接受帮助', description: '回到治疗与调查中，承担已经确认的伤害和责任。', tone: 'resolve' },
    { id: 'sink', endingId: 'P-2', title: '留在梦里', description: '拒绝门外的现实，让这段记忆永远继续播放。', tone: 'rupture' },
  ],
};

function numberAt(variables: ConclusionVariables, path: string): number {
  const value = Number(getVariablePath(variables, path) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function knowledgeLevel(variables: ConclusionVariables, factId: string): unknown {
  return getVariablePath(variables, `mysteryKnowledge.${factId}`);
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
      const progress = getVerifiedItineraryProgress((variables.mysteryKnowledge ?? {}) as Record<string, unknown>);
      return [
        numericCriterion('journey', '核对六处行程材料', progress, 100),
      ];
    }
    case 'FAKE':
      return [numericCriterion('departure-preparation', '核实一项离城准备',
        FAKE_PREPARATION_FACTS.filter(id => hasClue(variables, id)).length, 1)];
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
    const cycleCount = numberAt(variables, 'cycleCount');
    const completedLoops = Math.max(0, cycleCount - 1);
    const loopGate = numericCriterion('completed-loops', '完成整日轮回', completedLoops, 3);
    const supportFacts = ROUTE_SUPPORT_FACTS[id];
    const knownSupportFacts = supportFacts.filter(factId =>
      ['clue', 'confirmation'].includes(String(knowledgeLevel(variables, factId)))
    ).length;
    const supportGate = supportFacts.length > 0
      ? [numericCriterion('route-facts', '路线关键事实', knownSupportFacts, supportFacts.length)]
      : [];
    const criteria = [loopGate, ...supportGate, ...routeCriteria(id, variables)];
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
    && OVERLAY_EVIDENCE_FACTS.CULT.filter(id => hasClue(variables, id)).length >= 3
    && knowledgeLevel(variables, SOLUTION_FACTS.A) === 'confirmation'
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
    && numberAt(variables, 'cycleCount') >= 4
    && numberAt(variables, 'sanity') < 20
    && OVERLAY_EVIDENCE_FACTS.PSYCH.filter(id => hasClue(variables, id)).length >= 3
    && knowledgeLevel(variables, SOLUTION_FACTS.C) === 'confirmation'
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

export function getConclusionFinalReadiness(variables: ConclusionVariables): ConclusionCriterion {
  const baseRoute = isConclusionRouteId(variables.lockedRoute) ? variables.lockedRoute : null;
  const effectiveRoute = isConclusionOverlayId(variables.overlay)
    ? variables.overlay
    : baseRoute;
  const factId = effectiveRoute ? SOLUTION_FACTS[effectiveRoute] : null;
  const overlayCompatible = !variables.overlay || (isConclusionOverlayId(variables.overlay)
    && OVERLAY_BASE_ROUTES[variables.overlay] === baseRoute
    && OVERLAY_EVIDENCE_FACTS[variables.overlay].filter(id => hasClue(variables, id)).length >= 3);
  const routeReady = baseRoute && getConclusionRoutes(variables).find(route => route.id === baseRoute)?.available;
  const causalReady = baseRoute && ROUTE_CAUSAL_FACTS[baseRoute].every(id => hasClue(variables, id));
  const baseConfirmed = baseRoute && knowledgeLevel(variables, SOLUTION_FACTS[baseRoute]) === 'confirmation';
  const met = Boolean(numberAt(variables, 'cycleCount') >= 5 && overlayCompatible && routeReady && causalReady
    && baseConfirmed && factId && knowledgeLevel(variables, factId) === 'confirmation');
  return {
    id: 'solution-confirmed',
    label: '证据推导完整且最终事实已确认',
    valueLabel: met ? '成立' : '尚未成立',
    progress: met ? 1 : 0,
    met,
  };
}

function hasClue(variables: ConclusionVariables, factId: string): boolean {
  return ['clue', 'confirmation'].includes(String(knowledgeLevel(variables, factId)));
}

/** Built-in endings use this same gate in transaction and legacy dispatch. */
export function canDispatchStoryEnding(variables: ConclusionVariables, endingId: string): boolean {
  const builtIn = Object.values(CHOICES).flat().find(choice => choice.endingId === endingId);
  if (!builtIn) return true;
  return getConclusionFinalReadiness(variables).met
    && getConclusionChoices(variables).some(choice => choice.endingId === endingId && choice.id === variables.finalChoice);
}

export function chooseConclusion(
  variables: ConclusionVariables,
  choiceId: ConclusionChoiceId,
): FinalConclusionDecision {
  if (!getConclusionFinalReadiness(variables).met) {
    return { accepted: false, value: variables, reason: '路线已指认，但最终事实尚未在剧情中被确认。' };
  }
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
