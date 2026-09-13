import { getLocationById } from '../../data/locations';
import { buildPlayerKnowledgeBrief, type PlayerKnowledgeBrief } from '../../data/playerKnowledge';
import type { ActionContinuation, ResolvedActionOutcome } from '../../engine/action-resolution';
import { buildMysteryBrief, FIXED_LOCATION_NPC_IDS } from './brief';
import {
  buildAliasedMysteryBrief,
  resolveFactAlias,
  type FactAliasTable,
} from './fact-aliases';
import { reviewDirectorPlan } from './review';
import type {
  DirectorPlan,
  DirectorRevelation,
  MysteryBrief,
  MysteryTruthGraph,
  NpcKnowledgeBrief,
  TruthContext,
  UsableMysteryFact,
} from './types';

export interface PendingAuthorizedRevelation {
  sourceId: string;
  alias: string;
  canonicalFactId: string;
  level: DirectorRevelation['level'];
  delivery: DirectorRevelation['delivery'];
  speakerId?: string;
  sourceLocationId: string;
}

export interface PendingAuthorizedKnowledgeMilestone {
  sourceId: string;
  eventId: string;
  evidence: string;
  sourceLocationId: string;
}

/**
 * Program-owned authorization retained beside an ActionContinuation. This value
 * contains canonical identifiers and must never be spread into model packets.
 */
export interface PendingActionAuthorization {
  actionId: string;
  cycleCount: number;
  graphFingerprint: string;
  revelations: PendingAuthorizedRevelation[];
  knowledgeMilestones: PendingAuthorizedKnowledgeMilestone[];
}

export interface CapturePendingActionAuthorizationInput {
  plan: DirectorPlan;
  brief: MysteryBrief;
  aliases: FactAliasTable;
  graph: MysteryTruthGraph;
  resolution: ResolvedActionOutcome;
  sourceLocationId: string;
  previous?: PendingActionAuthorization;
}

export interface RestorePendingActionAuthorizationInput {
  ledger: PendingActionAuthorization;
  continuation: ActionContinuation;
  graph: MysteryTruthGraph;
  aliases: FactAliasTable;
  truthContext: TruthContext;
}

export interface RestoredPendingActionAuthorization {
  revelations: DirectorRevelation[];
  knowledgeEvents: NonNullable<DirectorPlan['knowledgeEvents']>;
  usableFacts: UsableMysteryFact[];
  npcKnowledge: NpcKnowledgeBrief[];
  allowedDiscoveries: PlayerKnowledgeBrief['allowedDiscoveries'];
}

/** Exact private binding for the alias-producing identity, order and version. */
export function fingerprintMysteryGraph(graph: MysteryTruthGraph): string {
  return JSON.stringify({
    version: graph.version,
    orderedCanonicalFactIds: graph.facts.map(fact => fact.id),
  });
}

function assertAliasBinding(table: FactAliasTable, alias: string, canonicalFactId: string): void {
  if (resolveFactAlias(table, alias) !== canonicalFactId || table.factIdToAlias[canonicalFactId] !== alias) {
    throw new Error(`fact alias binding changed for ${alias}`);
  }
}

function pendingSourceLocations(
  continuation: ActionContinuation,
  completedSourceIds: readonly string[] = [],
): Map<string, string> {
  const activeIndex = continuation.steps.findIndex(step => step.id === continuation.activeStepId);
  if (activeIndex < 0) throw new Error('continuation active step is missing');
  const completed = new Set(completedSourceIds);
  const result = new Map<string, string>();
  for (const step of continuation.steps.slice(activeIndex)) {
    for (const sourceId of step.completionSourceIds) {
      if (completed.has(sourceId)) continue;
      const existing = result.get(sourceId);
      if (existing && existing !== step.locationId) {
        throw new Error(`pending source ${sourceId} is bound to multiple locations`);
      }
      result.set(sourceId, step.locationId);
    }
  }
  return result;
}

function sameRevelation(left: PendingAuthorizedRevelation, right: PendingAuthorizedRevelation): boolean {
  return left.sourceId === right.sourceId
    && left.alias === right.alias
    && left.canonicalFactId === right.canonicalFactId
    && left.level === right.level
    && left.delivery === right.delivery
    && left.speakerId === right.speakerId
    && left.sourceLocationId === right.sourceLocationId;
}

function sameKnowledge(
  left: PendingAuthorizedKnowledgeMilestone,
  right: PendingAuthorizedKnowledgeMilestone,
): boolean {
  return left.sourceId === right.sourceId
    && left.eventId === right.eventId
    && left.evidence === right.evidence
    && left.sourceLocationId === right.sourceLocationId;
}

function mergeExact<T extends { sourceId: string }>(
  target: Map<string, T>,
  item: T,
  same: (left: T, right: T) => boolean,
): void {
  const existing = target.get(item.sourceId);
  if (existing && !same(existing, item)) throw new Error(`pending authorization changed for ${item.sourceId}`);
  target.set(item.sourceId, item);
}

export function capturePendingActionAuthorization(
  input: CapturePendingActionAuthorizationInput,
): PendingActionAuthorization | undefined {
  const continuation = input.resolution.continuation;
  if (!continuation) return undefined;
  if (input.brief.graphVersion !== input.graph.version) throw new Error('approved brief graph version mismatch');
  if (!getLocationById(input.sourceLocationId)) throw new Error('pending authorization source location is unknown');

  const graphFingerprint = fingerprintMysteryGraph(input.graph);
  if (input.previous) {
    if (input.previous.actionId !== continuation.actionId) throw new Error('previous pending action id mismatch');
    if (input.previous.cycleCount !== continuation.cycleCount) throw new Error('previous pending cycle mismatch');
    if (input.previous.graphFingerprint !== graphFingerprint) throw new Error('previous pending graph fingerprint mismatch');
  }

  const pending = pendingSourceLocations(continuation, input.resolution.completedSourceIds);
  const revelations = new Map<string, PendingAuthorizedRevelation>();
  const knowledge = new Map<string, PendingAuthorizedKnowledgeMilestone>();

  for (const item of input.previous?.revelations ?? []) {
    if (pending.has(item.sourceId)) mergeExact(revelations, { ...item }, sameRevelation);
  }
  for (const item of input.previous?.knowledgeMilestones ?? []) {
    if (pending.has(item.sourceId)) mergeExact(knowledge, { ...item }, sameKnowledge);
  }

  for (const revelation of input.plan.revelations) {
    const sourceId = `fact:${revelation.factId}:${revelation.level}`;
    const stepLocationId = pending.get(sourceId);
    if (!stepLocationId) continue;
    const retained = revelations.get(sourceId);
    const authorizedSourceLocationId = retained?.sourceLocationId ?? input.sourceLocationId;
    if (stepLocationId !== authorizedSourceLocationId) {
      throw new Error(`fact source ${sourceId} is not bound to its approved source location`);
    }
    const canonicalFactId = resolveFactAlias(input.aliases, revelation.factId);
    if (!canonicalFactId) throw new Error(`unknown fact alias ${revelation.factId}`);
    assertAliasBinding(input.aliases, revelation.factId, canonicalFactId);
    const approvedFact = input.brief.usableFacts.find(fact => fact.id === revelation.factId);
    if (!approvedFact?.revealOptions.some(option => option.level === revelation.level)) {
      throw new Error(`fact source ${sourceId} was not present in the final approved brief`);
    }
    mergeExact(revelations, {
      sourceId,
      alias: revelation.factId,
      canonicalFactId,
      level: revelation.level,
      delivery: revelation.delivery,
      ...(revelation.speakerId ? { speakerId: revelation.speakerId } : {}),
      sourceLocationId: authorizedSourceLocationId,
    }, sameRevelation);
  }

  for (const event of input.plan.knowledgeEvents ?? []) {
    const sourceId = `accepted-event:${event.eventId}`;
    const sourceLocationId = pending.get(sourceId);
    if (!sourceLocationId) continue;
    if (!input.brief.playerPresentation.allowedDiscoveries.some(discovery => discovery.eventId === event.eventId)) {
      throw new Error(`knowledge source ${sourceId} was not present in the final approved brief`);
    }
    mergeExact(knowledge, {
      sourceId,
      eventId: event.eventId,
      evidence: event.evidence,
      sourceLocationId,
    }, sameKnowledge);
  }

  for (const sourceId of pending.keys()) {
    if (sourceId.startsWith('fact:') && !revelations.has(sourceId)) {
      throw new Error(`pending fact source ${sourceId} has no private authorization ledger`);
    }
    if (sourceId.startsWith('accepted-event:') && !knowledge.has(sourceId)) {
      throw new Error(`pending knowledge source ${sourceId} has no private authorization ledger`);
    }
  }

  return {
    actionId: continuation.actionId,
    cycleCount: continuation.cycleCount,
    graphFingerprint,
    revelations: [...pending.keys()].flatMap(sourceId => {
      const item = revelations.get(sourceId);
      return item ? [{ ...item }] : [];
    }),
    knowledgeMilestones: [...pending.keys()].flatMap(sourceId => {
      const item = knowledge.get(sourceId);
      return item ? [{ ...item }] : [];
    }),
  };
}

function projectPlayerPresentation(context: TruthContext, locationId: string): PlayerKnowledgeBrief {
  if (context.playerIdentityVariables) {
    return buildPlayerKnowledgeBrief({ ...context.playerIdentityVariables, location: locationId });
  }
  if (context.currentLocation === locationId && context.playerPresentation) {
    return {
      ...context.playerPresentation,
      locations: context.playerPresentation.locations.map(item => ({ ...item })),
      entities: context.playerPresentation.entities.map(item => ({ ...item, facts: [...item.facts] })),
      namingRules: [...context.playerPresentation.namingRules],
      allowedDiscoveries: context.playerPresentation.allowedDiscoveries.map(item => ({ ...item })),
    };
  }
  return { locations: [], entities: [], namingRules: [], allowedDiscoveries: [] };
}

function briefAtSource(
  graph: MysteryTruthGraph,
  aliases: FactAliasTable,
  truthContext: TruthContext,
  locationId: string,
): MysteryBrief {
  const activeNpcIds = [...new Set([
    ...(truthContext.currentLocation === locationId ? truthContext.activeNpcIds : []),
    ...(FIXED_LOCATION_NPC_IDS[locationId] ?? []),
  ])];
  return buildAliasedMysteryBrief(buildMysteryBrief(graph, {
    ...truthContext,
    currentLocation: locationId,
    activeNpcIds,
    playerPresentation: projectPlayerPresentation(truthContext, locationId),
    sceneContract: undefined,
  }), aliases);
}

function mergeNpcKnowledge(
  briefs: readonly MysteryBrief[],
  aliases: ReadonlySet<string>,
): NpcKnowledgeBrief[] {
  const byNpc = new Map<string, NpcKnowledgeBrief>();
  for (const brief of briefs) {
    for (const npc of brief.npcKnowledge) {
      const existing = byNpc.get(npc.npcId) ?? { npcId: npc.npcId, facts: [] };
      for (const fact of npc.facts) {
        if (!aliases.has(fact.factId)) continue;
        const previous = existing.facts.find(item => item.factId === fact.factId);
        if (!previous) existing.facts.push({ ...fact });
      }
      if (existing.facts.length) byNpc.set(npc.npcId, existing);
    }
  }
  return [...byNpc.values()].map(npc => ({ ...npc, facts: npc.facts.map(fact => ({ ...fact })) }));
}

export function restorePendingActionAuthorization(
  input: RestorePendingActionAuthorizationInput,
): RestoredPendingActionAuthorization {
  const currentFingerprint = fingerprintMysteryGraph(input.graph);
  if (input.ledger.graphFingerprint !== currentFingerprint) throw new Error('pending authorization graph fingerprint mismatch');
  if (input.ledger.actionId !== input.continuation.actionId) throw new Error('pending authorization action id mismatch');
  if (input.ledger.cycleCount !== input.continuation.cycleCount) throw new Error('pending authorization cycle mismatch');
  if (input.truthContext.cycleCount !== input.ledger.cycleCount) throw new Error('truth context cycle mismatch');

  const pending = pendingSourceLocations(input.continuation);
  const ledgerSourceIds = new Set([
    ...input.ledger.revelations.map(item => item.sourceId),
    ...input.ledger.knowledgeMilestones.map(item => item.sourceId),
  ]);
  for (const item of [...input.ledger.revelations, ...input.ledger.knowledgeMilestones]) {
    if (!pending.has(item.sourceId)) throw new Error(`ledger source ${item.sourceId} is no longer pending`);
  }
  for (const sourceId of pending.keys()) {
    if ((sourceId.startsWith('fact:') || sourceId.startsWith('accepted-event:')) && !ledgerSourceIds.has(sourceId)) {
      throw new Error(`pending source ${sourceId} has no private authorization ledger`);
    }
  }

  const sourceLocations = [...new Set([
    ...input.ledger.revelations.map(item => item.sourceLocationId),
    ...input.ledger.knowledgeMilestones.map(item => item.sourceLocationId),
  ])];
  for (const locationId of sourceLocations) {
    if (!getLocationById(locationId)) throw new Error(`pending authorization source location ${locationId} is unknown`);
  }
  const briefs = sourceLocations.map(locationId => briefAtSource(
    input.graph, input.aliases, input.truthContext, locationId,
  ));
  const briefByLocation = new Map(sourceLocations.map((locationId, index) => [locationId, briefs[index]]));

  const revelations: DirectorRevelation[] = [];
  const usableFacts: UsableMysteryFact[] = [];
  for (const item of input.ledger.revelations) {
    assertAliasBinding(input.aliases, item.alias, item.canonicalFactId);
    if (item.sourceId !== `fact:${item.alias}:${item.level}`) throw new Error(`invalid pending fact source ${item.sourceId}`);
    if (pending.get(item.sourceId) !== item.sourceLocationId) throw new Error(`pending fact location changed for ${item.sourceId}`);
    const sourceBrief = briefByLocation.get(item.sourceLocationId)!;
    const usable = sourceBrief.usableFacts.find(fact => fact.id === item.alias);
    if (!usable?.revealOptions.some(option => option.level === item.level)) {
      throw new Error(`pending fact ${item.alias} is no longer usable at its authorized level`);
    }
    revelations.push({
      factId: item.alias,
      level: item.level,
      delivery: item.delivery,
      ...(item.speakerId ? { speakerId: item.speakerId } : {}),
    });
    if (!usableFacts.some(fact => fact.id === usable.id)) {
      usableFacts.push({
        ...usable,
        revealOptions: usable.revealOptions.map(option => ({ ...option })),
        deliveryNpcIds: [...usable.deliveryNpcIds],
      });
    }
  }

  const allowedDiscoveries: PlayerKnowledgeBrief['allowedDiscoveries'] = [];
  const knowledgeEvents: NonNullable<DirectorPlan['knowledgeEvents']> = [];
  for (const item of input.ledger.knowledgeMilestones) {
    if (item.sourceId !== `accepted-event:${item.eventId}`) throw new Error(`invalid pending knowledge source ${item.sourceId}`);
    if (pending.get(item.sourceId) !== item.sourceLocationId) throw new Error(`pending knowledge location changed for ${item.sourceId}`);
    const discovery = briefByLocation.get(item.sourceLocationId)?.playerPresentation.allowedDiscoveries
      .find(candidate => candidate.eventId === item.eventId);
    if (!discovery) throw new Error(`pending knowledge event ${item.eventId} is no longer authorized`);
    knowledgeEvents.push({ eventId: item.eventId, evidence: item.evidence });
    if (!allowedDiscoveries.some(candidate => candidate.eventId === discovery.eventId)) {
      allowedDiscoveries.push({ ...discovery });
    }
  }

  const relevantAliases = new Set(revelations.map(item => item.factId));
  const npcKnowledge = mergeNpcKnowledge(briefs, relevantAliases);
  const baseBrief = briefAtSource(input.graph, input.aliases, input.truthContext, input.truthContext.currentLocation);
  const reviewBrief: MysteryBrief = {
    ...baseBrief,
    usableFacts,
    npcKnowledge,
    hiddenFacts: baseBrief.hiddenFacts.filter(item => !relevantAliases.has(item.id)),
    forbiddenReveals: baseBrief.forbiddenReveals.filter(item => !relevantAliases.has(item.factId)),
    playerPresentation: {
      ...baseBrief.playerPresentation,
      allowedDiscoveries,
    },
    sceneContract: undefined,
    saturationPivot: undefined,
  };
  const hardReview = reviewDirectorPlan({
    turnGoal: '恢复仍未完成行动的原始授权',
    tone: '克制',
    beats: [],
    revelations,
    knowledgeEvents,
    optionIntents: [],
    assetRequests: [],
  }, reviewBrief, { currentLocation: input.truthContext.currentLocation });
  if (!hardReview.approved) {
    throw new Error(`pending authorization failed current hard review: ${hardReview.corrections.join('; ')}`);
  }

  return {
    revelations: revelations.map(item => ({ ...item })),
    knowledgeEvents: knowledgeEvents.map(item => ({ ...item })),
    usableFacts: usableFacts.map(fact => ({
      ...fact,
      revealOptions: fact.revealOptions.map(option => ({ ...option })),
      deliveryNpcIds: [...fact.deliveryNpcIds],
    })),
    npcKnowledge,
    allowedDiscoveries: allowedDiscoveries.map(item => ({ ...item })),
  };
}
