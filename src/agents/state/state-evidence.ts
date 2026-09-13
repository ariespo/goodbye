import type { MysteryTruthGraph, RevealLevel, WriterPacket } from '../mystery/types';

export interface StateEvidenceAuthority {
  newEvidence: Array<{ id: string; actorIds: string[]; text: string }>;
}

/** Build once from the approved packet and pre-turn knowledge, never model output. */
export function buildStateEvidenceAuthority(
  packet: Pick<WriterPacket, 'authorizedFacts'>,
  graph: MysteryTruthGraph,
  preTurnKnowledge: Record<string, RevealLevel>,
  preTurnClueIds: string[] = [],
  aliasToFactId: Record<string, string> = {},
): StateEvidenceAuthority {
  // Atmosphere never contributes suspicion. A later authorized hint can be the
  // first evidence for that fact, including during investigation days 1–3.
  const known = new Set([
    ...Object.entries(preTurnKnowledge).filter(([, level]) => level !== 'atmosphere').map(([id]) => id),
    ...preTurnClueIds,
  ]);
  const seen = new Set<string>();
  const newEvidence: StateEvidenceAuthority['newEvidence'] = [];
  for (const fact of packet.authorizedFacts) {
    const canonicalId = aliasToFactId[fact.id] ?? fact.id;
    if (known.has(canonicalId) || seen.has(canonicalId)) continue;
    if (fact.level !== 'hint' && fact.level !== 'clue' && fact.level !== 'confirmation') continue;
    const targets = graph.facts.find(item => item.id === canonicalId)?.suspicionTargets;
    if (!targets?.length) continue;
    seen.add(canonicalId);
    newEvidence.push({ id: `fact:${fact.id}`, actorIds: [...new Set(targets)], text: fact.text });
  }
  return { newEvidence };
}
