# Agent reliability implementation plan

**Goal:** Fix the five issues in docs/agent-optimization/2026-09-13-system-audit.md, retaining 40,000 per-call output and 100,000 context defaults.
**Architecture:** Preserve the single authority/commit path. Share request preparation between speculative and foreground turns, tie async operations to cancellation/session ownership, constrain context at selection and final HTTP boundaries, require program authorization for suspicion increases, and expose full-turn timings separately from preparation logs.
**Tech stack:** TypeScript, React/Zustand, Vitest, existing browser fetch and local storage.
**Spec:** The user's five quoted audit issues and single-call budget clarification in this task; AGENTS.md story invariants apply.

## Constraints
- Preserve existing uncommitted token configuration changes and user assets.
- No real-model calls or deployment. Existing unrelated CSS contract failure remains separately reported.
- Do not truncate authoritative instructions or facts to fit context; if mandatory final messages exceed budget, reject before HTTP.
- Never commit a cancelled or superseded turn; retry must validate state/config equivalence.
- Keep generation buffered until approved and committed.

## Work packages and ownership

### 1. Preplanning and cancellation (primary agent)
Files: src/hooks/useGameLoop.ts, src/agents/mystery/preplan.ts, matching tests and lifecycle helpers.
- [x] Reproduce consumed-preplan cancellation with a deferred runner and assert cancellation rejects promptly even if runner ignores AbortSignal.
- [x] Keep consumed requests registered until settled, bind foreground abort to speculative request, and invalidate both pending and consumed requests.
- [x] Build speculative and foreground PrepareMysteryTurnOptions through the same pure request builder; fingerprint the full semantic request including policy, state, history, presets and presentation. Do not log credential-bearing keys.
- [x] Gate prepared cache reuse by full fingerprint; inspect session/signal before and after async persistence and before visible commit; cancellation bypasses state fallback.
- [x] Verify context/policy changes miss cache; invalidation aborts adopted work; cancellation during State causes no finalize.

### 2. Enforced context budget (budget worker)
Files: src/sillytavern/token-budget.ts, api-router.ts, src/memory/world-memory.ts and their tests.
- [x] Reproduce 20,000-character history selected under an 8,192 context; add final-HTTP oversize/no-fetch regression.
- [x] Trim optional context by relevance/recency after reserving output, fixed prompt and repair space; reject impossible mandatory budgets.
- [x] Validate final serialized messages plus output at stream and secondary HTTP entry points before retry; use conservative estimates and explicit errors.
- [x] Verify large/small/custom budgets and preservation of authority fields. Report helper interfaces to primary.

### 3. State evidence (state worker)
Files: src/agents/state/state-agent.ts, its tests and narrowly scoped new state helpers.
- [x] Prove a player guess cannot justify suspicion increase, and old/repeated evidence cannot award new suspicion.
- [x] Separate player intention from narrative evidence; require program-provided new authorized evidence for positive suspicion changes, with per-actor ownership and fact/event identity.
- [x] Preserve deterministic pivot gains, forbidden fields and daily clamps. Send only writable state projection to model.
- [x] Expose optional authority input to runStateAgent; primary wires it from approved packet and pre-turn knowledge.

### 4. Complete turn timing (metrics worker)
Files: new src/agents/mystery/turn-metrics.ts/tests and existing orchestration log UI (not useGameLoop/api-router).
- [x] Test full-wall-time measurement across concurrent stages, failed/cancelled turns, distinct first-token/playable time, repeated finish idempotence.
- [x] Implement begin/stage/first-token/finish lifecycle, bounded persisted history without prompt/key payload, subscription and user-visible full-turn timings separate from preparation-only logs.
- [x] Send exact integration API to primary, who wires hook lifecycle and stages.

### 5. Integration and verification (primary)
- [x] Integrate helper APIs, run targeted tests red/green per change, revise stale audit characterization probes.
- [x] Run current-workspace tests excluding nested worktrees, lint and production build. Review cancellation/commit races and budget edge cases.
- [x] Update audit follow-up with verified fixes and limits (token estimates vs provider tokenizer, measured local tests vs online latency).
