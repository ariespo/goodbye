import type {
  MysteryBrief,
  MysteryTruthGraph,
} from './types';

export interface FactAliasTable {
  aliasToFactId: Record<string, string>;
  factIdToAlias: Record<string, string>;
}

export function createFactAliasTable(graph: MysteryTruthGraph): FactAliasTable {
  const aliasToFactId: Record<string, string> = {};
  const factIdToAlias: Record<string, string> = {};
  graph.facts.forEach((fact, index) => {
    const alias = `F${String(index + 1).padStart(3, '0')}`;
    aliasToFactId[alias] = fact.id;
    factIdToAlias[fact.id] = alias;
  });
  return { aliasToFactId, factIdToAlias };
}

function aliasFactId(table: FactAliasTable, factId: string): string {
  const alias = table.factIdToAlias[factId];
  if (!alias) throw new Error(`事实 ${factId} 缺少不透明别名。`);
  return alias;
}

/**
 * Director 只看到可用事实的不透明句柄。隐藏事实的 ID、路线、类型和数量均不下发。
 * 该投影仍满足 MysteryBrief 结构，因此原有确定性审查可以直接审查别名计划。
 */
export function buildAliasedMysteryBrief(
  brief: MysteryBrief,
  table: FactAliasTable,
): MysteryBrief {
  const usableAliases = new Set(brief.usableFacts.map(fact => aliasFactId(table, fact.id)));
  const knownAliases = new Set(brief.playerKnownFacts.map(fact => aliasFactId(table, fact.id)));

  return {
    ...brief,
    playerKnownFacts: brief.playerKnownFacts.map(fact => ({
      ...fact,
      id: aliasFactId(table, fact.id),
    })),
    usableFacts: brief.usableFacts.map(fact => ({
      ...fact,
      id: aliasFactId(table, fact.id),
      revealOptions: fact.revealOptions.map(option => ({
        ...option,
        id: aliasFactId(table, option.id),
      })),
    })),
    hiddenFacts: [],
    npcKnowledge: brief.npcKnowledge.map(npc => ({
      ...npc,
      facts: npc.facts.flatMap(fact => {
        const alias = table.factIdToAlias[fact.factId];
        return alias && (usableAliases.has(alias) || knownAliases.has(alias))
          ? [{ ...fact, factId: alias }]
          : [];
      }),
    })),
    forbiddenReveals: brief.forbiddenReveals.flatMap(item => {
      const alias = table.factIdToAlias[item.factId];
      return alias && (usableAliases.has(alias) || knownAliases.has(alias))
        ? [{ ...item, factId: alias }]
        : [];
    }),
    continuityWarnings: brief.continuityWarnings.length > 0
      ? [`检测到 ${brief.continuityWarnings.length} 条旧存档事实引用异常；不得据此补写事实。`]
      : [],
    saturationPivot: brief.saturationPivot
      ? { ...brief.saturationPivot, factId: aliasFactId(table, brief.saturationPivot.factId) }
      : undefined,
  };
}

export function resolveFactAlias(table: FactAliasTable, alias: string): string | null {
  return table.aliasToFactId[alias] ?? null;
}
