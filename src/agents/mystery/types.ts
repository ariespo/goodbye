export const MYSTERY_ROUTE_IDS = ['A', 'B', 'C', 'NONE', 'FAKE'] as const;
export type MysteryRouteId = (typeof MYSTERY_ROUTE_IDS)[number];
export const MYSTERY_OVERLAY_IDS = ['CULT', 'PSYCH'] as const;
export type MysteryOverlayId = (typeof MYSTERY_OVERLAY_IDS)[number];
export type MysteryFactRoute = MysteryRouteId | MysteryOverlayId | 'shared';

export const REVEAL_LEVELS = ['atmosphere', 'hint', 'clue', 'confirmation'] as const;
export type RevealLevel = (typeof REVEAL_LEVELS)[number];

export type MysteryFactKind =
  | 'event'
  | 'motive'
  | 'evidence'
  | 'alibi'
  | 'npc-knowledge'
  | 'red-herring'
  | 'solution';

export interface SuspicionRequirement {
  actorId: string;
  minimum: number;
}

export interface MysteryFactAvailability {
  minCycle?: number;
  locations?: string[];
  requiredClueIds?: string[];
  requiredAnyClueIds?: string[];
  minSuspicion?: SuspicionRequirement;
  minAnySuspicion?: {
    actorIds: string[];
    minimum: number;
  };
  minAffinity?: SuspicionRequirement;
  minTripProgress?: number;
  requiredKnownFactSet?: {
    factIds: string[];
    minimum: number;
  };
  requiredBaseRoute?: MysteryRouteId;
  maxSanity?: number;
  requiresRouteLock?: boolean;
  requiresOverlayLock?: boolean;
  maxRevealBeforeRouteLock?: RevealLevel;
  maxRevealAfterRouteLock?: RevealLevel;
}

export interface MysteryFact {
  id: string;
  route: MysteryFactRoute;
  kind: MysteryFactKind;
  canonicalTruth: string;
  characters: string[];
  locations: string[];
  revelations: Partial<Record<RevealLevel, string>>;
  availability: MysteryFactAvailability;
  /** 该事实实际会提高哪些调查对象的嫌疑；缺省表示只补充案情、不指向人物。 */
  suspicionTargets?: string[];
}

export interface NpcFactKnowledge {
  npcId: string;
  factId: string;
  maxRevealLevel: RevealLevel;
  stance: 'knows' | 'believes' | 'suspects' | 'lies-about';
}

export interface MysteryTruthGraph {
  version: string;
  facts: MysteryFact[];
  npcKnowledge: NpcFactKnowledge[];
}

export interface NarrativeSceneContract {
  destinationLocationId: string;
  destinationBackground: string;
  entryMode: 'exterior' | 'interior' | 'destination';
  requiredDestinationNpcIds: string[];
  requiredEnRouteNpcIds: string[];
  forbiddenNpcIds: string[];
  requiredKnowledgeEvents: Array<{ eventId: string; evidence: string }>;
  forbiddenKnowledgeEventIds: string[];
  directive: string;
}

export interface TruthContext {
  cycleCount: number;
  currentLocation: string;
  lockedRoute: MysteryRouteId | null;
  unlockedClueIds: string[];
  playerKnowledge: Record<string, RevealLevel>;
  suspicion: Record<string, number>;
  affinity?: Record<string, number>;
  tripProgress?: number;
  sanity?: number;
  activeOverlay?: MysteryOverlayId | null;
  activeNpcIds: string[];
  recentRevealedFactIds?: string[];
  playerPresentation?: PlayerKnowledgeBrief;
  playerIdentity?: PlayerIdentity;
  playerIdentityVariables?: Record<string, unknown>;
  sceneContract?: NarrativeSceneContract;
}

export interface ProjectedFact {
  id: string;
  route: MysteryFactRoute;
  kind: MysteryFactKind;
  level: RevealLevel;
  text: string;
}

export interface UsableMysteryFact {
  id: string;
  route: MysteryFactRoute;
  kind: MysteryFactKind;
  maxRevealLevel: RevealLevel;
  revealOptions: ProjectedFact[];
  deliveryNpcIds: string[];
}

export interface HiddenFactReference {
  id: string;
  route: MysteryFactRoute;
  kind: MysteryFactKind;
  reason: string;
}

export interface ForbiddenReveal {
  factId: string;
  forbiddenAbove: RevealLevel | null;
  reason: string;
}

export interface NpcKnowledgeBrief {
  npcId: string;
  facts: Array<{
    factId: string;
    maxRevealLevel: RevealLevel;
    stance: NpcFactKnowledge['stance'];
  }>;
}

export interface RevealBudget {
  maxNewFacts: number;
  maxRevealLevel: RevealLevel;
  allowConfirmation: boolean;
  reason: string;
}

export interface MysteryBrief {
  graphVersion: string;
  routeMode: MysteryRouteId | 'exploratory';
  playerKnownFacts: ProjectedFact[];
  usableFacts: UsableMysteryFact[];
  hiddenFacts: HiddenFactReference[];
  allowedRedHerrings: string[];
  npcKnowledge: NpcKnowledgeBrief[];
  forbiddenReveals: ForbiddenReveal[];
  revealBudget: RevealBudget;
  continuityWarnings: string[];
  playerPresentation: PlayerKnowledgeBrief;
  characterPerformances: CharacterPerformanceProfile[];
  npcPlayerKnowledge?: NpcPlayerKnowledgeBrief[];
  sceneContract?: NarrativeSceneContract;
  /** 当玩家继续追查已达当日上限的角色时，由引擎选定并强制审查的异角色转场。 */
  saturationPivot?: SaturationPivotBrief;
}

export interface DirectorRevelation {
  factId: string;
  level: RevealLevel;
  delivery: 'narration' | 'dialogue' | 'object' | 'environment';
  speakerId?: string;
}

export interface DirectorBeat {
  id: string;
  purpose: string;
  description: string;
  locationId?: string;
  speakerIds?: string[];
  /** 只有叙述已发生的往事时才填写，且必须引用本回合上下文中真实存在的记忆 ID。 */
  sourceMemoryIds?: string[];
}

export interface DirectorOptionIntent {
  id: string;
  intent: string;
  tone: string;
  expectedPressure: 'low' | 'medium' | 'high';
}

export interface DirectorScenePlan {
  observeFocus: string;
  observeConceal?: string;
  investigateIntents: Array<{
    intent: string;
    suspectId?: string;
    factId?: string;
    costTier: 'light' | 'medium' | 'heavy';
  }>;
  actionIntents: Array<{ intent: string; costTier: 'light' | 'medium' | 'heavy' }>;
}

export interface DirectorPlan {
  turnGoal: string;
  tone: string;
  beats: DirectorBeat[];
  revelations: DirectorRevelation[];
  optionIntents: DirectorOptionIntent[];
  assetRequests: string[];
  knowledgeEvents?: Array<{ eventId: string; evidence: string }>;
  scenePlan?: DirectorScenePlan;
  /** 本回合预计经过的分钟数(1-180)，引擎据此推进游戏时钟 */
  timeCostMinutes?: number;
}

export type FactReviewViolationCode =
  | 'unknown-fact'
  | 'fact-not-usable'
  | 'reveal-too-deep'
  | 'confirmation-forbidden'
  | 'reveal-budget-exceeded'
  | 'duplicate-revelation'
  | 'npc-knowledge-violation'
  | 'saturation-pivot-violation'
  | 'character-performance-violation'
  | 'player-knowledge-violation'
  | 'scene-contract-violation'
  | 'ungrounded-past-claim';

export interface FactReviewViolation {
  code: FactReviewViolationCode;
  factId?: string;
  message: string;
}

export interface FactReview {
  approved: boolean;
  violations: FactReviewViolation[];
  corrections: string[];
}

export interface WriterFact {
  id: string;
  level: RevealLevel;
  text: string;
  delivery: DirectorRevelation['delivery'];
  speakerId?: string;
}

export interface WriterPacket {
  plan: Omit<DirectorPlan, 'revelations' | 'knowledgeEvents'>;
  playerKnownFacts: ProjectedFact[];
  authorizedFacts: WriterFact[];
  authorizedKnowledgeEvents: Array<{ eventId: string; evidence: string }>;
  forbiddenInstructions: string[];
  playerPresentation: PlayerKnowledgeBrief;
  characterPerformances: CharacterPerformanceProfile[];
  npcPlayerKnowledge?: NpcPlayerKnowledgeBrief[];
  sceneContract?: NarrativeSceneContract;
  saturationPivot?: SaturationPivotBrief;
}

export interface SaturationPivotBrief {
  blockedActorId: string;
  redirectedActorId: string;
  factId: string;
  interveningNpcId: string;
  currentLocationId: string;
  requiredSuspicionGain: number;
  directive: string;
}
import type { PlayerKnowledgeBrief } from '../../data/playerKnowledge';
import type { CharacterPerformanceProfile } from '../../data/characterPerformance';
import type { NpcPlayerKnowledgeBrief, PlayerIdentity } from '../../data/npcPlayerKnowledge';
