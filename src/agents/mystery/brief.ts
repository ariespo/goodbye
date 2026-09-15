import { isRevealAtMost, lowerRevealLevel, revealLevelRank } from './reveal-level';
import {
  REVEAL_LEVELS,
  type MysteryBrief,
  type MysteryFact,
  type MysteryTruthGraph,
  type ProjectedFact,
  type RevealBudget,
  type RevealLevel,
  type TruthContext,
} from './types';
import { projectCharacterPerformances } from '../../data/characterPerformance';
import { buildNpcPlayerKnowledgeBrief } from '../../data/npcPlayerKnowledge';
import { getVerifiedItineraryProgress } from './itinerary';

/** Fixed public scene cast; this is neither an encounter list for home nor case knowledge. */
export const FIXED_LOCATION_NPC_IDS: Readonly<Record<string, readonly string[]>> = {
  supermarket: ['chen-huihui'],
  'community-hospital': ['detective-b'],
  'old-man-building': ['old-man'],
  'senpai-building': ['touko'],
  school: ['school-guard'],
};

function budgetFor(context: TruthContext): RevealBudget {
  if (context.cycleCount < 4) {
    return {
      maxNewFacts: 1,
      maxRevealLevel: 'clue',
      allowConfirmation: false,
      reason: '前三个重复日每回合至多取得一条非排他线索；不能确认罪行或揭示解答。',
    };
  }
  if (context.lockedRoute) {
    return {
      maxNewFacts: 3,
      maxRevealLevel: 'confirmation',
      allowConfirmation: true,
      reason: `路线 ${context.lockedRoute} 已锁定，可进入确认层。`,
    };
  }
  return {
    maxNewFacts: 2,
    maxRevealLevel: 'clue',
    allowConfirmation: false,
    reason: '复盘阶段允许明确线索，但完整答案必须等待锁线。',
  };
}

function highestDefinedLevel(fact: MysteryFact, maximum: RevealLevel): RevealLevel | null {
  for (let index = revealLevelRank(maximum); index >= 0; index -= 1) {
    const level = REVEAL_LEVELS[index];
    if (fact.revelations[level]) return level;
  }
  return null;
}

function project(fact: MysteryFact, maximum: RevealLevel): ProjectedFact | null {
  const level = highestDefinedLevel(fact, maximum);
  const text = level ? fact.revelations[level] : undefined;
  return level && text ? { id: fact.id, route: fact.route, kind: fact.kind, level, text } : null;
}

function routeCap(fact: MysteryFact, context: TruthContext): RevealLevel | null {
  if (fact.kind === 'solution' && (context.cycleCount < 4 || !context.lockedRoute)) return null;
  if (fact.route === 'shared') return 'confirmation';
  if (fact.route === 'CULT' || fact.route === 'PSYCH') {
    if (fact.availability.requiredBaseRoute && context.lockedRoute !== fact.availability.requiredBaseRoute) {
      return null;
    }
    if (context.activeOverlay && context.activeOverlay !== fact.route) return null;
    if (context.activeOverlay === fact.route) {
      return fact.availability.maxRevealAfterRouteLock ?? 'confirmation';
    }
    if (fact.availability.requiresOverlayLock) return null;
    return fact.availability.maxRevealBeforeRouteLock ?? 'hint';
  }
  if (context.lockedRoute && context.lockedRoute !== fact.route) return null;
  if (context.lockedRoute === fact.route) {
    return fact.availability.maxRevealAfterRouteLock ?? 'confirmation';
  }
  if (fact.availability.requiresRouteLock) return null;
  return fact.availability.maxRevealBeforeRouteLock ?? 'hint';
}

function unavailableReason(fact: MysteryFact, context: TruthContext): string | null {
  const { availability } = fact;
  const hasClue = (id: string) => context.playerKnowledge[id] === 'clue' || context.playerKnowledge[id] === 'confirmation';
  if (availability.requiredBaseRoute && context.lockedRoute !== availability.requiredBaseRoute) {
    return `需要先锁定路线 ${availability.requiredBaseRoute}。`;
  }
  if (availability.requiresOverlayLock && context.activeOverlay !== fact.route) {
    return '完整解释需要先锁定对应解释层。';
  }
  if (availability.minCycle && context.cycleCount < availability.minCycle) {
    return `需要第 ${availability.minCycle} 轮或之后。`;
  }
  if (availability.notBeforeTime) {
    const instant = context.currentTime ? new Date(context.currentTime) : null;
    const [hour, minute] = availability.notBeforeTime.split(':').map(Number);
    if (!instant || !Number.isFinite(instant.getTime()) || instant.getHours() * 60 + instant.getMinutes() < hour * 60 + minute) {
      return `本日 ${availability.notBeforeTime} 前不能新取得该通报或核验结果；已经获得的材料只能按原有层级回忆。`;
    }
  }
  if (availability.locations?.length && !availability.locations.includes(context.currentLocation)) {
    return '当前地点无法取得该事实。';
  }
  if (availability.requiredClueIds?.some((id) => !hasClue(id))) {
    return '缺少前置线索。';
  }
  if (
    availability.requiredAnyClueIds?.length
    && !availability.requiredAnyClueIds.some(hasClue)
  ) {
    return '缺少任一可替代前置线索。';
  }
  if (availability.requiredConfirmedFactIds?.some(id => context.playerKnowledge[id] !== 'confirmation')) {
    return '必须先确认基础路线事实。';
  }
  if (
    availability.minAffinity
    && (context.affinity?.[availability.minAffinity.actorId] ?? 0) < availability.minAffinity.minimum
  ) {
    return `与 ${availability.minAffinity.actorId} 的关系尚不足以取得该事实。`;
  }
  if (
    availability.minTripProgress
    && getVerifiedItineraryProgress(context.playerKnowledge) < availability.minTripProgress
  ) {
    return `行程还原进度需要达到 ${availability.minTripProgress}。`;
  }
  if (availability.maxSanity !== undefined && (context.sanity ?? 100) > availability.maxSanity) {
    return `理智需要降至 ${availability.maxSanity} 或以下。`;
  }
  if (availability.requiredKnownFactSet) {
    const known = availability.requiredKnownFactSet.factIds
      .filter(hasClue)
      .length;
    if (known < availability.requiredKnownFactSet.minimum) {
      return `该证据链至少需要 ${availability.requiredKnownFactSet.minimum} 条前置事实。`;
    }
  }
  if (availability.requiresRouteLock && context.lockedRoute !== fact.route) {
    return '完整真相需要先锁定对应路线。';
  }
  return null;
}

/** A save can retain its original material while an unsupported old solution is withheld. */
function compatibleRememberedContext(graph: MysteryTruthGraph, context: TruthContext): TruthContext {
  const remembered = { ...context, playerKnowledge: { ...context.playerKnowledge } };
  const solutions = graph.facts.filter(fact => fact.kind === 'solution');
  let removed: boolean;
  do {
    removed = false;
    for (const fact of solutions) {
      if (!remembered.playerKnowledge[fact.id]) continue;
      const availability = { ...fact.availability };
      // These restrict acquisition, not recollection of an already supported conclusion.
      delete availability.locations;
      delete availability.notBeforeTime;
      delete availability.minAffinity;
      delete availability.maxSanity;
      if (routeCap(fact, remembered) === null || unavailableReason({ ...fact, availability }, remembered)) {
        delete remembered.playerKnowledge[fact.id];
        removed = true;
      }
    }
  } while (removed);
  return remembered;
}

export function buildMysteryBrief(graph: MysteryTruthGraph, context: TruthContext): MysteryBrief {
  const revealBudget = budgetFor(context);
  const factsById = new Map(graph.facts.map((fact) => [fact.id, fact]));
  const continuityWarnings: string[] = [];

  for (const id of Object.keys(context.playerKnowledge)) {
    if (!factsById.has(id)) continuityWarnings.push(`玩家知识引用了未知事实：${id}`);
  }
  for (const id of context.unlockedClueIds) {
    if (!factsById.has(id)) continuityWarnings.push(`线索列表引用了未知事实：${id}`);
  }

  const rememberedContext = compatibleRememberedContext(graph, context);
  const playerKnownFacts = Object.entries(rememberedContext.playerKnowledge).flatMap(([id, level]) => {
    const fact = factsById.get(id);
    if (!fact) return [];
    // Remembered observations survive version selection. Exclusive conclusions do not.
    const sameVersion = fact.route === 'shared' || fact.route === context.lockedRoute || fact.route === context.activeOverlay;
    if (fact.kind === 'solution' && (!sameVersion || !context.lockedRoute || context.cycleCount < 4)) return [];
    if (fact.availability.requiresRouteLock && context.lockedRoute !== fact.route) return [];
    if (fact.availability.requiresOverlayLock && context.activeOverlay !== fact.route) return [];
    if (fact.availability.requiredBaseRoute && context.lockedRoute !== fact.availability.requiredBaseRoute) return [];
    const memoryCap = sameVersion ? routeCap(fact, context) : fact.availability.maxRevealBeforeRouteLock ?? 'hint';
    if (memoryCap === null) return [];
    const projected = project(fact, lowerRevealLevel(level, lowerRevealLevel(memoryCap, revealBudget.maxRevealLevel)));
    return projected ? [projected] : [];
  });

  const hiddenFacts: MysteryBrief['hiddenFacts'] = [];
  const usableFacts: MysteryBrief['usableFacts'] = [];
  const forbiddenReveals: MysteryBrief['forbiddenReveals'] = [];

  for (const fact of graph.facts) {
    const cap = routeCap(fact, context);
    const reason = cap === null
      ? (context.lockedRoute && context.lockedRoute !== fact.route
          ? `路线 ${context.lockedRoute} 已锁定，其他路线事实不可用。`
          : '该事实需要锁定对应路线。')
      : unavailableReason(fact, rememberedContext);
    if (reason || cap === null) {
      hiddenFacts.push({ id: fact.id, route: fact.route, kind: fact.kind, reason: reason ?? '当前不可用。' });
      forbiddenReveals.push({ factId: fact.id, forbiddenAbove: null, reason: reason ?? '当前不可用。' });
      continue;
    }

    const maximum = lowerRevealLevel(cap, revealBudget.maxRevealLevel);
    const highest = highestDefinedLevel(fact, maximum);
    if (!highest) {
      hiddenFacts.push({ id: fact.id, route: fact.route, kind: fact.kind, reason: '当前揭示预算不足。' });
      forbiddenReveals.push({ factId: fact.id, forbiddenAbove: null, reason: '当前揭示预算不足。' });
      continue;
    }

    const revealOptions = REVEAL_LEVELS
      .filter((level) => isRevealAtMost(level, highest) && fact.revelations[level])
      .map((level) => ({
        id: fact.id,
        route: fact.route,
        kind: fact.kind,
        level,
        text: fact.revelations[level] as string,
      }));
    const deliveryNpcIds = graph.npcKnowledge
      .filter((entry) => entry.factId === fact.id && context.activeNpcIds.includes(entry.npcId))
      .map((entry) => entry.npcId);
    usableFacts.push({
      id: fact.id,
      route: fact.route,
      kind: fact.kind,
      maxRevealLevel: highest,
      revealOptions,
      deliveryNpcIds,
    });
    if (highest !== 'confirmation') {
      forbiddenReveals.push({ factId: fact.id, forbiddenAbove: highest, reason: `本回合最多揭示到 ${highest}。` });
    }
  }

  // NPC 的本轮经历必须服从当前事实门槛；即使旧存档残留了玩家知识，
  // 也不能绕过路线、地点或轮回条件把隐藏现实重新塞给角色。
  const availableFactIds = new Set(usableFacts.map(fact => fact.id));
  const npcKnowledge = context.activeNpcIds.map((npcId) => ({
    npcId,
    facts: graph.npcKnowledge
      .filter((entry) => entry.npcId === npcId && availableFactIds.has(entry.factId))
      .map(({ factId, maxRevealLevel, stance }) => ({ factId, maxRevealLevel, stance })),
  }));

  const playerPresentation = context.playerPresentation ?? {
    locations: [],
    entities: [],
    namingRules: ['不得擅自补充玩家尚未获得的人物身份、地点名称或地址。'],
    allowedDiscoveries: [],
  };

  return {
    graphVersion: graph.version,
    routeMode: context.lockedRoute ?? 'exploratory',
    playerKnownFacts,
    usableFacts,
    hiddenFacts,
    allowedRedHerrings: usableFacts
      .filter((fact) => fact.kind === 'red-herring')
      .flatMap((fact) => fact.revealOptions.filter((option) => option.level === fact.maxRevealLevel).map((option) => option.text)),
    npcKnowledge,
    forbiddenReveals,
    revealBudget,
    continuityWarnings,
    playerPresentation,
    characterPerformances: projectCharacterPerformances(playerPresentation, context.activeNpcIds),
    // Address permissions are a directory for possible planned destinations, not a presence list.
    npcPlayerKnowledge: buildNpcPlayerKnowledgeBrief(
      [...new Set([...context.activeNpcIds, ...Object.values(FIXED_LOCATION_NPC_IDS).flat()])],
      context.playerIdentity,
      context.playerIdentityVariables,
    ),
    sceneContract: context.sceneContract,
    sceneContracts: context.sceneContracts,
  };
}
