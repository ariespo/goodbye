# Day Action Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every playable action spend scarce, disclosed time, expose only earned authorized outcomes, and maintain correct character cognition across repeated days.

**Architecture:** Retain the fact gate → Director → hard/semantic review → Writer → validation → State → deterministic transaction pipeline. Introduce a pure action resolver before WriterPacket construction, individual assertion/source review, and small extensions to the existing world-memory ledger; UI, Writer, fact commits and transaction consume the same outcome.

**Tech Stack:** TypeScript 5.8, React 19, Zustand 5, Vite 8, Vitest 3, existing model API router and Dexie persistence.

**Spec:** `docs/superpowers/specs/2026-09-14-day-action-authority-design.md`

## Global Constraints

- Short inquiry costs 20–30 minutes; normal inquiry/investigation costs 45–60 minutes; deep investigation costs 90–120 minutes. Default quotes are 25, 55, and 105 minutes respectively.
- Travel is additional, charged once per actual leg through `estimateTravel`; two actions at one destination share that leg. The 08:00–16:00 investigation window is 480 minutes, with a tuning target of 5–8 investigations; a full calendar day targets roughly 10–16 major actions. These are tuning targets, never hard turn caps.
- Writer never receives canonical truth and never owns state. State cannot own time, resources resolved by the action authority, loops, routes, endings, facts, memory ledgers, action continuations, or opportunity counters.
- Days 1–3 cannot reveal solution/confirmation or commit normal route endings; `cycleCount >= 4` is necessary, never sufficient. Suspicion persists but increases at most +15 per actor per repeated day, tied to new authorized evidence.
- User approved continued implementation through all three phases; execute without another design approval stop. Do not deploy or claim verification beyond obtained evidence.
- Production worktree: `F:/farewell-day-action-authority`, created from `51f6da6`; design docs authored in main `H:/goodbye/farewell-web` and copied to worktree by root. Baseline root reports 97 files/771 tests passing. All paths below are repository-relative.
- Workers are not alone in the codebase. Each owns only assigned files; do not revert other edits. Root serializes shared-file integration and commits after review; individual workers do not commit unless root assigns that step.

---

## File ownership and execution order

| Unit | Focused new module | Existing integration owner |
|---|---|---|
| Task 1 | No new subsystem | Location, protocol and state-ingress worker; narrow transaction guard only |
| Task 2 | `src/agents/mystery/fact-assertion-review.ts` | Fact-review worker; orchestrator/prompt changes coordinated with root |
| Task 3 | `src/engine/action-resolution.ts` | Resolver worker; no hook edits |
| Task 4 | Uses Task 3 | Root owns hook/orchestrator/state/transaction integration after prior tasks finish |
| Task 5 | `src/engine/investigation-opportunities.ts` | Opportunity worker; root merges hook and prompt integration |
| Task 6 | `src/memory/character-continuity.ts` | Memory worker; root merges hook/packet integration |
| Task 7 | Uses Tasks 3–6 | UI worker, then root integration |
| Task 8 | `scripts/live-action-authority.test.tsx` | Root owns acceptance harness, reports and final checks |

Execute 1 → 2 (phase 1), 3 → 4 (phase 2), 5 → 6 → 7 → 8 (phase 3). Task 3 pure module can begin after phase-1 interfaces are fixed, but it must not overlap writes to phase-1 shared files. Do not start separate agents for tasks unless root/user authorization permits them; the user has authorized subagent implementation in this session. Every task uses a red-test/run/minimal-change/green-test/review cycle. A green narrow test is an independent review gate, not a final product claim.

## Shared interfaces

Keep these types exported from the indicated focused module. Optional fields in old persisted records default safely during migration; live resolver inputs/results are validated and complete.

```ts
// src/data/locations.ts
export interface RegisteredLocationResolution {
  locationId: string; // registered map anchor
  sceneId?: 'street';
  accepted: boolean;
}
export function resolveRegisteredLocation(id: unknown, currentId: string): RegisteredLocationResolution;

// src/agents/mystery/fact-assertion-review.ts
export interface AssertionSource {
  id: string;
  kind: 'fact' | 'public-event' | 'background' | 'accepted-event' | 'action-outcome';
  text: string;
  factId?: string;
  level?: import('./types').RevealLevel;
  speakerIds?: string[];
  requiredEvidenceText?: string; // conditional approved soft proposal; must occur in actual playable maintext
}
export interface NarrativeAssertion {
  field: string; quote: string; proposition: string;
  status: 'supported' | 'unsupported' | 'contradicted' | 'question' | 'hypothesis' | 'ordinary-present';
  citations: Array<{ sourceId: string; quote: string }>;
  reason: string;
}
export interface AssertionAudit {
  reviewedFields: string[];
  assertions: NarrativeAssertion[];
}
export function buildAssertionSources(packet: import('./types').WriterPacket,
  narrativeFields?: Record<string, string>): AssertionSource[];
export function validateAssertionAudit(
  audit: AssertionAudit,
  sources: AssertionSource[],
  narrativeFields: Record<string, string>,
): import('./types').FactReview;

// src/engine/action-resolution.ts
export type ActionScope = 'short' | 'normal' | 'deep';
export interface ActionStep {
  id: string;
  kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait' | 'event' | 'fantasy';
  scope: ActionScope;
  locationId: string;
  opportunityId?: string;
  completionSourceIds: string[];
  // Only validated clock/event/UI inputs may supply an exact wait/rest duration.
  requestedMinutes?: number;
}
export interface ActionContinuation {
  actionId: string; cycleCount: number; steps: ActionStep[];
  previousResolutionId: string; stepsDigest: string;
  resumableFromTime: string; expectedLocationId: string;
  activeStepId: string; completedMinutesByStep: Record<string, number>;
  chargedStaminaByStep: Record<string, number>;
}
export interface ResolvedActionSegment {
  step: ActionStep; plannedMinutes: number; executedMinutes: number;
  cumulativeExecutedMinutes: number; staminaDelta: number;
  completed: boolean;
}
export interface ResolvedActionOutcome {
  id: string; cycleCount: number; startTime: string; endTime: string;
  startLocationId: string; endLocationId: string;
  plannedMinutes: number; executedMinutes: number;
  segments: ResolvedActionSegment[];
  resources: { before: { stamina: number; sanity: number }; after: { stamina: number; sanity: number } };
  completedSourceIds: string[];
  interruption?: { id: string; at: string };
  continuation?: ActionContinuation;
  eventEffectIds: string[];
}
export interface ResolveActionInput {
  id: string; cycleCount: number; startTime: string; currentLocationId: string;
  stamina: number; sanity: number; steps: ActionStep[];
  explicitBudgetMinutes?: number;
  nextBoundary?: { id: string; at: string };
  continuation?: ActionContinuation;
  appliedEventEffectIds?: string[];
}
export function quoteActionSteps(input: Pick<ResolveActionInput,
  'currentLocationId' | 'steps' | 'continuation'>): { workMinutes: number; travelMinutes: number; totalMinutes: number; staminaCost: number };
export function resolveAction(input: ResolveActionInput): ResolvedActionOutcome;

// src/engine/investigation-opportunities.ts
export interface InvestigationOpportunity {
  id: string; locationId: string; publicGoal: string; scope: ActionScope;
  sourceIds: string[]; topicKey: string; availableUntil?: string;
}
export interface OpportunityProgress {
  cycleCount: number; completedIds: string[];
  noProgressByTopic: Record<string, number>;
}
export function buildInvestigationOpportunities(input: {
  graph: import('../agents/mystery/types').MysteryTruthGraph;
  context: import('../agents/mystery/types').TruthContext;
  progress: OpportunityProgress;
}): InvestigationOpportunity[];
export function settleOpportunityProgress(input: {
  previous: OpportunityProgress; selected?: InvestigationOpportunity;
  resolution: ResolvedActionOutcome; newSourceIds: string[];
}): OpportunityProgress;
```

Root may rename a type for an existing convention, but must change its consumers/tests in the same task and update this plan. Do not create two incompatible interfaces for the same authority.

### Task 1: registered locations and playable protocol

**Files:** Modify `src/data/locations.ts`, `src/sillytavern/vars-validator.ts`, `src/agents/state/state-agent.ts`, `src/engine/game-transaction.ts`, `src/sillytavern/output-protocol.ts`; tests in each existing sibling test file. No action-price or memory changes in this task.

**Interfaces:** Consume existing `gameLocations`, `getLocationById`, `sanitizeVarsPatch`, `validateStateAgentResponse`, `settleGameTransaction`; produce `resolveRegisteredLocation` above.

- [x] Add red cases using existing fixtures plus these standalone location assertions:

```ts
it('retains the registered anchor for an unknown generated location', () => {
  expect(resolveRegisteredLocation('police_station', 'school'))
    .toEqual({ locationId: 'school', accepted: false });
});
it('represents outdoor transit without inventing a map coordinate', () => {
  expect(resolveRegisteredLocation('street', 'school'))
    .toEqual({ locationId: 'school', sceneId: 'street', accepted: true });
  expect(resolveRegisteredLocation('supermarket', 'school'))
    .toEqual({ locationId: 'supermarket', accepted: true });
});
```

- [x] Run `npm test -- --run src/data/locations.test.ts src/agents/state/state-agent.test.ts src/sillytavern/vars-validator.test.ts src/engine/game-transaction.test.ts src/sillytavern/output-protocol.test.ts`; confirm new unknown-location/dialogue-escape assertions fail before implementation.
- [x] Implement the shared resolver: named ID accepted; `street` accepted with current anchor and transient scene metadata; unknown rejected. For old corrupt current ID only, select the existing registered default explicitly during migration, not as acceptance of the new mutation. Replace free location assignment with this guard at State/legacy sanitation and transaction. Reject nested or non-string location values. Preserve rejection evidence in sanitizer output.

```ts
const location = resolveRegisteredLocation(value, String(current.location ?? 'home'));
if (!location.accepted) {
  rejected.push({ path: 'location', reason: '未注册的地图地点' });
} else {
  vars.location = location.locationId;
}
```

- [x] Add raw protocol fixture whose playable `对话|旁白|calm|` text contains a literal backslash-n before ordinary prose, not another command; assert rejection. Keep a JSON `vars` escaped string and an ordinary backslash control positive. Expand playable-field checks; use existing format repair and rerun complete protocol/fact review, never `JSON.parse` an arbitrary dialogue line or globally replace every backslash.
- [x] Rerun the focused tests; root reviews diff for silent-home fallback and transient-scene handling. Commit checkpoint only through root after this gate.

### Task 2: individual assertion/source review

**Files:** Create `src/agents/mystery/fact-assertion-review.ts` and `.test.ts`; modify `types.ts`, `schemas.ts`, `prompts.ts`, `narrative-review.ts`, `orchestrator.ts`, `review.ts`; after Task1 ownership is released, modify `src/sillytavern/vars-validator.ts` and its tests for model fact-write denial. Extend `narrative-review.test.ts`, `narrative-repair.test.ts`, `orchestrator.test.ts` and `scene-contract-review.test.ts`. Root integrates checklist review in `useGameLoop.ts` after worker finishes.

**Interfaces:** Consume WriterPacket projected sources and existing `FactReview`; produce assertion types/functions above. Add optional `assertionAudit?: AssertionAudit` to semantic result types for transport; require it for live narrative approval. Existing deterministic hard reviews remain valid without this field. Add source fields only through approved public projections; never serialize graph `canonicalTruth`.

- [x] Add red regression table for actual gateway text and permissive boundaries. Exact fixture assertions include:

```ts
const fields = { maintext: '店员说清晨六点半前后有白色配送车送面包牛奶。' };
const sources = [{ id: 'public:message', kind: 'public-event' as const,
  text: '06:50文穗发消息说今天不去学校。' }];
it('does not authorize a delivery timeline from an unrelated time source', () => {
  const result = validateAssertionAudit({ reviewedFields: ['maintext'], assertions: [{
    field: 'maintext', quote: fields.maintext, proposition: '06:30配送车辆到过便利店',
    status: 'unsupported', citations: [], reason: '无配送事件来源',
  }] }, sources, fields);
  expect(result.approved).toBe(false);
});
it('rejects a real source id with an invented source quote', () => {
  const result = validateAssertionAudit({ reviewedFields: ['maintext'], assertions: [{
    field: 'maintext', quote: fields.maintext, proposition: '配送车来访', status: 'supported',
    citations: [{ sourceId: 'public:message', quote: '六点半配送车' }], reason: 'claimed source',
  }] }, sources, fields);
  expect(result.approved).toBe(false);
});
```

- [x] Run `npm test -- --run src/agents/mystery/narrative-review.test.ts src/agents/mystery/fact-assertion-review.test.ts`; verify failures. Add paired semantic mocks for supported06:50 paraphrase, ordinary water handover, no reply this attempt, “可能” hypothesis, and authorized confirmation; add unsupported no-login/negative attendance/note-time drift and option/summary/checklist-only claims. A mock is structural integration evidence; real-model cases remain Task8.
- [x] Build sources separately by source type. Source IDs alone are not entailment; require exact cited source substring, actual assertion span, permissible delivery and audit field coverage. Extend critic JSON schema/prompt to extract and compare each material proposition, not return only a blanket approval. Empty or missing audits on material prose are review failures, and an unsupported assertion blocks even if top-level approved=true.

```ts
const byId = new Map(sources.map(source => [source.id, source]));
const badCitation = claim.citations.some(citation => {
  const source = byId.get(citation.sourceId);
  return !source || !citation.quote.trim() || !source.text.includes(citation.quote);
});
const badSupport = claim.status === 'supported' &&
  (claim.citations.length === 0 || badCitation);
// Combine this structural check with semantic unsupported/contradicted findings.
```

- [x] Remove broad `caseAuthorization` and background-length exemptions. Replace global confirmation sanitizer erasure with exact fact/reveal/delivery validation; never erase an unrelated unsupported assertion. Keep deterministic precise sentinel tests, but document they cannot prove semantic coverage. Hard-review registered plan destinations with the Task1 resolver and preserve allowed street scene anchored to current location.
- [x] Close compatibility model fact writes explicitly: remove `mysteryKnowledge` from `FREE_KEYS` and strip model-origin `mysteryKnowledge`, `unlockedClues`, `cultClues`, `worldGlitchClues`, `fakeEvidence`, `letterFragments`, and fact-derived `tripProgress` at legacy sanitation as well as State. Add a forged legacy patch test setting day4 solution knowledge/route fragments and confirm none reaches eligibility. Nested/dotted paths must be covered. Keep authoritative `mergeAuthorizedKnowledge` / `deriveAuthorizedFactProgress` and trusted transaction patches working; do not route genuine program commits through a sanitizer that strips its own facts. An existing organized-clue UI operation may preserve already-known organization, but must not introduce a new truth-graph fact.
- [x] Integrate review across material playable fields, including asynchronously generated checklist text before attaching it. Failed checklist audit retains the prior valid list or deterministic safe opportunities; it must not publish unaudited detail. Whole-scene repairs re-review all dependent fields and retain sources in repair packets.
- [x] Run all listed Task2 tests and existing repair/structured-schema tests. Review WriterPacket snapshots for absence of canonical truth. Root commits phase1 after checks.

### Task 3: scarce action quote, resolution and interruption

**Files:** Create `src/engine/action-resolution.ts` and `.test.ts`; modify `src/engine/scheduled-events.ts`/`.test.ts` to export the next boundary; modify `src/engine/action-narrative-context.ts`/`.test.ts` to separate proposed travel from executed scene construction. Root owns later hook changes.

**Interfaces:** Produce action types/functions above plus `nextScheduledBoundary(time: string, variables: DynamicRecord): { id: string; at: string } | undefined`. Keep `checkScheduledEvents` for event mutation. Resolve `midnight`, death news and active due commitments as chronological blockers. Use a Task6 commitment adapter later rather than importing memory internals now.

- [x] Write red unit fixture and conservation cases:

```ts
const deepStep: ActionStep = { id: 'work', kind: 'investigation', scope: 'deep',
  locationId: 'school', completionSourceIds: ['fact:school-result'] };
const input: ResolveActionInput = { id: 'test-action', cycleCount: 3,
  startTime: '2024-09-09T15:30:00', currentLocationId: 'school',
  stamina: 100, sanity: 70, steps: [deepStep],
  nextBoundary: { id: 'death-news', at: '2024-09-09T16:00:00' } };
it('stops work at death news without its completion reward', () => {
  const result = resolveAction(input);
  expect(result.executedMinutes).toBe(30);
  expect(result.endTime).toBe('2024-09-09T16:00:00');
  expect(result.completedSourceIds).toEqual([]);
  expect(result.continuation?.completedMinutesByStep.work).toBe(30);
});
it('a five-minute budget cannot buy a full deep investigation', () => {
  const result = resolveAction({ ...input, nextBoundary: undefined, explicitBudgetMinutes: 5 });
  expect(result.executedMinutes).toBe(5);
  expect(result.completedSourceIds).toEqual([]);
});
```

- [x] Run `npm test -- --run src/engine/action-resolution.test.ts`; ensure missing implementation fails. Add tests for quote25/55/105, distinct actual travel legs, same destination two work steps, explicit120 budget, interrupted travel, exact16:00, midnight, old-cycle continuation rejection, split-cost sum and event IDs once.
- [x] Implement pure ordered segmentation. Derive work price from scope, travel from registered map geometry. Budget applies to aggregate travel+work. Iterate while time remains; stop before boundary; only completed milestones expose source IDs. A deliberately authorized wait can exceed180 to reach a disclosed boundary; do not change arbitrary legacy clock clamp globally.

```ts
const execute = Math.min(plannedRemaining, budgetRemaining, minutesUntilBoundary);
const cumulative = alreadyExecuted + execute;
const chargedNow = Math.round(fullStaminaCost * cumulative / plannedMinutes) - alreadyCharged;
const completed = cumulative === plannedMinutes;
const earned = completed ? step.completionSourceIds : [];
```

- [x] Validate all finite numbers, known kinds/scopes/locations, stable step IDs and continuation cycle/clock compatibility. Store `previousResolutionId`, a stable digest of validated ordered steps, `resumableFromTime` and `expectedLocationId`; on resume require matching current-cycle active saved continuation, matching digest/step IDs/location, and start clock at or after `resumableFromTime`. Root supplies only the active saved continuation, not arbitrary model/user objects; changing plan/location or resetting invalidates it. Waiting at the same location may retain it unless a deadline/opportunity expires. `quoteActionSteps` uses its completed minutes and charged-cost maps to quote only remaining work/travel. Ignore Director numeric price as authority.
- [x] Apply spec resource rates, rest cap120, fantasy−8, death−12 once with explicit cycle-scoped effect IDs. The resolver is the single resource-effect owner for resolved narrative actions; `event` steps carry validated event IDs and consult `appliedEventEffectIds`. Task4 must bypass the transaction's existing death-news sanity deduction when `resolvedAction` is present, while retaining the old branch for non-resolved compatibility/local callers. No implicit sanity depletion for grief words.
- [x] Run resolver/event/action-context tests. Review start/end scene behavior for interrupted travel: no unexecuted destination/NPC. Root records task gate and commits pure engine checkpoint.

### Task 4: one outcome through Writer, State and commit

**Files:** Root modifies `src/hooks/useGameLoop.ts`, `src/agents/mystery/{types,schemas,prompts,orchestrator,turn-preparation,preplan,review}.ts`, `src/agents/state/state-agent.ts`, `src/engine/{game-transaction,narrative-contract}.ts`, `src/sillytavern/vars-validator.ts`, `src/utils/turnStateSnapshot.ts`; tests in hook day-contract/lifecycle, preplan, transaction, State and narrative-contract suites.

**Interfaces:** Add `DirectorPlan.actionSteps?: ActionStep[]` as proposal only; `WriterPacket.resolvedAction: ResolvedActionOutcome` for new live packets, safely optional only in old test/persisted packet migration; `GameTransactionInput.resolvedAction?: ResolvedActionOutcome`. Store continuation/action-effect IDs under program-owned `actionContinuity` in variables. Add it to snapshot and legacy/State forbidden roots. Existing `costs` branch remains for truly local/admin operations; generated standard/legacy actions must supply a resolution.

- [ ] Extend existing hook mocks to capture WriterPacket and final transaction. Red assertions: plan105+travel15 spends120 once; State tries stamina80 and time18:00 but authoritative result wins; failure/retry spends zero then one; same cached action resolution survives review retry; preplan with stale clock discarded.

```ts
it('a resolved action overrides State time and resources', () => {
  const variables = createDefaultVariables();
  const status = { time: new Date('2024-09-09T08:00:00'), stamina: 100, sanity: 70, items: [] };
  const resolution = resolveAction({ id: 'fixed', cycleCount: 1,
    startTime: '2024-09-09T08:00:00', currentLocationId: 'home',
    stamina: 100, sanity: 70,
    steps: [{ id: 'q', kind: 'inquiry', scope: 'normal', locationId: 'home', completionSourceIds: [] }] });
  const result = settleGameTransaction({ variables, gameStatus: status,
    resolvedAction: resolution, variablePatch: { stamina: 1, sanity: 1, time: '2024-09-09T23:00:00' },
    costs: { timeMinutes: 55, stamina: 7 }, narrativeTurn: true });
  expect(result.variables.time).toBe(resolution.endTime);
  expect(result.gameStatus.stamina).toBe(resolution.resources.after.stamina);
  expect(result.gameStatus.sanity).toBe(resolution.resources.after.sanity);
});
```

- [ ] Run focused hook/transaction/State tests, verify red. Resolve after approved intent and before final Writer messages. For legacy, use the same validated intent/outcome path even if optional secondary reviewers differ. Reconcile proposed revelations with completed source IDs and actual arrival; rebuild projected packet/scene contract and run hard review again before Writer.
- [ ] Replace `resolvePendingCosts` settlement precedence with resolution identity. Panel values are display/request metadata, not a second charge. Commit only facts both earned by resolution and actually presented in approved narrative; buildStateEvidenceAuthority receives only those sources. Present partial work without synthetic completed rewards. Use the existing final guarded persistence/commit, not a second transaction.
- [ ] Reject independent State/legacy time/resource overrides when resolution exists. Keep unrelated supported affinity/investigation patches. A death-news event effect uses the resolver's cycle-scoped effect ID guard and cannot be charged again by State or the existing `deliverPendingDeathNews` transaction deduction; that branch only marks actual reviewed delivery when resolved resources already contain the effect. Persist effect IDs atomically and restore them in reroll snapshots. Add duration/resource semantic contract sources and deterministic explicit-duration conflict check; objective exhausted/restored claims must match resolved bands while figurative sadness may remain.
- [ ] Ensure pending event delivery can occur at16:00 without inventing additional investigation time; event scene must precede resumed work. Store continuation for later explicit choice, invalidate at reset/cancel, and include in prepared-cache keys and snapshots. On failed persistence/review/abort, no continuation/resource/fact/knowledge mutation.
- [ ] Run `npm test -- --run src/hooks/useGameLoop.day-contract.test.tsx src/hooks/useGameLoop.lifecycle.test.tsx src/engine/game-transaction.test.ts src/engine/narrative-contract.test.ts src/agents/state/state-agent.test.ts src/agents/mystery/preplan.test.ts`. Root reviews phase2 with direct15:30 interruption/resume smoke trace.

### Task 5: meaningful investigations and quiet-time compression

**Files:** Create `src/engine/investigation-opportunities.ts` and `.test.ts`; modify `src/agents/mystery/{brief,scene-list,prompts}.ts`, `src/engine/scheduled-events.ts`; root updates `turn-preparation.ts` and hook integration. Extend scene-list, brief, scheduled-event and hook tests.

**Interfaces:** Use opportunity types/functions above. `DirectorOptionIntent` and scene investigation/action intents gain optional `opportunityId` and `scope`; generated checklist output cannot invent priced opportunity IDs. Program adds quotes after validating IDs. `OpportunityProgress` is program-owned variables state, saved/snapshotted and day-reset.

- [ ] Write red cases using the real `MYSTERY_TRUTH_GRAPH` and existing `TruthContext` fixtures: day1 school reachable `shared-school-absence` opportunity; day1 never shows day2 nurse/telephone result or solution; known fact can advance legal level but never duplicate equal-depth reward; two no-progress repeats prioritize alternative; no legal source produces an honest limitation/wait instead of fabricated evidence.

```ts
it('two no-progress attempts do not masquerade as new investigation payoff', () => {
  const previous: OpportunityProgress = { cycleCount: 1, completedIds: [], noProgressByTopic: {} };
  const selected: InvestigationOpportunity = { id: 'school-inquiry', locationId: 'school',
    publicGoal: '询问门卫文穗的情况', scope: 'normal', sourceIds: [], topicKey: 'school:fumi' };
  const resolution = resolveAction({ id: 'repeat', cycleCount: 1,
    startTime: '2024-09-09T10:00:00', currentLocationId: 'school', stamina: 100, sanity: 70,
    steps: [{ id: 'q', kind: 'inquiry', scope: 'normal', locationId: 'school', completionSourceIds: [] }] });
  const once = settleOpportunityProgress({ previous, selected, resolution, newSourceIds: [] });
  const twice = settleOpportunityProgress({ previous: once, selected, resolution, newSourceIds: [] });
  expect(twice.noProgressByTopic['school:fumi']).toBe(2);
});
```

- [ ] Run `npm test -- --run src/engine/investigation-opportunities.test.ts src/agents/mystery/scene-list.test.ts` and observe red. Implement candidate generation by calling existing `buildMysteryBrief` under legal destination context, never reading canonicalTruth into UI/writer. Public goals name investigation affordance, not hidden answer.
- [ ] Rank new affordable opportunities ahead of exhausted same-topic work; treat fact-level progress, actual outcomes and independent cognition as progress. Track repeated no-reply/refusal by stable topic. Preserve player insistence and +15 cap diversion, do not force new target without performing requested attempt.
- [ ] Replace `COLLAPSE_DIRECTIVE` sustained collapse/sanity decay/all-options-narrowing with grief + limited grounded follow-up + rest/explicit wait. Quiet waits execute to next event/appointment/requested budget with disclosed opportunity tradeoff. Do not miss a known timed window because first option silently skips it.
- [ ] Model scene-list may write descriptions only from approved material/opportunity projections. Add exact deterministic quote fields, permit fewer than2 clues when appropriate, and audit novel descriptive claims via Task2 before publishing. Run focused tests plus stage-1 fact negatives against generated list descriptions. Root reviews default-first-choice sample then commits.

### Task 6: character knowledge, belief, disclosure and commitments

**Files:** Create `src/memory/character-continuity.ts` and `.test.ts`; modify `src/memory/world-memory.ts`/`.test.ts`, `src/engine/cycle-settlement.ts`, `src/utils/cycleLoop.test.ts`, `src/data/npcPlayerKnowledge.ts`/`.test.ts`; root adds packet/hook integration and snapshot guards.

**Interfaces:** Reuse existing `CognitionRecord`, `CognitionDelta`, `WorldEventRecord`, `buildTurnCommit` and `normalizeWorldMemory`. Add optional cycle/scope provenance to cognition and optional disclosure/commitment arrays to memory normalization. Export these types/functions from the new module:

```ts
export interface DisclosureRecord {
  id: string; cycleCount: number; speakerId: string; listenerIds: string[];
  propositionId: string; sourceEventId: string; evidenceQuote: string;
}
export interface CommitmentRecord {
  id: string; cycleCount: number; actorId: string; recipientId: string;
  action: string; locationId: string; dueAt: string;
  status: 'active' | 'fulfilled' | 'cancelled' | 'expired';
  sourceEventId: string; evidenceQuote: string; expiredReason?: 'reset' | 'missed';
}
export function resetCharacterContinuity(
  memory: import('./world-memory').WorldMemoryState,
  nextCycle: number,
): import('./world-memory').WorldMemoryState;
```

- [ ] Add red tests to existing world-memory fixtures: player learns clue and says it only to NPC A; A heard it and B did not; NPC lie is `said` but proposition not confirmed; player asks for a promise but no accepted promise creates no commitment; accepted promise does. Reset keeps player facts/events but removes NPC day learning and expires commitment/continuation.

```ts
it('does not grant a stranger yesterday’s introduction after reset', () => {
  const variables = createDefaultVariables();
  variables.cycleCount = 3;
  variables.playerNameKnownByNpcIds = ['detective-a'];
  const next = settleCycleVariables(variables);
  expect(next.cycleCount).toBe(4);
  expect(next.playerNameKnownByNpcIds).not.toContain('detective-a');
  expect(next.time).toBe('2024-09-09T08:00:00');
});
```

- [ ] Run memory/cycle/name-knowledge suites and verify red. Source all deltas from reviewed dialogue/evidence spans with identified present listeners. Add status/scope validation: player claims heard by NPCs cannot become confirmed world facts; actor cognition projections do not reveal hidden fact truth. Keep fixed public identity/baseline cognition separate from day observations.
- [ ] Modify existing `buildTurnCommit` integration to write approved deltas/disclosures/commitments atomically with accepted event; do not add a second model State authority. Preserve historical records as player recollection while compiling only current-cycle/baseline active NPC context. Explicit commitment acceptance must be spoken/rendered, with registered location and valid due time.
- [ ] At `settleCycleVariables`, reset NPC active cognition to authored baseline, expire active old-day commitments, remove active action continuation/progress/effects, preserve player learning and suspicion. Regenerate `playerNameKnownByNpcIds` from baseline/current active knowledge. Normalize v2 missing fields safely; never turn every imported NPC fact into eternal baseline.
- [ ] Run `npm test -- --run src/memory/world-memory.test.ts src/memory/character-continuity.test.ts src/utils/cycleLoop.test.ts src/data/npcPlayerKnowledge.test.ts src/hooks/useGameLoop.day-contract.test.tsx`. Add cycle3→4 hypothesis-only to eligible-route test alongside memory reset; root reviews and commits.

### Task 7: consistent cost disclosure and continuation UI

**Files:** Modify `src/components/game/{ActionPanel,MapModal,ChoiceMenu,FreeActionDialog}.tsx`, `src/sillytavern/types.ts`, corresponding existing tests; root integrates `performAction`/choice selection in hook. Add concise resolved elapsed-time/result display in existing ActionPanel or dialogue result presentation, avoiding a new modal flow.

**Interfaces:** Scene/ParsedContent action items and choice metadata carry program `opportunityId`, `scope`, quoted total/work/travel minutes and resource quote. Existing `time` string is a display projection for old UI compatibility. Selected action passes stable ID/validated steps rather than asking `parseTimeCost` to recreate authority. `ResolvedActionOutcome` supplies actual elapsed minutes and optional remaining quote.

- [ ] Write red UI tests: normal investigation55 plus travel15 displays70; same-location shows55; opening panels leaves clock/resources/history unchanged; interrupted action displays “已进行30分钟” and explicit remaining work75; selecting continuation passes its ID once. Free input shows20–30/45–60/90–120 policy and travel addition; it does not request a blocking approval on each attempt.
- [ ] Run ActionPanel/MapModal/ChoiceMenu tests and verify red. Render quotes from `quoteActionSteps`; display exact executed result from resolution, not Writer numbers. Preserve existing mobile layout/accessibility/keyboard behavior.

```tsx
<span aria-label="预计耗时">约{quote.totalMinutes}分钟</span>
{quote.travelMinutes > 0 && <span>含路程{quote.travelMinutes}分钟</span>}
{resolved && <span>已进行{resolved.executedMinutes}分钟</span>}
```

- [ ] Use existing choice/result surfaces to show interruption reason and remaining action clearly, with cancel/change-plan possible. Revalidate quote at actual start if clock/location changed, and visibly report actual result; never quietly charge stale menu price. Map travel-only actions are represented as travel steps, not work plus duplicate travel.
- [ ] Rerun focused UI tests and inspect in browser at desktop/mobile sizes; root records screenshots of quote+actual+continuation and verifies local free panels. Commit after review.

### Task 8: acceptance tests and real model evidence

**Files:** Create `scripts/live-action-authority.test.tsx`; modify `scripts/live-day-evaluation.test.tsx`, `scripts/summarize-live-day-evaluation.cjs`; extend `src/hooks/useGameLoop.day-contract.test.tsx`, `src/agents/mystery/loop-contract.test.ts`, `src/engine/conclusion-system.test.ts`; create `docs/agent-optimization/2026-09-14-day-action-authority-evaluation.md` and scrubbed data JSON.

**Interfaces:** Reuse real hook, API router, persistence test double, lifecycle and event/reset routines from existing live harness. Credentials stay in configured environment/ignored local configuration. Parse `DAY_MODE` explicitly as supported standard/strict/legacy; throw on any other value. Record actual selected mode in each row.

- [ ] Add deterministic matrix tests before full eval: standard+legacy day1–3 accusation/solution impossible; cycle3→4 before/after boundary; day4 lacks required fact still blocked; authorized legal confirmation passes only at its existing per-fact cycle/reveal gate (some deeper confirmations remain day5+). Never lower those fact-specific gates merely because day4 is the earliest normal route branch. Each matrix uses production transaction/ending gate, not a prompt-only assertion.

```ts
it.each(['standard', 'legacy'] as const)('%s obeys day authority', async mode => {
  // Extend the existing useGameLoop.day-contract setup with this mode.
  // Use its real generated-turn path and controlled completion fixtures.
  const result = await runDayAuthorityScenario(mode, {
    cycleCount: 3, startTime: '2024-09-09T15:30:00', input: '深入调查学校两小时',
  });
  expect(result.after.time).toBe('2024-09-09T16:00:00');
  expect(result.after.completedRewardIds).toEqual([]);
  expect(result.after.ending).toBeNull();
});
```

Define `runDayAuthorityScenario` locally in this test file by factoring its existing store/setup/mocked-completion/`renderHook`/`sendMessage` sequence; return `{ after: { time: string; completedRewardIds: string[]; ending: string | null } }` from actual store/transaction, and do not stub the outcome resolver or fact/ending gate. This helper is test-only and must not become a parallel runtime path.

- [ ] Run focused matrix and confirm the new acceptance failures disappear only after integration. Then run `npm test -- --run`, `npm run lint`, and `npm run build`; inspect all exit codes. Baseline paid/explicit tests may skip only when visibly reported.
- [ ] Extend live harness to record resolution ID, planned/executed work/travel, price vs actual resources, earned/presented source IDs, partial/resume continuity, assertion audit result, opportunity progress and character deltas. Reject diagnostic `DAY_STYLE_OBSERVE`/`DAY_STYLE_DIAGNOSTIC` for acceptance mode. Preserve raw request/response under ignored `.codex-test-tmp` and write scrubbed summaries.
- [ ] Execute on the same immutable tested commit and configured model: standard directed first day; standard first-option first day; actual Wen-sui long conversation covering at least six substantial accepted exchanges and remembered disclosures; next-loop recall/reintroduction; cycle3→4 full boundary plus formal accusation with/without legal facts; legacy focused fact/location/time/interruption/resume parity. Repeat high-risk factual positive/negative probes at least three independent model completions. Full-day runs must use actual midnight reset, not resource failure presented as a day completion.
- [ ] Run the live harness with existing explicit opt-in (`LIVE_DAY_EVAL=1`) and model/key environment from the user's approved gateway; do not hardcode credential content or assume the previously observed model label proves its underlying provider. Maximum attempts/time limits are collection safeguards, not pass criteria. Resume transient failures with preserved resolution; record provider errors separately from game rejection.
- [ ] Summarize actual08:00–16:00 investigation counts, full-day major actions vs10–16 target, useful information/new levels, repeated no-progress streak, clock/resource contradictions, known-character consistency, failures/retries, request counts and playable latency. Manually inspect accepted text for the real van/no-login/message-note drift examples and complete action intervals. Include positive evidence so over-restrictive refusal is visible.
- [ ] Acceptance report clearly marks each matrix row passed/failed/unrun, exact tested commit/model, diagnostics disabled, and the storage/playback/browser evidence boundary. If counts miss tuning targets, adjust only centralized rates/ranking/wait policy, rerun affected unit tests and new same-version full-day samples; preserve original failed sample in report. If provider failure prevents required runs, finish all independent work and report that exact remaining gap rather than claim completion.
- [ ] Root reviews full diff, clean artifact scope and secrets scan, then commits phase3 and verified report. Publish/deploy only within existing explicit authorization; no speculative deployment is part of this implementation plan.

## Plan self-review

Spec coverage: phase1 Task1 locations/protocol and Task2 assertion grounding; phase2 Task3 pricing/interruption and Task4 ordered authority; phase3 Task5 opportunities/grief/waits, Task6 cognition/reset, Task7 disclosure, Task8 deterministic/live acceptance. Source-specific positives and negatives, transient street anchor, aggregate short budgets, partial travel, resource conservation, exact event ties, standard+legacy, cycle3→4 and next-day NPC reset all have dedicated checks. No standalone canonical graph rewrite, new police setting, global regex-only grounding claim or repeated user approval gate is required.
