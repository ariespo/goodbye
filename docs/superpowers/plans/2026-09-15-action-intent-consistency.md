# Action intent consistency implementation plan

> **For agentic workers:** Use subagent-driven-development for independent tasks; test failures before implementation, scoped review and a final review before completion.

**Goal:** Preserve player choices across planning, resolution and writing without adding routine model calls; recognize legal resource resets independently of midnight completion.

**Architecture:** Program-validated action snapshots accompany narrative options and persisted requests. The existing director interprets free input, deterministic checks reject mismatches and unknown travel instead of staying silently, and the existing final narrative reviewer receives a compact intent/plan/execution comparison. Event/budget/resource interruptions remain program owned.

**Tech stack:** TypeScript, React/Zustand, Vitest; existing model gateway and evaluation harness.

**Spec:** User-approved design in this conversation on 2026-09-15: program consistency checks, existing narrative review, exceptional local repair, legal early resource reset.

## Constraints

- No routine extra model call, no relaxed fact permissions, no automatic rest player policy.
- Original choice and stable bindings survive retry/reload; text changes cannot silently retain another action.
- An unrecognized destination is not a request to remain at the current location.
- Program decides travel, prices, interrupted progress, resource effects and reset/ending priority.
- Do not run tests or builds during real-model evaluation.

## Task 1: Intent and execution contract

Files: new `src/engine/player-action-intent.ts` and tests; `src/engine/action-narrative-context.ts`; `src/agents/mystery/action-authority.ts`, `orchestrator.ts`, `types.ts`, `prompts.ts` and focused tests.

Interface: `ActionIntentSnapshot` has `version: 1`, `originalInput`, `startLocationId`, `steps` (kind, scope, locationId, optional targetNpcIds). Export `resolvePlayerActionIntent(input: string, locationId: string, time: Date): ActionIntentSnapshot | null` (null means unresolved explicit action), and `readActionIntentSnapshot(value: unknown): ActionIntentSnapshot | null`. `ActionAuthorityContext.playerActionIntent` carries a validated bound option snapshot. No costs, outcomes, event effects or evidence are accepted from it.

- [ ] Reproduce old-street target case and unknown-travel silent fallback; cover negations and remote contact.
- [ ] Implement bounded input interpretation and consistency checks, preserving event/continuation precedence.
- [ ] Add compact original-intent/plan/execution audit to existing writer/reviewer; repair mismatched action proposal at most once where feasible, never silently normalize wrong location.
- [ ] Focused tests and review.

## Task 2: Persisted choice binding

Files: `src/utils/actionPresentation.ts`, `src/hooks/useGameLoop.ts`, `src/agents/mystery/turn-preparation.ts`, `src/sillytavern/types.ts`, related tests.

- [ ] Red tests for ordinary option snapshot, tampering, retry/reload and destination binding.
- [ ] Bind accepted option text to validated intent before display; unresolved options use explicit failure/repair rather than an invented location.
- [ ] Thread snapshot through stored actionRequest, preparation, adapter; keep continuation priority and stale-choice rejection.
- [ ] Hook tests prove same intent reaches resolution and no extra routine model calls.

## Task 3: Legal loop acceptance

Files: `scripts/live-day-evaluation-harness.ts`, `.test.ts`, `scripts/live-day-evaluation.test.tsx` only.

- [ ] Red tests distinguishing legal resource reset, midnight completion and invalid reset.
- [ ] Accept legal resource reset when evidence confirms exhaustion and next08:00/cycle+1; report calendar coverage separately.
- [ ] Preserve immutable campaign provenance, do not retroactively claim old action-mismatch records passed.
- [ ] Focused tests and review.

## Final verification

- [ ] Full suite, lint, types and build, final independent review.
- [ ] Freeze code commit; real-model continuous options run through a legal reset, inspect target/time/process/reset rows and report waits/retries.
- [ ] Update evidence report with explicit remaining limits; do not substitute tests for live evidence.
