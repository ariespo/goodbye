import { ContextBudgetError, estimateTokens, DEFAULT_CONTEXT_TOKENS, DEFAULT_OUTPUT_TOKENS } from '../sillytavern/token-budget';
import type { ChatMessage, ChatSession, Scene, TurnSnapshot } from '../sillytavern/types';
import { characterIdFromSpeaker } from '../data/npcPlayerKnowledge';
import { getLocationById } from '../data/locations';
import { MYSTERY_TRUTH_GRAPH } from '../agents/mystery/truth-graph';
import {
  candidateFingerprint,
  cognitionIsPublicPlayerNamePermission,
  commitmentIdFromBoundaryId,
  type CommitmentRecord,
  type DisclosureRecord,
  type ValidatedCharacterContinuityEffects,
} from './character-continuity';
import {
  BACKGROUND_HISTORY_VERSION,
  FIXED_BACKGROUND_FACTS,
  FIXED_NPC_BACKGROUND_COGNITION,
  relevantFixedBackgroundFacts,
  reviewBackgroundFactProposal,
  type BackgroundFactProposal,
  type BackgroundFactRecord,
} from '../data/backgroundHistory';

export const WORLD_MEMORY_VERSION = 2;
const MYSTERY_FACT_PROPOSITIONS = new Set(MYSTERY_TRUTH_GRAPH.facts.map(fact => `fact:${fact.id}`));

export type CognitionStatus =
  | 'observed'
  | 'heard'
  | 'inferred'
  | 'suspected'
  | 'believed'
  | 'confirmed'
  | 'disproved';

export type CognitionProvenance = 'authored-baseline' | 'accepted-turn' | 'legacy-import';
export type CognitionScope = 'day' | 'durable';

export interface WorldEventRecord {
  eventId: string;
  turnId: string;
  turnIndex: number;
  cycleCount: number;
  occurredAt: string;
  locationId: string;
  actorIds: string[];
  kind: 'narrative-turn' | 'knowledge' | 'identity' | 'fact';
  summary: string;
  evidenceLineIds: string[];
  factIds: string[];
  tags: string[];
  salience: number;
  createdAt: number;
}

export interface CognitionRecord {
  cognitionId: string;
  observerId: 'player' | string;
  propositionId: string;
  subjectId?: string;
  status: CognitionStatus;
  confidence: number;
  sourceEventIds: string[];
  firstLearnedTurn: number;
  lastUpdatedTurn: number;
  summary: string;
  identityScope?: 'full-name' | 'familiar-honorific' | 'family-nickname' | 'guardian-formal' | 'unknown';
  provenance?: CognitionProvenance;
  scope?: CognitionScope;
  acquiredCycle?: number;
  evidenceSpans?: Array<{ assertionIndex?: number; lineIndex: number; quote: string }>;
}

export interface CognitionDelta {
  observerId: 'player' | string;
  propositionId: string;
  subjectId?: string;
  status: CognitionStatus;
  confidence: number;
  summary: string;
  identityScope?: CognitionRecord['identityScope'];
  provenance?: CognitionProvenance;
  scope?: CognitionScope;
  acquiredCycle?: number;
  evidenceSpans?: CognitionRecord['evidenceSpans'];
}

export interface EpisodeMemoryRecord {
  episodeId: string;
  turnId: string;
  turnIndex: number;
  cycleCount: number;
  locationId: string;
  actorIds: string[];
  summary: string;
  factIds: string[];
  cognitionIds: string[];
  unresolvedTags: string[];
  salience: number;
  createdAt: number;
}

export interface WorldMemoryState {
  version: typeof WORLD_MEMORY_VERSION;
  canonicalTruthVersion: string;
  events: WorldEventRecord[];
  cognition: CognitionRecord[];
  episodes: EpisodeMemoryRecord[];
  softCanonFacts: BackgroundFactRecord[];
  disclosures?: DisclosureRecord[];
  commitments?: CommitmentRecord[];
  acknowledgedCommitmentBoundaryIds?: string[];
}

export interface ContextTokenBudget {
  maxContext: number;
  reservedOutput: number;
  reservedRepair: number;
  estimatedFixed: number;
  estimatedSelected: number;
}

export interface TurnContextBundle {
  version: 2;
  selectedIds: string[];
  recentMessages: ChatMessage[];
  relevantEpisodes: EpisodeMemoryRecord[];
  relevantCognition: CognitionRecord[];
  relevantBackgroundFacts: BackgroundFactRecord[];
  lorebookScanText: string;
  directorMemory: Record<string, unknown>;
  writerMemory: Record<string, unknown>;
  tokenBudget: ContextTokenBudget;
}

export interface TurnCommit {
  turnId: string;
  worldMemory: WorldMemoryState;
  knowledgeEvents: string[];
  mysteryKnowledge: Record<string, unknown>;
  playerNameKnownByNpcIds: string[];
}

const ESTABLISHED_PLAYER_NAME_SCOPES: Record<string, CognitionRecord['identityScope']> = {
  fumi: 'full-name',
  touko: 'full-name',
  'chen-huihui': 'familiar-honorific',
  'old-man': 'family-nickname',
  'liu-renguang': 'guardian-formal',
  'detective-a': 'full-name',
  'detective-b': 'full-name',
};

function uniqueStrings(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isAuthoredBaselineCognitionId(cognitionId: string): boolean {
  if (Object.hasOwn(ESTABLISHED_PLAYER_NAME_SCOPES, cognitionId.split('|')[0])
    && cognitionId.endsWith('|identity:player-name')) return true;
  return FIXED_NPC_BACKGROUND_COGNITION.some(item => cognitionId === `${item.npcId}|background:${item.factId}`);
}

function normalizeEvidenceSpans(value: unknown): NonNullable<CognitionRecord['evidenceSpans']> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const span = asRecord(item);
    if (!Number.isSafeInteger(span.lineIndex) || typeof span.quote !== 'string' || !span.quote.trim()) return [];
    return [{
      ...(Number.isSafeInteger(span.assertionIndex) ? { assertionIndex: Number(span.assertionIndex) } : {}),
      lineIndex: Number(span.lineIndex), quote: span.quote,
    }];
  });
}

function normalizeStoredCognition(value: unknown, saveCycle: number): CognitionRecord | null {
  const item = asRecord(value);
  if (typeof item.cognitionId !== 'string' || typeof item.observerId !== 'string'
    || typeof item.propositionId !== 'string' || typeof item.status !== 'string'
    || !['observed', 'heard', 'inferred', 'suspected', 'believed', 'confirmed', 'disproved'].includes(item.status)
    || typeof item.summary !== 'string' || typeof item.confidence !== 'number'
    || !Number.isFinite(item.confidence)) return null;
  if (isAuthoredBaselineCognitionId(item.cognitionId)) return null;
  const player = item.observerId === 'player';
  const provenance: CognitionProvenance = item.provenance === 'accepted-turn'
    ? 'accepted-turn' : 'legacy-import';
  const acquiredCycle = provenance === 'accepted-turn'
    && Number.isSafeInteger(item.acquiredCycle) && Number(item.acquiredCycle) > 0
    ? Number(item.acquiredCycle) : saveCycle;
  const evidenceSpans = normalizeEvidenceSpans(item.evidenceSpans);
  return {
    ...(item as unknown as CognitionRecord),
    sourceEventIds: uniqueStrings(item.sourceEventIds),
    ...(evidenceSpans.length ? { evidenceSpans } : {}),
    provenance,
    scope: player ? 'durable' : 'day',
    acquiredCycle,
  };
}

function normalizeDisclosure(value: unknown): DisclosureRecord | null {
  const item = asRecord(value);
  if (typeof item.id !== 'string' || !item.id.trim() || !Number.isSafeInteger(item.cycleCount)
    || typeof item.speakerId !== 'string' || typeof item.propositionId !== 'string'
    || typeof item.sourceEventId !== 'string' || typeof item.evidenceQuote !== 'string') return null;
  const listenerIds = uniqueStrings(item.listenerIds);
  if (listenerIds.length === 0) return null;
  return {
    id: item.id, cycleCount: Number(item.cycleCount), speakerId: item.speakerId,
    listenerIds, propositionId: item.propositionId, sourceEventId: item.sourceEventId,
    evidenceQuote: item.evidenceQuote, evidenceSpans: normalizeEvidenceSpans(item.evidenceSpans),
  };
}

function normalizeCommitment(value: unknown): CommitmentRecord | null {
  const item = asRecord(value);
  if (typeof item.id !== 'string' || !item.id.trim() || !Number.isSafeInteger(item.cycleCount)
    || typeof item.actorId !== 'string' || typeof item.recipientId !== 'string'
    || typeof item.action !== 'string' || !item.action.trim() || typeof item.locationId !== 'string'
    || !getLocationById(item.locationId)
    || typeof item.dueAt !== 'string' || !Number.isFinite(new Date(item.dueAt).getTime())
    || !['active', 'fulfilled', 'cancelled', 'expired'].includes(String(item.status))
    || typeof item.sourceEventId !== 'string' || typeof item.evidenceQuote !== 'string') return null;
  return {
    id: item.id, cycleCount: Number(item.cycleCount), actorId: item.actorId,
    recipientId: item.recipientId, action: item.action, locationId: item.locationId,
    dueAt: item.dueAt, status: item.status as CommitmentRecord['status'],
    sourceEventId: item.sourceEventId, evidenceQuote: item.evidenceQuote,
    ...(typeof item.statusSourceEventId === 'string' ? { statusSourceEventId: item.statusSourceEventId } : {}),
    ...(typeof item.statusEvidenceQuote === 'string' ? { statusEvidenceQuote: item.statusEvidenceQuote } : {}),
    ...(item.expiredReason === 'reset' || item.expiredReason === 'missed' ? { expiredReason: item.expiredReason } : {}),
  };
}

function statusForKnowledgeEvent(eventId: string): CognitionStatus {
  if (eventId.startsWith('hear:')) return 'heard';
  if (eventId.startsWith('insight:')) return 'inferred';
  if (eventId.startsWith('observe:') || eventId.startsWith('visit:')) return 'observed';
  return 'confirmed';
}

function upsertCognition(records: CognitionRecord[], next: CognitionRecord): void {
  const index = records.findIndex(item => item.cognitionId === next.cognitionId);
  if (index < 0) records.push(next);
  else records[index] = {
    ...records[index],
    ...next,
    firstLearnedTurn: Math.min(records[index].firstLearnedTurn, next.firstLearnedTurn),
    sourceEventIds: [...new Set([...records[index].sourceEventIds, ...next.sourceEventIds])],
  };
}

export function createEmptyWorldMemory(canonicalTruthVersion = 'mystery-truth-graph'): WorldMemoryState {
  return {
    version: WORLD_MEMORY_VERSION,
    canonicalTruthVersion,
    events: [],
    cognition: [],
    episodes: [],
    softCanonFacts: [],
    disclosures: [],
    commitments: [],
    acknowledgedCommitmentBoundaryIds: [],
  };
}

export function normalizeWorldMemory(
  variables: Record<string, unknown>,
  legacyEpisodes: EpisodeMemoryRecord[] = [],
): WorldMemoryState {
  const stored = asRecord(variables.worldMemory);
  const saveCycle = Number.isSafeInteger(variables.cycleCount) && Number(variables.cycleCount) > 0
    ? Number(variables.cycleCount) : 1;
  const memory: WorldMemoryState = {
    version: WORLD_MEMORY_VERSION,
    canonicalTruthVersion: typeof stored.canonicalTruthVersion === 'string'
      ? stored.canonicalTruthVersion
      : 'mystery-truth-graph',
    events: Array.isArray(stored.events) ? (stored.events.filter(item => item && typeof item === 'object') as WorldEventRecord[])
      .map(item => ({ ...item, actorIds: uniqueStrings(item.actorIds), evidenceLineIds: uniqueStrings(item.evidenceLineIds), factIds: uniqueStrings(item.factIds), tags: uniqueStrings(item.tags) })) : [],
    cognition: Array.isArray(stored.cognition)
      ? stored.cognition.map(item => normalizeStoredCognition(item, saveCycle)).filter((item): item is CognitionRecord => item !== null)
      : [],
    episodes: Array.isArray(stored.episodes) ? (stored.episodes.filter(item => item && typeof item === 'object') as EpisodeMemoryRecord[])
      .map(item => ({ ...item, actorIds: uniqueStrings(item.actorIds), factIds: uniqueStrings(item.factIds), cognitionIds: uniqueStrings(item.cognitionIds), unresolvedTags: uniqueStrings(item.unresolvedTags) })) : [],
    softCanonFacts: Array.isArray(stored.softCanonFacts)
      ? (stored.softCanonFacts.filter(item => item && typeof item === 'object') as BackgroundFactRecord[])
        .filter(item => item.level === 'soft' && reviewBackgroundFactProposal({
          proposalId: item.factId,
          text: item.text,
          characterIds: uniqueStrings(item.characterIds),
          locationIds: uniqueStrings(item.locationIds),
          knowerIds: uniqueStrings(item.characterIds).length ? [uniqueStrings(item.characterIds)[0]] : ['player'],
          evidenceText: item.text,
        }).approved)
        .map(item => ({ ...item, characterIds: uniqueStrings(item.characterIds), locationIds: uniqueStrings(item.locationIds) }))
      : [],
    disclosures: Array.isArray(stored.disclosures)
      ? stored.disclosures.map(normalizeDisclosure).filter((item): item is DisclosureRecord => item !== null)
      : [],
    commitments: Array.isArray(stored.commitments)
      ? stored.commitments.map(normalizeCommitment).filter((item): item is CommitmentRecord => item !== null)
      : [],
    acknowledgedCommitmentBoundaryIds: uniqueStrings(stored.acknowledgedCommitmentBoundaryIds),
  };

  const turnIndex = memory.episodes.reduce((max, item) => Math.max(max, Number(item.turnIndex) || 0), 0);
  for (const eventId of uniqueStrings(variables.knowledgeEvents)) {
    if (memory.cognition.some(item => item.cognitionId === `player|knowledge:${eventId}`)) continue;
    upsertCognition(memory.cognition, {
      cognitionId: `player|knowledge:${eventId}`,
      observerId: 'player',
      propositionId: `knowledge:${eventId}`,
      status: statusForKnowledgeEvent(eventId),
      confidence: 1,
      sourceEventIds: [`legacy:${eventId}`],
      firstLearnedTurn: 0,
      lastUpdatedTurn: turnIndex,
      summary: `玩家认知事件：${eventId}`,
      provenance: 'legacy-import', scope: 'durable', acquiredCycle: saveCycle,
    });
  }

  for (const [factId, level] of Object.entries(asRecord(variables.mysteryKnowledge))) {
    if (memory.cognition.some(item => item.cognitionId === `player|fact:${factId}`)) continue;
    upsertCognition(memory.cognition, {
      cognitionId: `player|fact:${factId}`,
      observerId: 'player',
      propositionId: `fact:${factId}`,
      subjectId: factId,
      status: level === 'confirmation' ? 'confirmed' : level === 'clue' ? 'believed' : 'suspected',
      confidence: level === 'confirmation' ? 1 : level === 'clue' ? 0.75 : 0.45,
      sourceEventIds: [`legacy-fact:${factId}`],
      firstLearnedTurn: 0,
      lastUpdatedTurn: turnIndex,
      summary: `玩家对案件事实 ${factId} 的认知层级为 ${String(level)}`,
      provenance: 'legacy-import', scope: 'durable', acquiredCycle: saveCycle,
    });
  }

  const learnedNpcIds = new Set(uniqueStrings(variables.playerNameKnownByNpcIds));
  for (const [npcId, establishedScope] of Object.entries(ESTABLISHED_PLAYER_NAME_SCOPES)) {
    if (memory.cognition.some(item => item.cognitionId === `${npcId}|identity:player-name`)) continue;
    upsertCognition(memory.cognition, {
      cognitionId: `${npcId}|identity:player-name`,
      observerId: npcId,
      propositionId: 'identity:player-name',
      subjectId: 'player',
      status: 'confirmed',
      confidence: 1,
      sourceEventIds: ['character-baseline'],
      firstLearnedTurn: 0,
      lastUpdatedTurn: turnIndex,
      summary: `${npcId} 知道如何称呼玩家`,
      identityScope: establishedScope,
      provenance: 'authored-baseline', scope: 'durable', acquiredCycle: 0,
    });
  }
  for (const npcId of learnedNpcIds) {
    const isUndercoverDetective = npcId === 'detective-a' || npcId === 'detective-b';
    const propositionId = isUndercoverDetective ? 'expression:player-name' : 'identity:player-name';
    const cognitionId = `${npcId}|${propositionId}`;
    if (memory.cognition.some(item => item.cognitionId === cognitionId)
      || (!isUndercoverDetective && Object.hasOwn(ESTABLISHED_PLAYER_NAME_SCOPES, npcId))) continue;
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: npcId,
      propositionId,
      subjectId: 'player',
      status: 'confirmed',
      confidence: 1,
      sourceEventIds: ['player-self-introduction'],
      firstLearnedTurn: turnIndex,
      lastUpdatedTurn: turnIndex,
      summary: `${npcId} 已从明确介绍中得知玩家姓名`,
      identityScope: 'full-name',
      provenance: 'legacy-import', scope: 'day', acquiredCycle: saveCycle,
    });
  }

  for (const baseline of FIXED_NPC_BACKGROUND_COGNITION) {
    const cognitionId = `${baseline.npcId}|background:${baseline.factId}`;
    if (memory.cognition.some(item => item.cognitionId === cognitionId)) continue;
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: baseline.npcId,
      propositionId: `background:${baseline.factId}`,
      subjectId: baseline.factId,
      status: 'confirmed',
      confidence: baseline.confidence,
      sourceEventIds: [`baseline:${BACKGROUND_HISTORY_VERSION}`],
      firstLearnedTurn: 0,
      lastUpdatedTurn: turnIndex,
      summary: FIXED_BACKGROUND_FACTS.find(fact => fact.factId === baseline.factId)?.text ?? baseline.factId,
      provenance: 'authored-baseline', scope: 'durable', acquiredCycle: 0,
    });
  }

  for (const episode of legacyEpisodes) {
    if (!memory.episodes.some(item => item.episodeId === episode.episodeId || item.turnId === episode.turnId)) {
      memory.episodes.push(episode);
    }
  }
  memory.cognition.sort((left, right) => left.cognitionId.localeCompare(right.cognitionId));
  return memory;
}

function extractSummary(message: ChatMessage): string {
  if (message.parsed?.summary?.trim()) return message.parsed.summary.trim();
  return message.content.match(/<sum>([\s\S]*?)<\/sum>/i)?.[1]?.trim() ?? '';
}

export function legacyEpisodesFromMessages(messages: readonly ChatMessage[]): EpisodeMemoryRecord[] {
  return messages.filter(message => message.role === 'assistant').flatMap((message, index) => {
    const summary = extractSummary(message);
    if (!summary) return [];
    return [{
      episodeId: `legacy-episode:${message.id}`,
      turnId: message.id,
      turnIndex: index,
      cycleCount: Number(message.variables?.cycleCount ?? 1),
      locationId: typeof message.variables?.location === 'string' ? message.variables.location : 'home',
      actorIds: [],
      summary,
      factIds: Object.keys(asRecord(message.variables?.mysteryKnowledge)),
      cognitionIds: [],
      unresolvedTags: [],
      salience: 0.45,
      createdAt: message.timestamp,
    }];
  });
}

export function migrateChatWorldMemory(chat: ChatSession): ChatSession {
  const worldMemory = normalizeWorldMemory(chat.variables ?? {}, legacyEpisodesFromMessages(chat.messages));
  if (chat.variables?.worldMemory && JSON.stringify(chat.variables.worldMemory) === JSON.stringify(worldMemory)) return chat;
  return { ...chat, variables: { ...chat.variables, worldMemory } };
}

export function legacyEpisodesFromSnapshots(history: readonly TurnSnapshot[] | undefined): EpisodeMemoryRecord[] {
  return (history ?? []).filter(item => item.summary?.trim()).map(item => ({
    episodeId: `legacy-snapshot:${item.timestamp}:${item.turnIndex}`,
    turnId: `legacy-snapshot:${item.timestamp}`,
    turnIndex: item.turnIndex,
    cycleCount: Number(item.variables?.cycleCount ?? 1),
    locationId: typeof item.variables?.location === 'string' ? item.variables.location : 'home',
    actorIds: [],
    summary: item.summary.trim(),
    factIds: Object.keys(asRecord(item.variables?.mysteryKnowledge)),
    cognitionIds: [],
    unresolvedTags: [],
    salience: 0.5,
    createdAt: item.timestamp,
  }));
}

export { estimateTokens } from '../sillytavern/token-budget';

function scoreText(text: string, terms: readonly string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (term && normalized.includes(term.toLowerCase()) ? 2 : 0), 0);
}

export function compileTurnContext(options: {
  userInput: string;
  locationId: string;
  activeNpcIds: string[];
  history: ChatMessage[];
  variables: Record<string, unknown>;
  maxContext?: number;
  reservedOutput?: number;
  fixedPromptText?: string;
}): TurnContextBundle {
  const normalizedMemory = normalizeWorldMemory(options.variables, legacyEpisodesFromMessages(options.history));
  const currentCycle = Number.isSafeInteger(Number(options.variables.cycleCount))
    ? Math.max(1, Number(options.variables.cycleCount)) : 1;
  const storyProgress = options.variables.storyProgress as { versionStartCycle?: unknown } | undefined;
  const requestedStart = Number(storyProgress?.versionStartCycle);
  const versionStart = Number.isSafeInteger(requestedStart) && requestedStart > 1 && requestedStart <= currentCycle ? requestedStart : 1;
  const inVersion = (cycle: unknown) => versionStart === 1 || (Number.isSafeInteger(Number(cycle)) && Number(cycle) >= versionStart);
  const eventCycles = new Map(normalizedMemory.events.map(event => [event.eventId, event.cycleCount]));
  // Archival records remain in the save. Only the current version may supply historical authority.
  const memory = {
    ...normalizedMemory,
    episodes: normalizedMemory.episodes.filter(item => inVersion(item.cycleCount)),
    disclosures: normalizedMemory.disclosures.filter(item => inVersion(item.cycleCount)),
    cognition: normalizedMemory.cognition.filter(item => {
      if (item.observerId === 'player' && MYSTERY_FACT_PROPOSITIONS.has(item.propositionId)) return false; // Canonical case facts come from the version-aware brief; personal beliefs and NPC disclosures retain their own status.
      if (item.provenance === 'authored-baseline') return true;
      if (versionStart === 1) return true;
      if (item.acquiredCycle !== undefined) return inVersion(item.acquiredCycle);
      return item.sourceEventIds.length > 0 && item.sourceEventIds.every(id => inVersion(eventCycles.get(id)));
    }),
  };
  const recentMessageCandidates = options.history.filter(message => message.role !== 'system'
    && inVersion(message.variables?.cycleCount)).slice(-4);
  const terms = [...new Set([options.locationId, ...options.activeNpcIds, ...options.userInput.split(/[\s，。！？、]+/u)])]
    .filter(term => term.length > 1);
  const recentEpisodeIds = new Set(memory.episodes.slice(-2).map(item => item.episodeId));
  const episodeCandidates = memory.episodes
    .map(item => ({ item, score: scoreText(`${item.locationId} ${item.actorIds.join(' ')} ${item.summary} ${item.unresolvedTags.join(' ')}`, terms)
      + item.salience * 2 + (recentEpisodeIds.has(item.episodeId) ? 2 : 0) }))
    .filter(entry => entry.score > 1)
    .sort((a, b) => b.score - a.score || b.item.turnIndex - a.item.turnIndex)
    .slice(0, 8)
    .map(entry => entry.item);
  const cognitionCandidates = memory.cognition.filter(item => (
    item.observerId === 'player'
    || (options.activeNpcIds.includes(item.observerId) && (
      item.provenance === 'authored-baseline'
      || (item.scope === 'day' && item.acquiredCycle === currentCycle)
    ))
  )).slice(-40);
  const fixedBackgroundFacts = relevantFixedBackgroundFacts(options.locationId, options.activeNpcIds);
  const softFactCandidates = memory.softCanonFacts.filter(fact => (
    fact.locationIds.includes(options.locationId)
    || fact.characterIds.some(id => options.activeNpcIds.includes(id))
    || scoreText(fact.text, terms) > 0
  )).slice(-20);
  const disclosureCandidates = (memory.disclosures ?? []).filter(item => (
    item.speakerId === 'player' || item.listenerIds.includes('player')
    || (item.cycleCount === currentCycle && (
      options.activeNpcIds.includes(item.speakerId)
      || item.listenerIds.some(listenerId => options.activeNpcIds.includes(listenerId))
    ))
  )).map((item, index) => ({
    item,
    index,
    priority: (item.cycleCount === currentCycle ? 8 : 0)
      + (options.activeNpcIds.includes(item.speakerId)
        || item.listenerIds.some(listenerId => options.activeNpcIds.includes(listenerId)) ? 4 : 0)
      + scoreText(item.evidenceQuote, terms),
  })).sort((left, right) => right.priority - left.priority
    || right.item.cycleCount - left.item.cycleCount || right.index - left.index)
    .map(entry => entry.item);
  const activeCommitments = (memory.commitments ?? []).filter(item => (
    item.status === 'active' && item.cycleCount === currentCycle
  ));

  const maxContext = options.maxContext ?? DEFAULT_CONTEXT_TOKENS;
  const reservedOutput = options.reservedOutput ?? DEFAULT_OUTPUT_TOKENS;
  const reservedRepair = Math.max(512, Math.ceil(maxContext * 0.08));
  const estimatedFixed = estimateTokens(options.fixedPromptText ?? '');
  const backgroundCognition = FIXED_NPC_BACKGROUND_COGNITION.filter(item => options.activeNpcIds.includes(item.npcId));
  const available = maxContext - reservedOutput - reservedRepair - estimatedFixed;
  if (!Number.isFinite(available) || reservedOutput < 0) {
    throw new ContextBudgetError(`上下文预算不足：固定指令、输出和修复预留无法容纳于 ${maxContext}。`);
  }

  const recentMessages: ChatMessage[] = [];
  const relevantEpisodes: EpisodeMemoryRecord[] = [];
  const relevantCognition: CognitionRecord[] = [];
  const relevantBackgroundFacts: BackgroundFactRecord[] = [...fixedBackgroundFacts];
  const relevantDisclosures: DisclosureRecord[] = [];

  const expressibleFixedIds = new Set(FIXED_NPC_BACKGROUND_COGNITION
    .filter(item => item.expressibleUnderCover && options.activeNpcIds.includes(item.npcId))
    .map(item => item.factId));
  const hiddenBackgroundCognitionIds = new Set(FIXED_NPC_BACKGROUND_COGNITION
    .filter(item => !item.expressibleUnderCover)
    .map(item => `${item.npcId}|background:${item.factId}`));

  function projectSelected() {
    const selectedIds = [
      ...recentMessages.map(item => `message:${item.id}`),
      ...relevantEpisodes.map(item => item.episodeId),
      ...relevantCognition.map(item => item.cognitionId),
      ...relevantBackgroundFacts.map(item => item.factId),
      ...relevantDisclosures.map(item => item.id),
      ...activeCommitments.map(item => item.id),
    ];
    const directorMemory = {
      selectedIds,
      episodes: relevantEpisodes.map(({ episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }) => (
        { episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }
      )),
      cognition: relevantCognition.map(({ cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }) => (
        { cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }
      )),
      disclosures: relevantDisclosures.map(({ id, cycleCount, speakerId, listenerIds, propositionId, evidenceQuote }) => (
        { id, cycleCount, speakerId, listenerIds, propositionId, evidenceQuote }
      )),
      commitments: activeCommitments,
      backgroundFacts: relevantBackgroundFacts,
      backgroundCognition,
    };
    const writerCognition = relevantCognition.filter(item => (
      !hiddenBackgroundCognitionIds.has(item.cognitionId)
      && !((item.observerId === 'detective-a' || item.observerId === 'detective-b')
        && item.propositionId === 'identity:player-name')
    ));
    const writerBackgroundFacts = relevantBackgroundFacts.filter(fact => (
      fact.level === 'fixed'
        ? expressibleFixedIds.has(fact.factId)
        : options.activeNpcIds.some(npcId => memory.cognition.some(cognition => (
          cognition.observerId === npcId && cognition.propositionId === `background:${fact.factId}`
        )))
    ));
    const writerCognitionProjection = writerCognition.map(({
      observerId, status, confidence, summary, identityScope,
    }, index) => ({
      id: `memory-cognition:${index + 1}`, observerId, status, confidence, summary, identityScope,
    }));
    const writerDisclosureProjection = relevantDisclosures.map(({
      cycleCount, speakerId, listenerIds, evidenceQuote,
    }, index) => ({
      id: `memory-disclosure:${index + 1}`, cycleCount, speakerId, listenerIds, evidenceQuote,
    }));
    const writerCommitmentProjection = activeCommitments.map(({
      actorId, recipientId, action, locationId, dueAt, evidenceQuote,
    }, index) => ({
      id: `active-commitment:${index + 1}`, actorId, recipientId, action, locationId, dueAt, evidenceQuote,
    }));
    const writerSelectedIds = [
      ...recentMessages.map(item => `message:${item.id}`),
      ...relevantEpisodes.map(item => item.episodeId),
      ...writerCognitionProjection.map(item => item.id),
      ...writerBackgroundFacts.map(item => item.factId),
      ...writerDisclosureProjection.map(item => item.id),
      ...writerCommitmentProjection.map(item => item.id),
    ];
    const writerMemory = {
      selectedIds: writerSelectedIds,
      episodes: relevantEpisodes.map(({ episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }) => (
        { episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }
      )),
      cognition: writerCognitionProjection,
      disclosures: writerDisclosureProjection,
      commitments: writerCommitmentProjection,
      backgroundFacts: writerBackgroundFacts,
      rule: '只可表现 backgroundFacts 中的开局前生活史；侦探调查档案等不可表达认知已被裁掉。',
    };
    const recentHistory = recentMessages.map(({ role, content }) => ({ role, content }));
    const estimatedSelected = Math.max(
      estimateTokens(JSON.stringify({ recentHistory, memoryContext: directorMemory, contextSelectionIds: selectedIds })),
      estimateTokens(JSON.stringify({ recentHistory, memoryContext: writerMemory, contextSelectionIds: writerSelectedIds })),
    );
    return { selectedIds, directorMemory, writerMemory, estimatedSelected };
  }

  let projection = projectSelected();
  if (projection.estimatedSelected > available) {
    throw new ContextBudgetError(`上下文预算不足：固定背景与当前有效承诺无法容纳于 ${maxContext}。必要权威内容未被截断。`);
  }

  function selectWhole<T>(target: T[], item: T, insert: 'start' | 'end' = 'end'): void {
    if (insert === 'start') target.unshift(item);
    else target.push(item);
    const candidate = projectSelected();
    if (candidate.estimatedSelected <= available) projection = candidate;
    else if (insert === 'start') target.shift();
    else target.pop();
  }

  // Required active commitments are already present. Optional public records are
  // selected whole, with current/relevant disclosures ahead of general history.
  disclosureCandidates.forEach(item => selectWhole(relevantDisclosures, item));
  [...recentMessageCandidates].reverse().forEach(item => selectWhole(recentMessages, item, 'start'));
  [...cognitionCandidates].reverse().forEach(item => selectWhole(relevantCognition, item, 'start'));
  episodeCandidates.forEach(item => selectWhole(relevantEpisodes, item));
  [...softFactCandidates].reverse().forEach(item => selectWhole(relevantBackgroundFacts, item, 'start'));

  // The final projection is recalculated after every accepted whole record, so
  // reported selection cost covers actual Director and Writer memory payloads.
  projection = projectSelected();
  return {
    version: 2,
    selectedIds: projection.selectedIds,
    recentMessages,
    relevantEpisodes,
    relevantCognition,
    relevantBackgroundFacts,
    lorebookScanText: [options.userInput, options.locationId, ...options.activeNpcIds, ...relevantEpisodes.map(item => item.summary)].join('\n'),
    directorMemory: projection.directorMemory,
    writerMemory: projection.writerMemory,
    tokenBudget: {
      maxContext,
      reservedOutput,
      reservedRepair,
      estimatedFixed,
      estimatedSelected: projection.estimatedSelected,
    },
  };
}

export function buildTurnCommit(options: {
  turnId: string;
  turnIndex: number;
  createdAt: number;
  occurredAt: string;
  locationId: string;
  cycleCount: number;
  summary: string;
  scene: Scene;
  beforeVariables: Record<string, unknown>;
  settledVariables: Record<string, unknown>;
  introducedPlayerNameToNpcIds?: string[];
  /** Already-reviewed subjective beliefs. These never mutate objective events. */
  cognitionDeltas?: CognitionDelta[];
  approvedBackgroundFactProposals?: BackgroundFactProposal[];
  narrativeText?: string;
  continuityEffects?: ValidatedCharacterContinuityEffects;
  encounteredCommitmentBoundaryId?: string;
}): TurnCommit {
  if (options.continuityEffects
    && candidateFingerprint(options.narrativeText ?? '') !== options.continuityEffects.candidateId) {
    throw new Error('character continuity candidate fingerprint mismatch');
  }
  const memory = normalizeWorldMemory(options.beforeVariables);
  const knowledgeEvents = uniqueStrings(options.settledVariables.knowledgeEvents);
  const previousKnowledgeEvents = new Set(uniqueStrings(options.beforeVariables.knowledgeEvents));
  const newKnowledgeEvents = knowledgeEvents.filter(item => !previousKnowledgeEvents.has(item));
  const beforeFacts = asRecord(options.beforeVariables.mysteryKnowledge);
  const mysteryKnowledge = asRecord(options.settledVariables.mysteryKnowledge);
  const changedFactIds = Object.keys(mysteryKnowledge).filter(id => mysteryKnowledge[id] !== beforeFacts[id]);
  const actorIds = [...new Set(options.scene.lines.map(line => characterIdFromSpeaker(line.speaker)).filter((id): id is string => !!id))];
  const evidenceLineIds = options.scene.lines
    .filter(line => line.knowledgeEvents?.length)
    .map((line, index) => line.id ?? `${options.turnId}:line:${index}`);

  const rootEvent: WorldEventRecord = {
    eventId: `turn:${options.turnId}`,
    turnId: options.turnId,
    turnIndex: options.turnIndex,
    cycleCount: options.cycleCount,
    occurredAt: options.occurredAt,
    locationId: options.locationId,
    actorIds,
    kind: 'narrative-turn',
    summary: options.summary,
    evidenceLineIds,
    factIds: changedFactIds,
    tags: [...newKnowledgeEvents, ...changedFactIds],
    salience: Math.min(1, 0.35 + newKnowledgeEvents.length * 0.15 + changedFactIds.length * 0.2),
    createdAt: options.createdAt,
  };
  if (!memory.events.some(item => item.eventId === rootEvent.eventId)) memory.events.push(rootEvent);

  const cognitionIds: string[] = [];
  for (const eventId of newKnowledgeEvents) {
    const cognitionId = `player|knowledge:${eventId}`;
    cognitionIds.push(cognitionId);
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: 'player',
      propositionId: `knowledge:${eventId}`,
      status: statusForKnowledgeEvent(eventId),
      confidence: 1,
      sourceEventIds: [rootEvent.eventId],
      firstLearnedTurn: options.turnIndex,
      lastUpdatedTurn: options.turnIndex,
      summary: `玩家在本回合获得认知：${eventId}`,
      provenance: 'accepted-turn', scope: 'durable', acquiredCycle: options.cycleCount,
    });
  }
  for (const factId of changedFactIds) {
    const cognitionId = `player|fact:${factId}`;
    cognitionIds.push(cognitionId);
    const level = mysteryKnowledge[factId];
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: 'player',
      propositionId: `fact:${factId}`,
      subjectId: factId,
      status: level === 'confirmation' ? 'confirmed' : level === 'clue' ? 'believed' : 'suspected',
      confidence: level === 'confirmation' ? 1 : level === 'clue' ? 0.75 : 0.45,
      sourceEventIds: [rootEvent.eventId],
      firstLearnedTurn: options.turnIndex,
      lastUpdatedTurn: options.turnIndex,
      summary: `玩家对案件事实 ${factId} 的认知更新为 ${String(level)}`,
      provenance: 'accepted-turn', scope: 'durable', acquiredCycle: options.cycleCount,
    });
  }
  // The deprecated introducedPlayerNameToNpcIds hint is intentionally non-authoritative.
  // Only continuity effects validated against rendered audience evidence may grant name use.
  for (const delta of [...(options.cognitionDeltas ?? []), ...(options.continuityEffects?.cognitionDeltas ?? [])]) {
    const cognitionId = `${delta.observerId}|${delta.propositionId}`;
    cognitionIds.push(cognitionId);
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: delta.observerId,
      propositionId: delta.propositionId,
      subjectId: delta.subjectId,
      status: delta.status,
      confidence: Math.max(0, Math.min(1, delta.confidence)),
      sourceEventIds: [rootEvent.eventId],
      firstLearnedTurn: options.turnIndex,
      lastUpdatedTurn: options.turnIndex,
      summary: delta.summary,
      identityScope: delta.identityScope,
      provenance: delta.provenance ?? 'accepted-turn',
      scope: delta.scope ?? (delta.observerId === 'player' ? 'durable' : 'day'),
      acquiredCycle: delta.acquiredCycle ?? options.cycleCount,
      ...(delta.evidenceSpans?.length ? { evidenceSpans: structuredClone(delta.evidenceSpans) } : {}),
    });
  }

  for (const proposal of options.approvedBackgroundFactProposals ?? []) {
    if (!reviewBackgroundFactProposal(proposal).approved) continue;
    if (!(options.narrativeText ?? '').includes(proposal.evidenceText)) continue;
    const factId = `soft:${proposal.proposalId}`;
    if (!memory.softCanonFacts.some(item => item.factId === factId)) {
      memory.softCanonFacts.push({
        factId,
        text: proposal.text,
        characterIds: uniqueStrings(proposal.characterIds),
        locationIds: uniqueStrings(proposal.locationIds),
        level: 'soft',
        privacy: 'common',
        timeScope: 'pre-game',
        source: 'director',
        createdTurn: options.turnIndex,
      });
    }
    for (const npcId of uniqueStrings(proposal.knowerIds)) {
      const cognitionId = `${npcId}|background:${factId}`;
      cognitionIds.push(cognitionId);
      upsertCognition(memory.cognition, {
        cognitionId,
        observerId: npcId,
        propositionId: `background:${factId}`,
        subjectId: factId,
        status: 'confirmed',
        confidence: 1,
        sourceEventIds: [rootEvent.eventId],
        firstLearnedTurn: options.turnIndex,
        lastUpdatedTurn: options.turnIndex,
        summary: proposal.text,
        provenance: 'accepted-turn', scope: 'day', acquiredCycle: options.cycleCount,
      });
    }
  }

  for (const [index, disclosure] of (options.continuityEffects?.disclosures ?? []).entries()) {
    const id = `disclosure:${options.turnId}:${index}`;
    if (!(memory.disclosures ?? []).some(item => item.id === id)) {
      (memory.disclosures ??= []).push({
        ...structuredClone(disclosure),
        id,
        cycleCount: options.cycleCount,
        sourceEventId: rootEvent.eventId,
      });
    }
  }

  for (const [index, operation] of (options.continuityEffects?.commitmentOperations ?? []).entries()) {
    if (operation.operation === 'accept') {
      const id = `commitment:${options.turnId}:${index}`;
      if (!(memory.commitments ?? []).some(item => item.id === id)) {
        (memory.commitments ??= []).push({
          id,
          cycleCount: options.cycleCount,
          actorId: operation.actorId,
          recipientId: operation.recipientId,
          action: operation.action,
          locationId: operation.locationId,
          dueAt: operation.dueAt,
          status: 'active',
          sourceEventId: rootEvent.eventId,
          evidenceQuote: operation.evidenceQuote,
        });
      }
      continue;
    }
    const commitment = (memory.commitments ?? []).find(item => item.id === operation.existingCommitmentId);
    if (commitment?.status === 'active' && commitment.cycleCount === options.cycleCount
      && commitment.actorId === operation.actorId && commitment.recipientId === operation.recipientId) {
      commitment.status = operation.operation === 'fulfill' ? 'fulfilled' : 'cancelled';
      commitment.statusSourceEventId = rootEvent.eventId;
      commitment.statusEvidenceQuote = operation.evidenceQuote;
      delete commitment.expiredReason;
    }
  }

  const encounteredCommitmentId = options.encounteredCommitmentBoundaryId
    ? commitmentIdFromBoundaryId(options.encounteredCommitmentBoundaryId) : null;
  if (encounteredCommitmentId && (memory.commitments ?? []).some(item => (
    item.id === encounteredCommitmentId && item.status === 'active' && item.cycleCount === options.cycleCount
  ))) {
    memory.acknowledgedCommitmentBoundaryIds = uniqueStrings([
      ...(memory.acknowledgedCommitmentBoundaryIds ?? []), options.encounteredCommitmentBoundaryId!,
    ]);
  }
  const occurredClock = new Date(options.occurredAt).getTime();
  if (Number.isFinite(occurredClock)) {
    for (const commitment of memory.commitments ?? []) {
      if (commitment.status === 'active' && commitment.cycleCount === options.cycleCount
        && new Date(commitment.dueAt).getTime() < occurredClock) {
        commitment.status = 'expired';
        commitment.expiredReason = 'missed';
        commitment.statusSourceEventId = rootEvent.eventId;
      }
    }
  }

  const episode: EpisodeMemoryRecord = {
    episodeId: `episode:${options.turnId}`,
    turnId: options.turnId,
    turnIndex: options.turnIndex,
    cycleCount: options.cycleCount,
    locationId: options.locationId,
    actorIds,
    summary: options.summary,
    factIds: changedFactIds,
    cognitionIds,
    unresolvedTags: [],
    salience: rootEvent.salience,
    createdAt: options.createdAt,
  };
  if (!memory.episodes.some(item => item.episodeId === episode.episodeId)) memory.episodes.push(episode);

  const playerNameKnownByNpcIds = uniqueStrings(memory.cognition.filter(item => (
    item.provenance !== 'authored-baseline'
    && cognitionIsPublicPlayerNamePermission(item, options.cycleCount)
  )).map(item => item.observerId));

  return {
    turnId: options.turnId,
    worldMemory: memory,
    knowledgeEvents,
    mysteryKnowledge,
    playerNameKnownByNpcIds,
  };
}
