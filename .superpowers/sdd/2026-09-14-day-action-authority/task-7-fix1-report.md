# Task 7 fix round 1 report

Status: the three findings in `task-7-review.md` are fixed in the isolated `F:/farewell-action-ui` worktree. Task 7 remains separate from the main integration branch. This branch includes the approved Task 6 dependency commits `54e5805`, `7bd4342`, and `eda55f3`; those dependency changes are not part of the Task 7 fix commit.

## Fixed behavior

- Map-origin continuations now resume through `resumeLocalMapTravelContinuation`, which revalidates the saved continuation and registered destination, uses the deterministic map resolver, persists the local request/accepted-result pair before updating the store, and never invokes the narrative model path.
- The local continuation uses the remaining travel leg after an accepted boundary. A synchronous hook guard rejects a second click while the first save is in flight, and the existing save guard rejects stale chat, cycle, clock, location, or resource state.
- Accepted local map observations are restored from the accepted assistant message during both chat scene reconstruction and save loading. Reloading an arrival therefore preserves the same free observation without changing the clock, resources, history, visit state, or model-call count.
- `selectOption` now reports a missing settings/API preflight as a non-dispatch. `ChoiceMenu` releases its click lock when dispatch does not start, so the same choice remains usable after configuration; a successful retry and rapid-click guard remain covered.

## TDD evidence

The first focused run failed in the three reviewed areas:

```text
map continuation: location remained home after the offered resume
API preflight: selectOption returned true while opening the API guide
arrival reconstruction: rebuilt observe was undefined
```

After the fixes, the focused integration cases passed. The map lifecycle test begins at home at 15:55, stops at the accepted 16:00 boundary with stamina 98, reconstructs the offered five-minute continuation from saved chat, rejects an immediate duplicate dispatch, and arrives at school at 16:05 with stamina 96. It records the school visit and observation without another `streamChatCompletion` call.

Expanded Task 7 verification:

```text
npx vitest run <11 Task 7 component/helper/persistence/hook/reset files> --maxWorkers=1 --reporter=dot
Test Files  11 passed (11)
Tests       109 passed (109)
Duration    43.73s

npx tsc -b --force
exit 0

npx eslint <8 changed Task 7 TypeScript/TSX files>
exit 0

git diff --check
exit 0 (checkout line-ending warnings only)
```

No full-suite, build, live-model, or browser claim is made. Root owns the integrated Task 8/full-suite/build/browser gates.
