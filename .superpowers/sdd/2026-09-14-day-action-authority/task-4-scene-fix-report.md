# Task 4 scene continuity fix round 1

## Scope

Changed only the assigned scene/preparation slice:

- `src/engine/action-narrative-context.ts` and test
- new `src/engine/action-scene-continuity.ts` and test
- `src/agents/mystery/turn-preparation.ts`
- `src/agents/mystery/turn-preparation.execution.test.ts`
- this report

No git stage or commit operation was performed.

## Root cause and result

Preparation reparsed the generic resume text after the interruption. That discarded the original exterior-school entry rule and its forbidden teacher, while non-work projection used the persisted map anchor to render `home-day` even though five minutes of travel had already placed the player in the transient street scene. A compound action also had only one proposed scene, so execution could not recover the correct cast and restrictions for each location.

The fix adds a program-owned action scene continuity value keyed by action/cycle with original `ActionNarrativeContext` values per destination. Preparation builds the map once from the original input, clock, route origin, cycle and player knowledge. `resolveActionNarrativeContext` now accepts a program-only destination filter for exact compound-clause lookup. Resume validates action/cycle and selects the active or next destination from the saved continuation before Director review.

Execution projection now:

- exposes no destination scene contract or active destination NPC while a positive travel segment remains incomplete;
- keeps `street` during an intervening event/wait when the saved active travel step already has positive progress;
- selects the original per-location contract on actual arrival;
- suppresses an en-route encounter when a resumed travel segment contains earlier completed journey minutes;
- returns `segmentNpcIdsByLocation` for work actually executed at each location, while `activeNpcIds` remains the physical end-scene cast;
- returns the pending map only as program metadata; it is not copied into Director/Writer prompt contexts;
- keeps an empty map valid for same-place work with no explicit destination;
- snapshots the map separately for the exposed request and callback, so later request/input mutation cannot change projection.

Root integration persists the typed value as `actionContinuity.sceneContext`, binds a pending map to the resolver continuation action ID, feeds per-location casts into executed-plan projection, and verifies the private map is absent from Writer messages.

## TDD evidence

Observed RED failures before implementation:

- compound destination filtering returned `supermarket` when `school` was requested;
- the new scene continuity module did not exist;
- resumed partial travel retained `detective-a` and its street directive;
- mutating the exposed request map changed the cached execution callback;
- the Astra reproduction rendered the zero-time official death call at `home-day` and accepted a resumed teacher beat after losing the exterior contract.

Final focused verification:

- eight related test files: **99 tests passed**;
- scoped ESLint: exit 0;
- `npx tsc -b --pretty false`: exit 0;
- scoped `git diff --check`: exit 0 (Git emitted only existing LF/CRLF conversion notices).

The 99-test run includes narrative-context, new scene-continuity, preparation snapshot/projection, resumed orchestration, compound segment cast, adapter, and transaction retention coverage.

## Freeze

This scene/preparation slice is frozen for root integration and independent re-review. Further changes should be made only for a concrete review finding.

## Fix round 2: unrelated completed travel

Astra identified a new edge after round 1: an old partial home-to-school route remained stored while the player chose a new, completed home-to-supermarket travel action. `isNonWorkResolution` includes pure travel, so the old `savedTransit` predicate incorrectly projected the completed new trip as `street` and authorized the false statement “仍在途中，尚未抵达目的地.” The read-only reproduction is recorded in `.codex-test-tmp/task4-new-travel-probe.log`.

The projection now uses saved partial-travel presentation only when the current resolution matches transaction retention: it starts and ends at the saved expected anchor on the same day, and every current segment is an event or wait. A completed new trip or completed pure-travel resume therefore uses its actual destination background and clears the abandoned continuation at settlement. A zero-time official event and a same-anchor wait still preserve the street presentation.

Round-2 RED command:

`npx vitest run src/agents/mystery/turn-preparation.execution.test.ts src/agents/mystery/orchestrator.continuation-scene.test.ts`

Result before the fix: **2 failed, 10 passed**. Both the direct projector and actual orchestrator expected `supermarket-day` but received `street`.

Round-2 final covering command:

`npx vitest run src/agents/mystery/turn-preparation.execution.test.ts src/agents/mystery/orchestrator.continuation-scene.test.ts src/agents/mystery/turn-preparation.test.ts src/agents/mystery/orchestrator.action-resolution.test.ts src/engine/game-transaction.resolved.test.ts src/agents/mystery/action-authority.test.ts src/engine/action-narrative-context.test.ts src/engine/action-scene-continuity.test.ts`

Result: **8 files, 104 tests passed**. This includes new completed travel, completed pure-travel resume, same-anchor wait, zero-time event, original partial travel, exterior-school resume, and compound cast coverage.

Additional verification:

- `npx eslint src/agents/mystery/turn-preparation.ts src/agents/mystery/turn-preparation.execution.test.ts src/agents/mystery/orchestrator.continuation-scene.test.ts`: exit 0.
- `npx tsc -b --pretty false`: exit 0.
- scoped `git diff --check`: exit 0, with LF/CRLF conversion notices only.

The round-2 slice is frozen. No git stage or commit operation was performed.
