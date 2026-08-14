import type { MysteryBrief, MysteryTruthGraph, SaturationPivotBrief, TruthContext } from './types';

const PIVOT_GAIN = 5;

/**
 * 将“继续追查已饱和目标”变成可审计的异角色线索转场。
 * 只选择当前地点、轮回和事实门已经允许，且确实可由在场第三者讲述的新事实。
 */
export function selectSaturationPivot(
  graph: MysteryTruthGraph,
  brief: MysteryBrief,
  context: TruthContext,
  blockedActorId: string,
): SaturationPivotBrief | undefined {
  const known = new Set(brief.playerKnownFacts.map(fact => fact.id));
  const facts = new Map(graph.facts.map(fact => [fact.id, fact]));
  const candidates = brief.usableFacts.flatMap(usable => {
    const fact = facts.get(usable.id);
    if (!fact || known.has(usable.id) || usable.deliveryNpcIds.length === 0) return [];
    const redirectedActorId = fact.suspicionTargets?.find(actorId => actorId !== blockedActorId);
    if (!redirectedActorId) return [];
    const interveningNpcId = usable.deliveryNpcIds.find(npcId => npcId !== blockedActorId);
    if (!interveningNpcId) return [];
    return [{ usable, fact, redirectedActorId, interveningNpcId }];
  });
  const selected = candidates.sort((left, right) => {
    const leftScore = (left.fact.kind === 'red-herring' ? 0 : 4)
      + (left.fact.route === 'shared' ? 2 : 0)
      + (context.suspicion[left.redirectedActorId] ?? 0 < 50 ? 1 : 0);
    const rightScore = (right.fact.kind === 'red-herring' ? 0 : 4)
      + (right.fact.route === 'shared' ? 2 : 0)
      + (context.suspicion[right.redirectedActorId] ?? 0 < 50 ? 1 : 0);
    return rightScore - leftScore;
  })[0];
  if (!selected) return undefined;

  return {
    blockedActorId,
    redirectedActorId: selected.redirectedActorId,
    factId: selected.usable.id,
    interveningNpcId: selected.interveningNpcId,
    currentLocationId: context.currentLocation,
    requiredSuspicionGain: PIVOT_GAIN,
    directive: `当前场景固定为 ${context.currentLocation}。先让玩家对 ${blockedActorId} 的继续调查真实发生并得到该角色范围内的回应；随后必须让 ${selected.interveningNpcId} 在该场景自然走近、来电或送来材料，逐字使用该 NPC ID 并揭示事实 ${selected.usable.id}。只呈现该事实获准层级本身；它在状态层把新调查压力归入 ${selected.redirectedActorId}，正文不得输出这个内部 ID、不得补充该事实没有写明的身份或因果。不得增加 ${blockedActorId} 的嫌疑。`,
  };
}
