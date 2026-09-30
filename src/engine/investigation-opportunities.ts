import { FIXED_LOCATION_NPC_IDS, buildMysteryBrief } from '../agents/mystery/brief';
import { createFactAliasTable } from '../agents/mystery/fact-aliases';
import { revealLevelRank } from '../agents/mystery/reveal-level';
import { REVEAL_LEVELS, type MysteryTruthGraph, type RevealLevel, type TruthContext } from '../agents/mystery/types';
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
  /** First encounter: no assumption that the player has seen the target record. */
  discoveryGoal?: string;
  /** A hint may introduce one material without introducing the whole evidence chain. */
  hintGoal?: string;
  scope: ActionScope;
  topicKey: string;
  availableUntil?: string;
}

const INVESTIGATION_AFFORDANCES: readonly InvestigationAffordance[] = [
  { factId: 'shared-supermarket-receipt', locationId: 'supermarket', discoveryGoal: '询问店员能否查到与文穗有关的留存记录', hintGoal: '继续查看签收底单背面的路线', publicGoal: '核对事前签收底单和背面的路线标记', scope: 'short', topicKey: 'supermarket:itinerary-receipt' },
  { factId: 'shared-senpai-camera', locationId: 'senpai-building', discoveryGoal: '询问灯织是否有可供查证的文穗来访记录', hintGoal: '核对已见到的楼门口影像与寄存卡日期', publicGoal: '核对楼门口影像日期与寄存卡', scope: 'normal', topicKey: 'senpai-building:dated-records' },
  { factId: 'shared-observation-deck-plan', locationId: 'observation-deck', discoveryGoal: '询问如何查阅观景台的救援登记', hintGoal: '继续核对路线页与救援登记的位置', publicGoal: '对照路线页终点与救援位置登记', scope: 'normal', topicKey: 'observation-deck:location-record' },
  { factId: 'shared-itinerary-crosscheck', locationId: 'home', publicGoal: '把六处行程材料按日期、身份和来源逐项核对', scope: 'deep', topicKey: 'home:itinerary-crosscheck' },
  { factId: 'a-orphanage-contact', locationId: 'old-man-building', discoveryGoal: '询问周大爷与文穗是否有过联系', hintGoal: '追问身世笔记中档案借阅回条的来历', publicGoal: '核对孤儿院查询便笺与档案借阅回条', scope: 'normal', topicKey: 'old-man-building:contact-record' },
  { factId: 'a-window-transfer-match', locationId: 'old-man-building', discoveryGoal: '申请核验旧楼现场与已知案情', publicGoal: '对照伤情、窗槽取样与楼后转运原始记录', scope: 'deep', topicKey: 'old-man-building:forensic-match' },
  { factId: 'b-commission-message', locationId: 'community-hospital', discoveryGoal: '询问医院里的人是否也在寻找文穗', hintGoal: '追问已见联络讯息中的面谈要求', publicGoal: '核对寻找文穗的委托讯息与联络账号', scope: 'normal', topicKey: 'community-hospital:commission-record' },
  { factId: 'b-contact-injury-match', locationId: 'water-tower', discoveryGoal: '申请核验水塔现场与已知案情', publicGoal: '逐项核对接触痕迹、撞击伤情和车辆记录', scope: 'deep', topicKey: 'water-tower:injury-timeline' },
  { factId: 'c-night-gap-record', locationId: 'home', discoveryGoal: '查找家中能核实前夜经过的记录', hintGoal: '复核个人记事与设备日志中对不上的时段', publicGoal: '对照前夜设备日志与个人记事中的缺口', scope: 'normal', topicKey: 'home:night-gap-record' },
  { factId: 'c-domestic-injury-match', locationId: 'home', discoveryGoal: '申请核验家中记录与已知案情', publicGoal: '核验封存录音、出入影像和伤情对应的时间', scope: 'deep', topicKey: 'home:external-case-records' },
  { factId: 'none-railing-maintenance', locationId: 'observation-deck', discoveryGoal: '检查观景台栏杆和步道的状况', hintGoal: '按已见的栏杆维修编号查找对应工单', publicGoal: '按现场编号查验栏杆与排水维修工单', scope: 'normal', topicKey: 'observation-deck:maintenance' },
  { factId: 'none-unassisted-fall-record', locationId: 'observation-deck', discoveryGoal: '申请核验观景台现场与已知案情', publicGoal: '核验连续现场影像与断口、足迹、伤情', scope: 'deep', topicKey: 'observation-deck:independent-fall-record' },
  { factId: 'fake-misidentification-chain', locationId: 'community-hospital', publicGoal: '追查初报姓名从何处录入以及谁完成核验', scope: 'normal', topicKey: 'community-hospital:identity-chain' },
  { factId: 'fake-verified-survival', locationId: 'observation-deck', discoveryGoal: '申请进一步核实文穗的身份与下落', publicGoal: '核验受托身份回执、交接记录及联络保密要求', scope: 'deep', topicKey: 'observation-deck:protected-verification' },
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
  {
    factId: 'none-letter-bedroom',
    locationId: 'home',
    publicGoal: '仔细检查卧室抽屉和夹层',
    scope: 'short',
    topicKey: 'home:bedroom-storage',
  },
  {
    factId: 'none-letter-water-tower',
    locationId: 'water-tower',
    publicGoal: '仔细检查水塔内的夹缝和收纳处',
    scope: 'short',
    topicKey: 'water-tower:notebook',
  },
  {
    factId: 'none-letter-door-gap',
    locationId: 'home',
    publicGoal: '检查公寓门缝和门垫周围',
    scope: 'short',
    topicKey: 'home:doorway',
  },
  {
    factId: 'none-accidental-goodbye',
    locationId: 'observation-deck',
    publicGoal: '沿已知行程复核观景台现场',
    scope: 'deep',
    topicKey: 'observation-deck:route-review',
  },
  {
    factId: 'a-sacrifice-list',
    locationId: 'old-man-building',
    publicGoal: '询问周大爷是否保留过往来人员的旧资料',
    scope: 'normal',
    topicKey: 'old-man-building:orphanage-records',
  },
  {
    factId: 'a-lured-inside',
    locationId: 'old-man-building',
    publicGoal: '核对周大爷对暴雨当天来访者的说法',
    scope: 'normal',
    topicKey: 'old-man-building:visitor-account',
  },
  {
    factId: 'a-murder-staged-fall',
    locationId: 'old-man-building',
    publicGoal: '复查楼内外与坠落相关的可见痕迹',
    scope: 'deep',
    topicKey: 'old-man-building:scene-comparison',
  },
  {
    factId: 'b-water-tower-blood',
    locationId: 'water-tower',
    publicGoal: '检查水塔基座和铁件缝隙的可见痕迹',
    scope: 'normal',
    topicKey: 'water-tower:base-traces',
  },
  {
    factId: 'b-detective-coverup',
    locationId: 'water-tower',
    publicGoal: '对照水塔现场痕迹与已知时间线',
    scope: 'normal',
    topicKey: 'water-tower:timeline',
  },
  {
    factId: 'b-accidental-killing',
    locationId: 'water-tower',
    publicGoal: '综合检查水塔铁件周围的可见痕迹',
    scope: 'deep',
    topicKey: 'water-tower:contact-traces',
  },
  {
    factId: 'c-player-made-leave-call',
    locationId: 'home',
    publicGoal: '核对家中的通话和时间记录',
    scope: 'normal',
    topicKey: 'home:call-records',
  },
  {
    factId: 'c-loop-is-reenactment',
    locationId: 'home',
    publicGoal: '整理每天重复路线与个人时间记录',
    scope: 'normal',
    topicKey: 'home:repeated-route',
  },
  {
    factId: 'c-player-killed-fumi',
    locationId: 'home',
    publicGoal: '检查家中被忽略的前夜痕迹和时间记录',
    scope: 'deep',
    topicKey: 'home:previous-night',
  },
  {
    factId: 'fake-body-mismatch',
    locationId: 'community-hospital',
    discoveryGoal: '询问医院如何核验收到的身份通报',
    hintGoal: '追查初报与病历不一致的栏目及缺失附件',
    publicGoal: '核对医院遗体记录与文穗既往病历',
    scope: 'normal',
    topicKey: 'community-hospital:record-comparison',
  },
  {
    factId: 'fake-alias-ticket',
    locationId: 'home',
    publicGoal: '仔细检查卧室夹层里的遗留物',
    scope: 'short',
    topicKey: 'home:hidden-tickets',
  },
  {
    factId: 'fake-empty-savings',
    locationId: 'supermarket',
    publicGoal: '核对便利店的代收与购买记录',
    scope: 'normal',
    topicKey: 'supermarket:collection-records',
  },
  {
    factId: 'fake-postdeath-sighting',
    locationId: 'mountain-trail',
    publicGoal: '向沿线工作人员核对暴雨后的目击和时间记录',
    scope: 'normal',
    topicKey: 'mountain-trail:travel-witnesses',
  },
  {
    factId: 'fake-touko-request',
    locationId: 'senpai-building',
    publicGoal: '向灯织询问文穗失踪前是否留下托付',
    scope: 'normal',
    topicKey: 'senpai-building:last-request',
  },
  {
    factId: 'fake-staged-death-escape',
    locationId: 'observation-deck',
    publicGoal: '在观景台复核已知行程与现场记录',
    scope: 'deep',
    topicKey: 'observation-deck:record-review',
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

function publicGoalFor(affordance: InvestigationAffordance, knownLevel: RevealLevel | undefined,
  currentLocation: string): string | undefined {
  const knownRank = knownLevel ? revealLevelRank(knownLevel) : -1;
  // Unlocking a destination or reaching a new day is not an introduction to its records.
  if (affordance.discoveryGoal && knownRank < revealLevelRank('hint')
    && affordance.locationId !== currentLocation) return undefined;
  return affordance.discoveryGoal && knownRank < revealLevelRank('clue')
    ? (knownRank >= revealLevelRank('hint') ? affordance.hintGoal : undefined) ?? affordance.discoveryGoal
    : affordance.publicGoal;
}

/** Re-project old menu snapshots without changing history, knowledge, IDs or prices. */
export function refreshPersistedInvestigationMenu<T extends { desc: string; opportunityId?: string }>(
  rows: T[] | undefined, graph: MysteryTruthGraph, variables: Record<string, unknown>,
): T[] | undefined {
  if (!rows) return rows;
  const aliases = createFactAliasTable(graph);
  const knowledge = variables.mysteryKnowledge && typeof variables.mysteryKnowledge === 'object'
    && !Array.isArray(variables.mysteryKnowledge) ? variables.mysteryKnowledge as Record<string, unknown> : {};
  const clueIds = Array.isArray(variables.unlockedClues) ? variables.unlockedClues : [];
  return rows.flatMap(row => {
    const match = row.opportunityId?.match(/^investigation:c\d+:(F\d+):(?:atmosphere|hint|clue|confirmation):(.+)$/);
    const affordance = INVESTIGATION_AFFORDANCES.find(candidate => match
      ? candidate.factId === aliases.aliasToFactId[match[1]] && candidate.locationId === match[2]
      : candidate.publicGoal === row.desc || candidate.discoveryGoal === row.desc || candidate.hintGoal === row.desc);
    if (!affordance?.discoveryGoal) return [row];
    const stored = knowledge[affordance.factId];
    const known = REVEAL_LEVELS.includes(stored as RevealLevel) ? stored as RevealLevel
      : clueIds.includes(affordance.factId) ? 'clue' : undefined;
    const desc = publicGoalFor(affordance, known, String(variables.location ?? 'home'));
    return desc ? [{ ...row, desc }] : [];
  });
}

function enumerateLegalOpportunities(
  input: BuildInvestigationOpportunitiesInput,
): InvestigationOpportunity[] {
  const destinations = visibleDestinationIds(input.context);
  const aliases = createFactAliasTable(input.graph);
  const result: InvestigationOpportunity[] = [];

  for (const affordance of INVESTIGATION_AFFORDANCES) {
    if (!destinations.has(affordance.locationId)) continue;
    const publicGoal = publicGoalFor(affordance, input.context.playerKnowledge[affordance.factId], input.context.currentLocation);
    if (!publicGoal) continue;
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
        publicGoal,
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
