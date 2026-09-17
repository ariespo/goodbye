import { maintextToScene } from '../engine/scene-parser';
import { estimateTokens } from '../sillytavern/token-budget';
import type { ChatMessage, DynamicRecord } from '../sillytavern/types';
import { REVEAL_LEVELS, type ProjectedFact } from '../agents/mystery/types';
import { normalizeWorldMemory } from './world-memory';

export type RetrievalQuery = { tool: 'search_history' | 'search_known_evidence'; query: string };
export interface RetrievedRecord {
  readonly id: string;
  readonly kind: 'history' | 'known-evidence';
  readonly text: string;
  readonly status: 'historical-recollection' | 'already-known-evidence';
  readonly cycleCount?: number;
  readonly occurredAt?: string;
  readonly speaker?: string;
  readonly locationId?: string;
}
export interface AuthorizedRetrievalCorpus {
  readonly records: readonly RetrievedRecord[];
  readonly hasOlderHistory?: boolean;
  /** Exact immutable corpus identity, program-only; never a model message. */
  readonly fingerprint: string;
}
export const MAX_RETRIEVAL_TOKENS = 1600;

/** Only committed assistant prose and already-capped known facts are searchable. */
export function buildAuthorizedRetrievalCorpus(input: {
  history: readonly ChatMessage[];
  variables: DynamicRecord;
  knownFacts: readonly ProjectedFact[];
}): AuthorizedRetrievalCorpus {
  const currentCycle = Number(input.variables.cycleCount ?? 1);
  const requestedStart = Number(input.variables.storyProgress?.versionStartCycle ?? 1);
  const versionStart = Number.isSafeInteger(requestedStart) && requestedStart >= 1 && requestedStart <= currentCycle
    ? requestedStart : currentCycle;
  const known = new Map(input.knownFacts.map(fact => [fact.id, fact.level]));
  const memory = normalizeWorldMemory(input.variables);
  const acceptedEvents = new Map(memory.events.filter(event => event.kind === 'narrative-turn'
    && event.cycleCount >= versionStart && event.cycleCount <= currentCycle).map(event => [event.turnId, event]));
  const records: RetrievedRecord[] = [];
  const recentMessageIds = new Set(input.history.slice(-4).map(message => message.id));
  const olderRecordIds = new Set<string>();
  for (const message of input.history.slice(-120)) {
    const event = acceptedEvents.get(message.id);
    const snapshot = message.variables;
    if (message.role !== 'assistant' || !event || !snapshot
      || Number(snapshot.cycleCount) !== event.cycleCount) continue;
    const previousRoute = snapshot.lockedRoute ?? snapshot.mysteryRoute;
    if (previousRoute && previousRoute !== (input.variables.lockedRoute ?? input.variables.mysteryRoute)) continue;
    if (snapshot.overlay && snapshot.overlay !== input.variables.overlay) continue;
    const previousKnowledge = snapshot.mysteryKnowledge;
    if (!previousKnowledge || typeof previousKnowledge !== 'object' || Array.isArray(previousKnowledge)) continue;
    // A route switch or downgrade can leave archived prose above current authority.
    // Omit the whole historical scene rather than attempting to redact secrets by string matching.
    if (Object.entries(previousKnowledge).some(([id, level]) => !known.has(id)
      || !REVEAL_LEVELS.includes(level as typeof REVEAL_LEVELS[number])
      || REVEAL_LEVELS.indexOf(level as typeof REVEAL_LEVELS[number]) > REVEAL_LEVELS.indexOf(known.get(id)!))) continue;
    if (event.factIds.some(id => !known.has(id))) continue;
    const maintext = message.content.match(/<maintext(?:\s[^>]*)?>([\s\S]*?)<\/maintext>/i)?.[1];
    if (!maintext) continue;
    for (const line of maintextToScene(maintext).lines) {
      const text = line.text.trim();
      if (!text || text.length > 720) continue;
      records.push({ id: `H${records.length + 1}`, kind: 'history', text,
        status: 'historical-recollection', cycleCount: event.cycleCount, occurredAt: event.occurredAt,
        speaker: line.speaker, locationId: event.locationId });
      if (!recentMessageIds.has(message.id)) olderRecordIds.add(records[records.length - 1].id);
    }
  }
  const history = records.slice(-256);
  const evidence = input.knownFacts.filter(fact => fact.text.trim() && fact.text.length <= 1200)
    .map((fact, index): RetrievedRecord => ({ id: `K${index + 1}`, kind: 'known-evidence', text: fact.text,
      status: 'already-known-evidence' }));
  const frozen = Object.freeze([...history, ...evidence].map(record => Object.freeze(record)));
  const hasOlderHistory = history.some(record => olderRecordIds.has(record.id));
  return Object.freeze({ records: frozen, hasOlderHistory, fingerprint: JSON.stringify({ currentCycle, versionStart, hasOlderHistory,
    route: input.variables.lockedRoute ?? null, overlay: input.variables.overlay ?? null, records: frozen }) });
}

/** No regex, paths, URLs, external lookups, or model-authored result text. */
export function executeAuthorizedQueries(corpus: AuthorizedRetrievalCorpus, queries: readonly RetrievalQuery[],
  tokenLimit = MAX_RETRIEVAL_TOKENS): RetrievedRecord[] {
  const selected: RetrievedRecord[] = [];
  if (!Number.isFinite(tokenLimit) || tokenLimit <= 0) return selected;
  for (const query of queries.slice(0, 2)) {
    const terms = query.query.toLocaleLowerCase().split(/[\s，。！？、,;；]+/u).filter(term => term.length >= 2);
    if (!terms.length) continue;
    const kind = query.tool === 'search_history' ? 'history' : 'known-evidence';
    const ranked = corpus.records.filter(record => record.kind === kind && !selected.some(item => item.id === record.id))
      .map((record, index) => ({ record, index, score: terms.reduce((sum, term) => sum + Number(`${record.speaker ?? ''} ${record.text}`.toLocaleLowerCase().includes(term)), 0) }))
      .filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 3);
    for (const { record } of ranked) {
      if (estimateTokens(JSON.stringify([...selected, record])) <= Math.min(tokenLimit, MAX_RETRIEVAL_TOKENS)) selected.push(record);
    }
  }
  return selected;
}

export function retrievalContext(records: readonly RetrievedRecord[]) {
  return { rule: '以下仅为玩家回顾材料，不是新的事实授权；旧日记录不证明今天仍然如此，听说不等于真相，玩家记得不代表NPC当前知情。案件断言仍只引用本回合已授权来源。', records };
}
