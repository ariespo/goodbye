import { revealLevelRank } from './reveal-level';
import type { MysteryTruthGraph } from './types';

export interface TruthGraphValidation {
  valid: boolean;
  errors: string[];
}

export function validateTruthGraph(graph: MysteryTruthGraph): TruthGraphValidation {
  const errors: string[] = [];
  const factIds = new Set<string>();

  for (const fact of graph.facts) {
    if (factIds.has(fact.id)) errors.push(`重复事实 ID：${fact.id}`);
    factIds.add(fact.id);
    if (!fact.canonicalTruth.trim()) errors.push(`事实 ${fact.id} 缺少 canonicalTruth。`);
    if (Object.keys(fact.revelations).length === 0) errors.push(`事实 ${fact.id} 没有可投影文本。`);
    const { maxRevealBeforeRouteLock, maxRevealAfterRouteLock } = fact.availability;
    if (
      maxRevealBeforeRouteLock
      && maxRevealAfterRouteLock
      && revealLevelRank(maxRevealBeforeRouteLock) > revealLevelRank(maxRevealAfterRouteLock)
    ) {
      errors.push(`事实 ${fact.id} 的锁线前揭示层高于锁线后。`);
    }
  }

  for (const fact of graph.facts) {
    const requirements = [
      ...(fact.availability.requiredClueIds ?? []),
      ...(fact.availability.requiredAnyClueIds ?? []),
      ...(fact.availability.requiredKnownFactSet?.factIds ?? []),
    ];
    for (const requirement of requirements) {
      if (!factIds.has(requirement)) errors.push(`事实 ${fact.id} 引用了未知前置事实：${requirement}`);
      if (requirement === fact.id) errors.push(`事实 ${fact.id} 不能依赖自身。`);
    }
  }

  for (const knowledge of graph.npcKnowledge) {
    if (!factIds.has(knowledge.factId)) {
      errors.push(`NPC ${knowledge.npcId} 引用了未知事实：${knowledge.factId}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
