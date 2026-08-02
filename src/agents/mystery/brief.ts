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

function budgetFor(context: TruthContext): RevealBudget {
  if (context.lockedRoute) {
    return {
      maxNewFacts: 3,
      maxRevealLevel: 'confirmation',
      allowConfirmation: true,
      reason: `路线 ${context.lockedRoute} 已锁定，可进入确认层。`,
    };
  }
  if (context.cycleCount >= 4) {
    return {
      maxNewFacts: 2,
      maxRevealLevel: 'clue',
      allowConfirmation: false,
      reason: '复盘阶段允许明确线索，但完整答案必须等待锁线。',
    };
  }
  return {
    maxNewFacts: 1,
    maxRevealLevel: context.cycleCount >= 2 ? 'hint' : 'atmosphere',
    allowConfirmation: false,
    reason: '探索阶段限制单回合揭示量与深度。',
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
  if (availability.requiredBaseRoute && context.lockedRoute !== availability.requiredBaseRoute) {
    return `需要先锁定路线 ${availability.requiredBaseRoute}。`;
  }
  if (availability.requiresOverlayLock && context.activeOverlay !== fact.route) {
    return '完整解释需要先锁定对应解释层。';
  }
  if (availability.minCycle && context.cycleCount < availability.minCycle) {
    return `需要第 ${availability.minCycle} 轮或之后。`;
  }
  if (availability.locations?.length && !availability.locations.includes(context.currentLocation)) {
    return '当前地点无法取得该事实。';
  }
  if (availability.requiredClueIds?.some((id) => !context.unlockedClueIds.includes(id))) {
    return '缺少前置线索。';
  }
  if (
    availability.requiredAnyClueIds?.length
    && !availability.requiredAnyClueIds.some((id) => context.unlockedClueIds.includes(id))
  ) {
    return '缺少任一可替代前置线索。';
  }
  if (
    availability.minSuspicion
    && (context.suspicion[availability.minSuspicion.actorId] ?? 0) < availability.minSuspicion.minimum
  ) {
    return `对 ${availability.minSuspicion.actorId} 的怀疑度不足。`;
  }
  if (
    availability.minAffinity
    && (context.affinity?.[availability.minAffinity.actorId] ?? 0) < availability.minAffinity.minimum
  ) {
    return `与 ${availability.minAffinity.actorId} 的关系尚不足以取得该事实。`;
  }
  if (
    availability.minTripProgress
    && (context.tripProgress ?? 0) < availability.minTripProgress
  ) {
    return `行程还原进度需要达到 ${availability.minTripProgress}。`;
  }
  if (availability.maxSanity !== undefined && (context.sanity ?? 100) > availability.maxSanity) {
    return `理智需要降至 ${availability.maxSanity} 或以下。`;
  }
  if (availability.requiredKnownFactSet) {
    const known = availability.requiredKnownFactSet.factIds
      .filter(id => context.unlockedClueIds.includes(id))
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

  const playerKnownFacts = Object.entries(context.playerKnowledge).flatMap(([id, level]) => {
    const fact = factsById.get(id);
    if (!fact) return [];
    const projected = project(fact, level);
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
      : unavailableReason(fact, context);
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

  const npcKnowledge = context.activeNpcIds.map((npcId) => ({
    npcId,
    facts: graph.npcKnowledge
      .filter((entry) => entry.npcId === npcId)
      .map(({ factId, maxRevealLevel, stance }) => ({ factId, maxRevealLevel, stance })),
  }));

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
    playerPresentation: context.playerPresentation ?? {
      locations: [],
      entities: [],
      namingRules: ['不得擅自补充玩家尚未获得的人物身份、地点名称或地址。'],
      allowedDiscoveries: [],
    },
  };
}
