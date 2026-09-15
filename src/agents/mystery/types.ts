import type { BackgroundFactProposal, BackgroundFactRecord } from '../../data/backgroundHistory';

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
  /** Local story-clock threshold for obtaining a new fact; memories are retained separately. */
  notBeforeTime?: string;
  locations?: string[];
  requiredClueIds?: string[];
  requiredConfirmedFactIds?: string[];
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
  currentTime?: string;
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
  sceneContracts?: NarrativeSceneContract[];
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
  sceneContracts?: NarrativeSceneContract[];
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
  /** Fixed or accepted soft-canon facts authorizing pre-game history. */
  sourceBackgroundFactIds?: string[];
}

export interface DirectorOptionIntent {
  id: string;
  intent: string;
  tone: string;
  expectedPressure: 'low' | 'medium' | 'high';
  /** Untrusted echo of a program-offered action; the program must revalidate it. */
  opportunityId?: string;
  scope?: import('../../engine/action-resolution').ActionScope;
}

export interface DirectorScenePlan {
  observeFocus: string;
  observeConceal?: string;
  investigateIntents: Array<{
    intent: string;
    suspectId?: string;
    factId?: string;
    costTier: 'light' | 'medium' | 'heavy';
    opportunityId?: string;
    scope?: import('../../engine/action-resolution').ActionScope;
  }>;
  actionIntents: Array<{
    intent: string;
    costTier: 'light' | 'medium' | 'heavy';
    opportunityId?: string;
    scope?: import('../../engine/action-resolution').ActionScope;
  }>;
}

/** Director-owned intent proposal. Program authority adds costs, sources and event effects. */
export interface DirectorActionStepProposal {
  id: string;
  kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait';
  scope: import('../../engine/action-resolution').ActionScope;
  locationId: string;
}

export interface DirectorPlan {
  turnGoal: string;
  tone: string;
  beats: DirectorBeat[];
  revelations: DirectorRevelation[];
  optionIntents: DirectorOptionIntent[];
  assetRequests: string[];
  knowledgeEvents?: Array<{ eventId: string; evidence: string }>;
  backgroundFactProposals?: BackgroundFactProposal[];
  scenePlan?: DirectorScenePlan;
  /** Intent-only stages; the program validates them and owns costs and outcomes. */
  actionSteps?: DirectorActionStepProposal[];
  /** 旧格式兼容的建议值；程序结算会忽略它。 */
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
  | 'missing-fixed-location-npc'
  | 'ungrounded-past-claim'
  | 'ungrounded-evidence-detail'
  | 'repeated-prose'
  | 'repeated-imagery'
  | 'style-template-repetition'
  | 'unknown-background-fact'
  | 'soft-canon-violation'
  | 'incomplete-assertion-audit'
  | 'invalid-assertion-citation'
  | 'unsupported-assertion'
  | 'contradicted-assertion'
  | 'incomplete-continuity-audit'
  | 'invalid-continuity-audit'
  | 'auxiliary-continuity-effect';

export interface FactReviewViolation {
  code: FactReviewViolationCode;
  factId?: string;
  message: string;
}

export interface FactReview {
  approved: boolean;
  violations: FactReviewViolation[];
  corrections: string[];
  assertionAudit?: import('./fact-assertion-review').AssertionAudit;
  /** Required for playable reviews carrying both intent and deterministic execution. */
  actionAudit?: import('./action-audit').ActionAudit | null;
  /** Optional only for legacy persisted reviews; every new live fact review must supply it. */
  continuityAudit?: import('../../memory/character-continuity').CharacterContinuityAudit;
  /** Program-validated effects for this exact candidate; never accepted from model output. */
  continuityEffects?: import('../../memory/character-continuity').ValidatedCharacterContinuityEffects;
}

export interface WriterFact {
  id: string;
  level: RevealLevel;
  text: string;
  delivery: DirectorRevelation['delivery'];
  speakerId?: string;
}

export interface WriterPacket {
  actionIntentAudit?: {
    planGoal: string;
    plannedLocations: string[];
    plannedNpcIds: string[];
    originalInput: string;
    startLocationId: string;
    boundIntent?: import('../../engine/player-action-intent').ActionIntentSnapshot;
    approvedSteps?: DirectorActionStepProposal[];
    requestedStepCount?: number;
    extensionStepCount?: number;
    executedSteps: Array<{ kind: import('../../engine/action-resolution').ActionStep['kind'];
      scope: import('../../engine/action-resolution').ActionScope; locationId: string;
      executedMinutes: number; completed: boolean }>;
    interruption?: import('../../engine/action-resolution').ResolvedActionOutcome['interruption'];
  };
  /** Public clock, accepted history and memory survive both semantic and format repairs. */
  continuityContext?: Record<string, unknown>;
  plan: Omit<DirectorPlan, 'revelations' | 'knowledgeEvents' | 'backgroundFactProposals'>;
  playerKnownFacts: ProjectedFact[];
  /** Program-owned, current-turn permission to repeat an exact known fact level. Legacy packets grant no NPC speakers. */
  knownFactSpeakers?: Array<{ factId: string; level: RevealLevel; speakerIds: string[] }>;
  authorizedFacts: WriterFact[];
  authorizedKnowledgeEvents: Array<{ eventId: string; evidence: string }>;
  authorizedActionOutcomes?: Array<{ id: string; text: string; speakerIds?: string[] }>;
  /** Required for new live turns; optional only while reading legacy test or persisted packets. */
  resolvedAction?: import('../../engine/action-resolution').ResolvedActionOutcome;
  authorizedBackgroundFacts: BackgroundFactRecord[];
  authorizedBackgroundSpeakers?: Array<{ factId: string; speakerIds: string[] }>;
  approvedBackgroundFactProposals: BackgroundFactProposal[];
  forbiddenInstructions: string[];
  playerPresentation: PlayerKnowledgeBrief;
  characterPerformances: CharacterPerformanceProfile[];
  npcPlayerKnowledge?: NpcPlayerKnowledgeBrief[];
  sceneContract?: NarrativeSceneContract;
  sceneContracts?: NarrativeSceneContract[];
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
