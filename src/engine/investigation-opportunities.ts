import { FIXED_LOCATION_NPC_IDS, buildMysteryBrief } from '../agents/mystery/brief';
import { createFactAliasTable } from '../agents/mystery/fact-aliases';
import { revealLevelRank } from '../agents/mystery/reveal-level';
import type { MysteryTruthGraph, RevealLevel, TruthContext } from '../agents/mystery/types';
import { getLocationById } from '../data/locations';
import type { ActionScope, ResolvedActionOutcome } from './action-resolution';
import { quoteActionSteps } from './action-resolution';
import type { ScheduledBoundary } from './scheduled-events';

export interface PublicInvestigationOpportunity {
  id: string;
  locationId: string;
  publicGoal: string;
  scope: ActionScope;
  availableUntil?: string;
}

export interface InvestigationOpportunity extends PublicInvestigationOpportunity {
  sourceIds: string[];
  topicKey: string;
}

export interface OpportunityProgress {
  cycleCount: number;
  completedIds: string[];
  noProgressByTopic: Record<string, number>;
  settledResolutionIds?: string[];
}

export interface BuildInvestigationOpportunitiesInput {
  graph: MysteryTruthGraph;
  context: TruthContext;
  progress: OpportunityProgress;
  currentTime?: string;
  stamina?: number;
  nextBoundary?: ScheduledBoundary;
}

interface InvestigationAffordance {
  factId: string;
  locationId: string;
  publicGoal: string;
  scope: ActionScope;
  topicKey: string;
  availableUntil?: string;
}

const INVESTIGATION_AFFORDANCES: readonly InvestigationAffordance[] = [
  {
    factId: 'shared-apron-missing',
    locationId: 'home',
    publicGoal: '检查文穗留下的衣物和随身物品',
    scope: 'short',
    topicKey: 'home:belongings',
  },
  {
    factId: 'shared-school-absence',
    locationId: 'school',
    publicGoal: '向门卫确认文穗今天是否到校',
    scope: 'normal',
    topicKey: 'school:attendance',
  },
  {
    factId: 'shared-male-leave-call',
    locationId: 'school',
    publicGoal: '核对文穗的请假记录',
    scope: 'short',
    topicKey: 'school:leave-record',
  },
  {
    factId: 'shared-nurse-school-inquiry',
    locationId: 'school',
    publicGoal: '询问是否还有其他人来找过文穗',
    scope: 'normal',
    topicKey: 'school:other-visitors',
  },
  {
    factId: 'shared-water-tower-secret',
    locationId: 'water-tower',
    publicGoal: '检查水塔内可见的生活痕迹和遗留物',
    scope: 'normal',
    topicKey: 'water-tower:visible-traces',
  },
  {
    factId: 'shared-detective-tail',
    locationId: 'mountain-trail',
    publicGoal: '沿山路询问当天见过文穗的人',
    scope: 'normal',
    topicKey: 'mountain-trail:witnesses',
  },
  {
    factId: 'red-herring-part-time-job',
    locationId: 'supermarket',
    publicGoal: '向店员询问文穗最近是否来过便利店',
    scope: 'normal',
    topicKey: 'supermarket:recent-visit',
  },
];

function visibleDestinationIds(context: TruthContext): Set<string> {
  const ids = new Set(
    (context.playerPresentation?.locations ?? [])
      .filter(location => location.canTravel)
      .map(location => location.id),
  );
  if (getLocationById(context.currentLocation)) ids.add(context.currentLocation);
  return ids;
}

function opportunityId(cycleCount: number, alias: string, level: RevealLevel, locationId: string): string {
  return `investigation:c${cycleCount}:${alias}:${level}:${locationId}`;
}

function enumerateLegalOpportunities(
  input: BuildInvestigationOpportunitiesInput,
): InvestigationOpportunity[] {
  const destinations = visibleDestinationIds(input.context);
  const aliases = createFactAliasTable(input.graph);
  const result: InvestigationOpportunity[] = [];

  for (const affordance of INVESTIGATION_AFFORDANCES) {
    if (!destinations.has(affordance.locationId)) continue;
    const brief = buildMysteryBrief(input.graph, {
      ...input.context,
      currentLocation: affordance.locationId,
      activeNpcIds: [...(FIXED_LOCATION_NPC_IDS[affordance.locationId] ?? [])],
    });
    const usable = brief.usableFacts.find(fact => fact.id === affordance.factId);
    const alias = aliases.factIdToAlias[affordance.factId];
    if (!usable || !alias) continue;
    for (const option of usable.revealOptions) {
      result.push({
        id: opportunityId(input.context.cycleCount, alias, option.level, affordance.locationId),
        locationId: affordance.locationId,
        publicGoal: affordance.publicGoal,
        scope: affordance.scope,
        sourceIds: [`fact:${alias}:${option.level}`],
        topicKey: affordance.topicKey,
        ...(affordance.availableUntil ? { availableUntil: affordance.availableUntil } : {}),
      });
    }
  }
  return result;
}

export function buildInvestigationOpportunities(
  input: BuildInvestigationOpportunitiesInput,
): InvestigationOpportunity[] {
  const known = input.context.playerKnowledge;
  const aliases = createFactAliasTable(input.graph);
  const completed = new Set(input.progress.cycleCount === input.context.cycleCount
    ? input.progress.completedIds : []);
  const bestByTopic = new Map<string, InvestigationOpportunity>();
  for (const opportunity of enumerateLegalOpportunities(input)) {
    if (completed.has(opportunity.id)) continue;
    const source = opportunity.sourceIds[0];
    const [, alias, level] = source.split(':') as [string, string, RevealLevel];
    const canonicalId = aliases.aliasToFactId[alias];
    const previousLevel = canonicalId ? known[canonicalId] : undefined;
    if (previousLevel && revealLevelRank(level) <= revealLevelRank(previousLevel)) continue;
    const previous = bestByTopic.get(opportunity.topicKey);
    if (!previous || revealLevelRank(level) > revealLevelRank(previous.sourceIds[0].split(':')[2] as RevealLevel)) {
      bestByTopic.set(opportunity.topicKey, opportunity);
    }
  }
  const candidates = [...bestByTopic.values()];
  const minutesToBoundary = input.currentTime && input.nextBoundary
    ? Math.floor((new Date(input.nextBoundary.at).getTime() - new Date(input.currentTime).getTime()) / 60_000)
    : undefined;
  const score = (opportunity: InvestigationOpportunity) => {
    const quote = quoteActionSteps({
      currentLocationId: input.context.currentLocation,
      steps: [{
        id: `quote:${opportunity.id}`,
        kind: 'inquiry',
        scope: opportunity.scope,
        locationId: opportunity.locationId,
        opportunityId: opportunity.id,
        completionSourceIds: [...opportunity.sourceIds],
      }],
    });
    const affordable = input.stamina === undefined || quote.staminaCost <= input.stamina;
    const completable = minutesToBoundary === undefined || (minutesToBoundary > 0 && quote.totalMinutes <= minutesToBoundary);
    const fresh = input.progress.cycleCount !== input.context.cycleCount
      || (input.progress.noProgressByTopic[opportunity.topicKey] ?? 0) < 2;
    return { attainable: affordable && completable, fresh, totalMinutes: quote.totalMinutes };
  };
  return candidates
    .map((opportunity, index) => ({ opportunity, index, score: score(opportunity) }))
    .sort((left, right) => (
      Number(right.score.attainable) - Number(left.score.attainable)
      || Number(right.score.fresh) - Number(left.score.fresh)
      || left.score.totalMinutes - right.score.totalMinutes
      || left.index - right.index
    ))
    .map(item => item.opportunity);
}

export function findInvestigationOpportunity(
  input: BuildInvestigationOpportunitiesInput,
  id: string,
): InvestigationOpportunity | undefined {
  return enumerateLegalOpportunities(input).find(opportunity => opportunity.id === id);
}

export function projectPublicInvestigationOpportunities(
  opportunities: readonly InvestigationOpportunity[],
): PublicInvestigationOpportunity[] {
  return opportunities.map(({ id, locationId, publicGoal, scope, availableUntil }) => ({
    id,
    locationId,
    publicGoal,
    scope,
    ...(availableUntil ? { availableUntil } : {}),
  }));
}

export function settleOpportunityProgress(input: {
  previous: OpportunityProgress;
  selected?: InvestigationOpportunity;
  resolution: ResolvedActionOutcome;
  newSourceIds: readonly string[];
}): OpportunityProgress {
  const current: OpportunityProgress = input.previous.cycleCount === input.resolution.cycleCount
    ? {
        cycleCount: input.previous.cycleCount,
        completedIds: [...new Set(input.previous.completedIds)],
        noProgressByTopic: { ...input.previous.noProgressByTopic },
        settledResolutionIds: [...new Set(input.previous.settledResolutionIds ?? [])],
      }
    : {
        cycleCount: input.resolution.cycleCount,
        completedIds: [],
        noProgressByTopic: {},
        settledResolutionIds: [],
      };
  if (current.settledResolutionIds!.includes(input.resolution.id)) return current;
  current.settledResolutionIds!.push(input.resolution.id);

  const selected = input.selected;
  if (!selected) return current;
  const completedAttempt = input.resolution.segments.some(segment => (
    segment.completed
    && segment.step.opportunityId === selected.id
    && ['inquiry', 'investigation', 'search'].includes(segment.step.kind)
  ));
  if (!completedAttempt) return current;

  const completedSources = new Set(input.resolution.completedSourceIds);
  const newlyCommittedSources = new Set(input.newSourceIds);
  const madeProgress = selected.sourceIds.some(sourceId => (
    completedSources.has(sourceId) && newlyCommittedSources.has(sourceId)
  ));
  if (madeProgress) {
    if (!current.completedIds.includes(selected.id)) current.completedIds.push(selected.id);
    delete current.noProgressByTopic[selected.topicKey];
  } else {
    current.noProgressByTopic[selected.topicKey] = (current.noProgressByTopic[selected.topicKey] ?? 0) + 1;
  }
  return current;
}
