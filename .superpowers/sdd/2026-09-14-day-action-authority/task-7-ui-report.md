# Task 7 UI implementation report

Status: Task 7 components, public action persistence, hook integration, parser isolation, and local map-action persistence are implemented in `F:/farewell-action-ui` on `feature/day-action-ui`. The branch contains Task 6 checkpoint `141f3dc` (cherry-picked from `29e514c`) and frozen fix commit `5a8c625` (cherry-picked from `c9a6b33`). All Task 7 changes remain unstaged and uncommitted while the Task 6 review gate is pending.

## Implemented behavior

- `src/utils/actionPresentation.ts`
  - Quotes program actions only through `quoteActionSteps`.
  - Migrates authored/legacy inquiry and investigation rows to the normal 55-minute scope and ignores row labels/resource numbers as settlement authority.
  - Uses registered deterministic destination parsing for legacy travel.
  - Strictly projects accepted outcomes to public elapsed/work/travel/end/resource/interruption/remaining fields and discards private fields.
  - Validates option text/index and the saved current continuation before resuming.
- `ActionPanel`, `ChoiceMenu`, and `FreeActionDialog`
  - Display `home -> school` as 55 minutes of work plus the real 10-minute trip (65 total).
  - Pass a stable expected action ID and reject stale checklist clicks before preparation/model work.
  - Show exact accepted elapsed/work/travel/resource/remaining data without rendering raw action, continuation, boundary, source, or canonical binding IDs.
  - Use neutral interruption wording until the boundary narrative is accepted.
  - Use a synchronous first-click guard and a second runtime binding guard.
  - Preserve observation state/history and the existing mobile portal/accessibility behavior.
- Accepted action persistence and reconstruction
  - `ChatMessage.acceptedActionOutcome`, `ParsedContent.actionOutcome`/`optionBindings`, and `Scene.actionOutcome` are optional migration-safe program fields.
  - The hook attaches the public projection to the accepted assistant message before persistence, then publishes the same projection to the committed scene and live parsed state.
  - `sceneFromChat` and `gameSession` restore action UI only from the accepted assistant message and strict public readers. Saved/model-parsed copies cannot author outcome authority.
  - The stream parser ignores forged `<actionOutcome>` and `<optionBindings>` tags.
  - New turns, rerolls, map scenes, and cycle bridges explicitly clear stale live outcome/binding fields.
- Continuations
  - A death/commitment interruption first offers the neutral `处理眼前的事情` narrative option.
  - After that accepted boundary turn, the hook creates `继续未完成的行动（剩余N分钟）` and binds it to the still-current saved continuation.
  - Explicit resume identity remains available to program code but is not rendered.
- Map travel
  - Uses a deterministic travel-only resolver with death, midnight, and active commitment boundaries.
  - Refuses repeated zero-minute travel when a boundary is already due.
  - Partial travel remains on `street`, grants no destination observation/cast/visit, preserves the same map continuation, and offers the neutral boundary-handling option.
  - Actual arrival grants the visit and destination scene only after the full trip.
  - Saves before the visible transaction commit and guards duplicate clicks, stale chat/clock/location/resources/cycle, save failure, and close-while-saving.
  - Persists each click as a local user/assistant action pair. The user row records the public request and rollback snapshot; the assistant row records the public outcome and reconstructable scene. Neither invokes a model. Reroll is blocked on this settled local pair so it cannot silently target the preceding AI turn.

## TDD and verification evidence

Initial component/helper RED evidence:

```text
6 files failed; 10 tests failed, 18 passed.
```

The failures covered missing authoritative quotes, missing accepted outcome display, duplicate selection, missing free-action policy, map boundary bypass, and committing before persistence. A later persistence RED run failed 2/3 tests until accepted-message authority was implemented. Hook RED runs failed the new public outcome, stale-click, and continuation assertions before runtime integration. Map persistence RED failed both new accepted-message/reload assertions before local action pairs were added.

Pre-sync focused integration run:

```text
npx vitest run <10 Task 7 component/helper/persistence/hook test files> --maxWorkers=1 --reporter=dot

Test Files  10 passed (10)
Tests       91 passed (91)
Duration    21.04s
```

Latest scoped ESLint over every Task 7 TypeScript/TSX file: exit 0. `git diff --check` has no whitespace errors (Git reports only the repository's LF-to-CRLF checkout warnings).

The final local-map reroll and cycle-reset checks also passed after that integration run:

```text
Test Files  2 passed (2)
Tests       2 passed | 32 skipped (34)
Duration    7.53s
```

After synchronizing frozen Task 6 fix `c9a6b33`, forced TypeScript and the expanded focused suite passed:

```text
npx tsc -b --force
exit 0

npx vitest run <11 Task 7 component/helper/persistence/hook/reset test files> --maxWorkers=1 --reporter=dot
Test Files  11 passed (11)
Tests       105 passed (105)
Duration    24.83s

npx eslint <all Task 7 TypeScript/TSX files>
exit 0
```

No full-suite, build, or browser claim is made. Root owns those final integrated gates and the desktop/mobile browser pass.

## Remaining integration gate

1. Wait for root's Task 6 Astra gate verdict. The additive `CharacterContinuityEvidenceLine.background?: string` field is synchronized; map accepted maintext records its background for reconstruction.
2. Keep the Task 7 diff isolated for root review and commit only after root's GO.
3. Root runs the integrated full suite/build/browser gates after the scoped Task 7 commit is available.
