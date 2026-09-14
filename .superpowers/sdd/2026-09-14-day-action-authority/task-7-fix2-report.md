# Task 7 fix round 2 report

Status: the stale local-resume promise finding in `task-7-fix1-review.md` is fixed in the isolated `F:/farewell-action-ui` worktree. This change is scoped to local map dispatch ownership, its deterministic persistence guard, and the hook regression tests.

## Fixed behavior

- Every local map resume now owns an operation object bound to the active chat and current API abort-controller session.
- Starting a newer AI request invalidates the local operation before that request changes shared UI state.
- Local resume success, failure, and cleanup handlers verify operation ownership before writing notifications, parsed content, or the waiting control.
- The deterministic map helper also invokes the hook-provided ownership guard inside its save assertion and again before committing the transaction. A superseded operation therefore cannot commit an old map result over a newer request, including when the active chat ID has not changed.
- A current operation still reports a real save error, unlocks its controls, and can be retried. Its synchronous duplicate-click rejection remains active.

## Regression evidence

The review's extracted callback probe showed that settling an old local save changed the new request's busy state to false. The new regression defers the old save, switches to a new chat, starts a new AI request, and then covers both resolution and rejection of the old save. In both cases it verifies that the active chat, request abort controller, streaming/waiting controls, parsed content object, and notification count remain owned by the new request.

Focused verification after the fix:

```text
npx vitest run src/hooks/useGameLoop.action-resolution.test.tsx \
  -t "resumes a reloaded map-origin continuation|does not let a stale local-map save" \
  --maxWorkers=1

Test Files  1 passed (1)
Tests       3 passed | 22 skipped (25)
```

The third case forces a current-session map save failure, confirms the error and control release, retries, and reaches the deterministic destination without an extra model call.

```text
npx tsc -b --force
exit 0

npx eslint src/hooks/useGameLoop.ts src/utils/localMapTravel.ts \
  src/hooks/useGameLoop.action-resolution.test.tsx
exit 0

git diff --check
exit 0 (checkout line-ending warnings only)
```

No full-suite, build, live-model, or browser claim is made. Root owns the integrated gates.
