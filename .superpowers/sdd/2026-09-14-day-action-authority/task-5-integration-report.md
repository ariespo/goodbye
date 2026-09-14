# Task 5 shared runtime integration report

## Scope

Integrated the Task 5 investigation-opportunity runtime through turn preparation, action authority, transaction settlement, checklist persistence, chat reconstruction, and the game loop. No files were staged or committed.

The shared runtime work is in:

- `src/agents/mystery/turn-preparation.ts`
- `src/agents/mystery/orchestrator.ts`
- `src/agents/mystery/action-authority.ts`
- `src/hooks/useGameLoop.ts`
- `src/sillytavern/types.ts`
- `src/sillytavern/vars-validator.ts`
- `src/agents/state/state-agent.ts`
- `src/engine/game-transaction.ts`
- `src/engine/opportunity-integration.ts`
- `src/engine/checklist-metadata.ts`
- `src/engine/scene-parser.ts`
- `src/sillytavern/stream-parser.ts`
- the focused unit and integration tests for those seams

`src/agents/mystery/scene-list.ts` received only the approved metadata-tail serialization extension after the checklist API was frozen.

## Runtime behavior

- Turn preparation builds an immutable private legal-opportunity map from the exact `TruthContext`. Director and checklist prompts receive only the public projection; source IDs and topic keys do not cross the prompt boundary.
- Menu selections carry opaque opportunity/action metadata. The adapter revalidates the exact ID, kind, scope, and location against the private map, then reconstructs the operative input from the trusted public goal. Model prose and model-supplied prices cannot change authority or cost.
- Same-cycle completed opportunities remain recoverable through exact lookup for retries and continuations while the default candidate list omits them. A continuation restores the program-owned selected snapshot captured from the original source context. Stale-cycle selections are rejected.
- Opportunity source authority still comes from the approved Director plan, a completed selected step, accepted main text, and newly committed canonical knowledge. A catalog candidate alone grants no source.
- `opportunityProgress` is program-owned state. Settlement happens once inside the ordered game transaction after accepted narrative and authorized knowledge merging. It compares the pre-action variables with the authorized variables, aliases fact IDs through `factAliases`, counts only genuinely new fact-level or knowledge-event IDs, and deduplicates by resolution ID.
- Partial/interrupted work and unrelated event or summary text do not award progress. Completed no-award attempts increment the topic streak; actual awards complete the exact opportunity and clear the streak.
- Deterministic program menus are available immediately and remain authoritative even when the Writer supplied complete lists. Empty investigation/action lists are valid and open locally without advancing time. Async observation enrichment retains the existing assertion audit, race token, cancel, and save-failure guards.
- Checklist metadata is persisted in an optional URI-encoded pipe tail. Legacy prefixes still parse, and `rebuildSceneFromChat` restores the opportunity/action identity, scope, location, requested minutes, and quote needed for later selection.
- Quiet waits use `planQuietWait`: an unspecified wait reaches the next known death/commitment/midnight boundary; an explicit shorter whole-minute request stops earlier; a due-now boundary delivers the existing required event. Crossing a supplied authored opportunity window is disclosed in the public wait goal and is not the ranked default while a legal investigation exists.
- Retry, failure, cancellation, and save atomicity remain unchanged: canonical state is committed only after the accepted message saves, through the existing single ordered transaction. The original `ChatMessage.actionRequest` retains the validated selection metadata.

## TDD coverage

Focused cases cover:

- valid exact selection, invalid/stale IDs, and scope/location/kind mismatch;
- trusted labels and prices despite malicious model prose or numeric fields;
- selected 55-minute work plus travel priced once in the adapter coverage, and the 25-minute home opportunity end-to-end hook acceptance;
- candidate source non-authority, completed award, completed no-award, interrupted no-award, unrelated event, and idempotent settlement;
- continuation snapshot restoration and same-cycle exhausted exact lookup;
- private source metadata absence from public prompts;
- quiet-wait boundary, explicit budget, due-now event, and expiring-window disclosure;
- program-owned state rejection by State Agent and variable validation;
- metadata serialization through the real `rebuildSceneFromChat` path;
- hook cancellation, stale-chat race, save failure, valid-empty menus, and deterministic authoritative list publication.

## Verification

Fresh type build:

```text
npx tsc -b --pretty false
exit 0
```

Fresh focused runtime and hook suite:

```text
npx vitest run src/engine/opportunity-integration.test.ts src/agents/mystery/turn-preparation.execution.test.ts src/agents/mystery/action-authority.test.ts src/agents/state/state-agent.test.ts src/hooks/useGameLoop.action-resolution.test.tsx src/hooks/useGameLoop.checklist-review.test.tsx --maxWorkers=4
Test Files  6 passed (6)
Tests       83 passed (83)
```

The focused hook set includes `useGameLoop.action-resolution.test.tsx` at 12/12 and `useGameLoop.checklist-review.test.tsx` at 5/5. The expected cancellation fixture logs a handled `DOMException`; Node also prints the repository's existing invalid `--localstorage-file` warning. Neither affects the passing result.

Scoped ESLint over all integration-owned production and test files exited 0.

An earlier broader Task 5 integration run also passed 15 files and 210 tests, including the engine opportunity, scheduled-event, checklist, transaction, parser, stream-parser, variable-validator, state-agent, preparation, adapter, and hook suites. The root coordinator owns the final combined repository suite/build/lint gate after this source freeze.

## Follow-on boundaries

Task 6 owns explicit new-day reset behavior for `opportunityProgress` and any selected continuation snapshot. Task 7 owns the full UI redesign; Task 5 provides the persisted metadata and authoritative program quote needed by that UI. Task 8 owns live-model evaluation.
