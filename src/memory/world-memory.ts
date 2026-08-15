import type { ChatMessage, ChatSession, Scene, TurnSnapshot } from '../sillytavern/types';
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

export type CognitionStatus =
  | 'observed'
  | 'heard'
  | 'inferred'
  | 'suspected'
  | 'believed'
  | 'confirmed'
  | 'disproved';

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
}

export interface CognitionDelta {
  observerId: 'player' | string;
  propositionId: string;
  subjectId?: string;
  status: CognitionStatus;
  confidence: number;
  summary: string;
  identityScope?: CognitionRecord['identityScope'];
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
  };
}

export function normalizeWorldMemory(
  variables: Record<string, unknown>,
  legacyEpisodes: EpisodeMemoryRecord[] = [],
): WorldMemoryState {
  const stored = asRecord(variables.worldMemory);
  const memory: WorldMemoryState = {
    version: WORLD_MEMORY_VERSION,
    canonicalTruthVersion: typeof stored.canonicalTruthVersion === 'string'
      ? stored.canonicalTruthVersion
      : 'mystery-truth-graph',
    events: Array.isArray(stored.events) ? (stored.events.filter(item => item && typeof item === 'object') as WorldEventRecord[])
      .map(item => ({ ...item, actorIds: uniqueStrings(item.actorIds), evidenceLineIds: uniqueStrings(item.evidenceLineIds), factIds: uniqueStrings(item.factIds), tags: uniqueStrings(item.tags) })) : [],
    cognition: Array.isArray(stored.cognition) ? (stored.cognition.filter(item => item && typeof item === 'object') as CognitionRecord[])
      .map(item => ({ ...item, sourceEventIds: uniqueStrings(item.sourceEventIds) })) : [],
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
    });
  }
  for (const npcId of learnedNpcIds) {
    if (memory.cognition.some(item => item.cognitionId === `${npcId}|identity:player-name`)) continue;
    upsertCognition(memory.cognition, {
      cognitionId: `${npcId}|identity:player-name`,
      observerId: npcId,
      propositionId: 'identity:player-name',
      subjectId: 'player',
      status: 'confirmed',
      confidence: 1,
      sourceEventIds: ['player-self-introduction'],
      firstLearnedTurn: turnIndex,
      lastUpdatedTurn: turnIndex,
      summary: `${npcId} 已从明确介绍中得知玩家姓名`,
      identityScope: 'full-name',
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
    });
  }

  for (const episode of legacyEpisodes) {
    if (!memory.episodes.some(item => item.episodeId === episode.episodeId || item.turnId === episode.turnId)) {
      memory.episodes.push(episode);
    }
  }
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

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 1.15 + other / 3.6 + 4);
}

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
  const memory = normalizeWorldMemory(options.variables, legacyEpisodesFromMessages(options.history));
  const recentMessages = options.history.filter(message => message.role !== 'system').slice(-4);
  const terms = [...new Set([options.locationId, ...options.activeNpcIds, ...options.userInput.split(/[\s，。！？、]+/u)])]
    .filter(term => term.length > 1);
  const recentEpisodeIds = new Set(memory.episodes.slice(-2).map(item => item.episodeId));
  const relevantEpisodes = memory.episodes
    .map(item => ({ item, score: scoreText(`${item.locationId} ${item.actorIds.join(' ')} ${item.summary} ${item.unresolvedTags.join(' ')}`, terms)
      + item.salience * 2 + (recentEpisodeIds.has(item.episodeId) ? 2 : 0) }))
    .filter(entry => entry.score > 1)
    .sort((a, b) => b.score - a.score || b.item.turnIndex - a.item.turnIndex)
    .slice(0, 8)
    .map(entry => entry.item);
  const relevantCognition = memory.cognition.filter(item => (
    item.observerId === 'player'
    || options.activeNpcIds.includes(item.observerId)
    || (item.subjectId ? options.activeNpcIds.includes(item.subjectId) : false)
    || scoreText(`${item.propositionId} ${item.summary}`, terms) > 0
  )).slice(-40);
  const fixedBackgroundFacts = relevantFixedBackgroundFacts(options.locationId, options.activeNpcIds);
  const relevantSoftFacts = memory.softCanonFacts.filter(fact => (
    fact.locationIds.includes(options.locationId)
    || fact.characterIds.some(id => options.activeNpcIds.includes(id))
    || scoreText(fact.text, terms) > 0
  )).slice(-20);
  const relevantBackgroundFacts = [...fixedBackgroundFacts, ...relevantSoftFacts];

  const maxContext = options.maxContext ?? 80000;
  const reservedOutput = options.reservedOutput ?? 4096;
  const reservedRepair = Math.max(512, Math.ceil(maxContext * 0.08));
  const estimatedFixed = estimateTokens(options.fixedPromptText ?? '');
  const selectedText = [
    ...recentMessages.map(item => item.content),
    ...relevantEpisodes.map(item => item.summary),
    ...relevantCognition.map(item => item.summary),
    ...relevantBackgroundFacts.map(item => item.text),
  ].join('\n');
  const selectedIds = [
    ...recentMessages.map(item => `message:${item.id}`),
    ...relevantEpisodes.map(item => item.episodeId),
    ...relevantCognition.map(item => item.cognitionId),
    ...relevantBackgroundFacts.map(item => item.factId),
  ];
  const baseMemoryProjection = {
    selectedIds,
    episodes: relevantEpisodes.map(({ episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }) => (
      { episodeId, cycleCount, locationId, actorIds, summary, unresolvedTags }
    )),
    cognition: relevantCognition.map(({ cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }) => (
      { cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }
    )),
  };
  const directorMemory = {
    ...baseMemoryProjection,
    backgroundFacts: relevantBackgroundFacts,
    backgroundCognition: FIXED_NPC_BACKGROUND_COGNITION.filter(item => options.activeNpcIds.includes(item.npcId)),
  };
  const expressibleFixedIds = new Set(FIXED_NPC_BACKGROUND_COGNITION
    .filter(item => item.expressibleUnderCover && options.activeNpcIds.includes(item.npcId))
    .map(item => item.factId));
  const writerBackgroundFacts = relevantBackgroundFacts.filter(fact => (
    fact.level === 'fixed'
      ? expressibleFixedIds.has(fact.factId)
      : options.activeNpcIds.some(npcId => memory.cognition.some(cognition => (
        cognition.observerId === npcId && cognition.propositionId === `background:${fact.factId}`
      )))
  ));
  const hiddenBackgroundCognitionIds = new Set(FIXED_NPC_BACKGROUND_COGNITION
    .filter(item => !item.expressibleUnderCover)
    .map(item => `${item.npcId}|background:${item.factId}`));
  const writerCognition = relevantCognition.filter(item => (
    !hiddenBackgroundCognitionIds.has(item.cognitionId)
    && !((item.observerId === 'detective-a' || item.observerId === 'detective-b')
      && item.propositionId === 'identity:player-name')
  ));
  const writerVisibleIds = new Set([
    ...recentMessages.map(item => `message:${item.id}`),
    ...relevantEpisodes.map(item => item.episodeId),
    ...writerCognition.map(item => item.cognitionId),
    ...writerBackgroundFacts.map(item => item.factId),
  ]);
  const writerMemory = {
    ...baseMemoryProjection,
    selectedIds: selectedIds.filter(id => writerVisibleIds.has(id)),
    cognition: writerCognition.map(({ cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }) => (
      { cognitionId, observerId, propositionId, subjectId, status, confidence, summary, identityScope }
    )),
    backgroundFacts: writerBackgroundFacts,
    rule: '只可表现 backgroundFacts 中的开局前生活史；侦探调查档案等不可表达认知已被裁掉。',
  };
  return {
    version: 2,
    selectedIds,
    recentMessages,
    relevantEpisodes,
    relevantCognition,
    relevantBackgroundFacts,
    lorebookScanText: [options.userInput, options.locationId, ...options.activeNpcIds, ...relevantEpisodes.map(item => item.summary)].join('\n'),
    directorMemory,
    writerMemory,
    tokenBudget: {
      maxContext,
      reservedOutput,
      reservedRepair,
      estimatedFixed,
      estimatedSelected: estimateTokens(selectedText),
    },
  };
}

function actorIdFromSpeaker(speaker: string): string | null {
  const normalized = speaker.trim().toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/(?:陈慧慧|店员|chen-huihui)/i, 'chen-huihui'],
    [/(?:文穗|fumi)/i, 'fumi'],
    [/(?:灯织|学姐|touko)/i, 'touko'],
    [/(?:周德明|周大爷|old-man)/i, 'old-man'],
    [/(?:刘仁光|体育老师|liu-renguang)/i, 'liu-renguang'],
    [/(?:赵刚|货车司机|detective-a)/i, 'detective-a'],
    [/(?:林静|护士|detective-b)/i, 'detective-b'],
  ];
  return aliases.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
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
}): TurnCommit {
  const memory = normalizeWorldMemory(options.beforeVariables);
  const knowledgeEvents = uniqueStrings(options.settledVariables.knowledgeEvents);
  const previousKnowledgeEvents = new Set(uniqueStrings(options.beforeVariables.knowledgeEvents));
  const newKnowledgeEvents = knowledgeEvents.filter(item => !previousKnowledgeEvents.has(item));
  const beforeFacts = asRecord(options.beforeVariables.mysteryKnowledge);
  const mysteryKnowledge = asRecord(options.settledVariables.mysteryKnowledge);
  const changedFactIds = Object.keys(mysteryKnowledge).filter(id => mysteryKnowledge[id] !== beforeFacts[id]);
  const playerNameKnownByNpcIds = uniqueStrings(options.settledVariables.playerNameKnownByNpcIds);
  const actorIds = [...new Set(options.scene.lines.map(line => actorIdFromSpeaker(line.speaker)).filter((id): id is string => !!id))];
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
    });
  }
  for (const npcId of options.introducedPlayerNameToNpcIds ?? []) {
    const isUndercoverDetective = npcId === 'detective-a' || npcId === 'detective-b';
    const cognitionId = isUndercoverDetective
      ? `${npcId}|expression:player-name`
      : `${npcId}|identity:player-name`;
    cognitionIds.push(cognitionId);
    upsertCognition(memory.cognition, {
      cognitionId,
      observerId: npcId,
      propositionId: isUndercoverDetective ? 'expression:player-name' : 'identity:player-name',
      subjectId: 'player',
      status: 'confirmed',
      confidence: 1,
      sourceEventIds: [rootEvent.eventId],
      firstLearnedTurn: options.turnIndex,
      lastUpdatedTurn: options.turnIndex,
      summary: isUndercoverDetective
        ? `${npcId} 的公开身份在玩家主动介绍后获准使用玩家姓名；其真实调查认知未发生变化`
        : `${npcId} 在本回合得知玩家姓名`,
      identityScope: 'full-name',
    });
  }
  for (const delta of options.cognitionDeltas ?? []) {
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
      });
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

  return {
    turnId: options.turnId,
    worldMemory: memory,
    knowledgeEvents,
    mysteryKnowledge,
    playerNameKnownByNpcIds,
  };
}
