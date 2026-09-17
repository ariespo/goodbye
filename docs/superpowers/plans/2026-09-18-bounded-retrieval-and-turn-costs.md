# Bounded retrieval and turn accounting implementation plan

**Goal:** Let complex narrative turns request a small amount of authorized historical context and expose honest per-turn usage, repair, latency and estimated-cost statistics.

**Architecture:** Preserve the existing fact gate, Director, reviews, Writer, State and deterministic commit. Add one optional read-only query-planning phase before Director. Instrument the existing API transport using request-scoped observers, keeping foreground time separate from auxiliary spending.

**Tech Stack:** Existing TypeScript, React, Vitest; no new runtime framework or dependency.

**Approved direction:** User accepted limited autonomous history/evidence lookup and successful-turn cost/wait/repair accounting in this conversation. Routine interface and fallback choices are delegated to implementation.

## Global constraints

- Follow AGENTS.md and current story-world rules; keep all fact, route, NPC-knowledge and commit gates.
- No canonical truth, undiscovered evidence, other-route facts, old-version history, user assertions or failed drafts may enter retrieval results.
- Retrieval is optional and read-only: max one logical planner invocation, two queries, three hits per query, six total records, bounded result size. Invalid output or ordinary lookup failure falls back; cancellation propagates.
- Ordinary actions and speculative preparation must not pay for retrieval. A complex foreground turn must not accidentally reuse a speculative plan which skipped required retrieval.
- No prompts, response bodies, credentials, URLs or query text in persisted accounting records. Observers cannot break gameplay.
- Missing usage or pricing is unknown, never zero. Prices are optional, per configured endpoint/model, with explicit currency; costs are estimates.
- Background checklist and speculative work keep their original accounting identity after foreground completion. Adoption does not charge their requests twice. Discarded work remains visible overhead.
- Current stage timing means actual elapsed time. Playable latency ends after accepted scene persistence/commit, excluding optional background work.

## Task 1: API usage, pricing, ledger and diagnostics

Owner: usage worker. Files: `src/sillytavern/api-router.ts`, new `src/sillytavern/api-telemetry.ts`, `src/sillytavern/types.ts`, `src/agents/mystery/turn-metrics.ts`, pricing UI under `src/components/tavern`, `src/components/system/OrchestrationLogPanel.tsx`, corresponding tests.

Interfaces for integration:

```ts
type ApiCallPurpose = 'foreground' | 'checklist' | 'preplan';
type ApiRepairKind = 'structured' | 'director' | 'narrative' | 'protocol';
// Runtime-only ApiConfig.telemetry, optional ApiConfig.pricing.
// SecondaryApiOptions.repairKind marks one logical correction, not every retry.
// TurnMetricsTracker.telemetry(purpose) returns a captured observer.
// TurnMetricsTracker.recordRepair(kind, purpose = 'foreground') counts explicit repairs.
// TurnMetricsTracker.markPreparationReused() distinguishes adopted/cached work.
```

- [ ] Extend transport with explicit observers: one request event per actual HTTP attempt, including auth fallback, network retries and failures. Capture provider token usage in JSON and SSE; do not sum repeated cumulative usage frames. Finalize Writer transport before its downstream onComplete callback.
- [ ] Request streaming usage only when observed; narrowly retry without unsupported stream_options after explicit rejection. Missing/interrupted usage stays unknown.
- [ ] Extend bounded sanitized metrics persistence, preserving older timing-only entries as unmeasured. Allow late events to update an existing finished entry without changing its timing or recreating cleared/evicted entries.
- [ ] Add optional endpoint/model-bound input/output/cached-input rates (per million tokens), USD/CNY, with no built-in pricing guesses. Preserve unknown/partial coverage and mixed currencies separately.
- [ ] Extend existing diagnostics panel with per-turn usage/repairs/estimated costs and window cost-per-success including failed and auxiliary work, visibly marked incomplete when appropriate.
- [ ] Test JSON/SSE parsing, auth/network attempts, observer errors, callback timing, concurrent scopes, late events, clearing, migration, rates, unknown costs and UI rendering.

## Task 2: Authorized query planning and context propagation

Owner: retrieval worker. Files: new `src/memory/authorized-retrieval.ts`, new `src/agents/mystery/bounded-retrieval.ts`, `src/agents/mystery/turn-preparation.ts`, `src/agents/mystery/orchestrator.ts`, corresponding tests.

- [ ] Build immutable program-only corpus from already accepted current-version historical visible content and `brief.playerKnownFacts`. Opaque local handles; no graph/private IDs in planner input.
- [ ] Add explicit recall/compare/contradiction trigger with eligible material. Planner emits validated search_history/search_known_evidence queries only. Search executes locally against authorized corpus; results are exact program-selected records, not model-written evidence.
- [ ] Fit retrieved records within optional context budget. Preserve cycle/time and contextual-recollection status; do not promote history into publicContinuity or expand assertion/NPC permissions.
- [ ] Add query result context to Director, post-execution Writer and repair packet. Include corpus in cache invalidation while stripping runtime observer callbacks from preparation keys.
- [ ] Export a deterministic eligibility helper for root to avoid speculative reuse on retrieval-eligible foreground turns. Query is skipped in speculative mode.
- [ ] Preserve pricing in resolveAnalysisApi. Add paid Director repair events at actual model repair dispatch only, via optional API telemetry observer; exclude local normalization.
- [ ] Test ordinary zero-extra-call path, genuinely retrieved older history reaching Writer, evidence level/route/version isolation, untrusted user/draft exclusion, query budgets, malformed queries, cancellation and fallback.

## Task 3: Turn integration and verification

Owner: root. Files: `src/hooks/useGameLoop.ts`, `src/agents/mystery/structured.ts`, integration tests and documentation.

- [ ] Attach foreground observer to preparation/Writer/reviews/State and auxiliary observers to checklist and preplanning. Retain origin scope when preplan is adopted; mark reuse once without replaying request records.
- [ ] Record narrative/protocol repairs explicitly. Mark structured correction options independently from schema capability fallback. Keep cached retries functional.
- [ ] Verify successful commit accounting, retrieval lifecycle, cancellation, no background leakage between turns and pricing settings persistence.
- [ ] Run affected tests, then full suite, lint and production build. Obtain independent code review; fix findings and run covering checks.
- [ ] Perform a small controlled real-provider retrieval check if the existing authorized local test configuration is available, documenting limits. Review UI on mobile-width browser where feasible.
- [ ] Commit, push and deploy to the existing Cloudflare Pages project under the standing deployment authorization, then verify deployed artifacts.
