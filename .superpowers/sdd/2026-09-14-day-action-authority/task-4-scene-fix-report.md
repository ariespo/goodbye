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
