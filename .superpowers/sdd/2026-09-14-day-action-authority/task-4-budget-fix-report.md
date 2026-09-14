# Task 4 budget fix report

## Scope

Changed only the budget parsing helpers in `src/agents/mystery/action-authority.ts`, their focused tests in `src/agents/mystery/action-authority.test.ts`, and this report. No git stage or commit was performed.

## Root cause

`explicitDuration` used one flat regular-expression match list for both aggregate limits and per-stage durations, then summed every match. For `最多两小时，先深入调查房间，再休息一小时`, it added the 120-minute overall cap to the 60-minute rest duration and produced a false 180-minute budget.

The same function was also used to set a rest/wait step's `requestedMinutes`, so aggregate wording and local stage wording were not represented separately.

## Fix

- Added a small shared conversion helper for already-matched duration expressions.
- `explicitDuration` first recognizes the existing explicit aggregate markers (`只用`, `只花`, `最多`, `总共`, `总计`, `限定`, `预算`, `给自己`). When one is present, its first clear cap is the overall budget and nested stage durations are not added to it.
- When no aggregate marker exists, the existing `用`/`花`/`休息`/`等待`/`等` matches remain additive, preserving compound-duration behavior.
- Added `explicitStageDuration`, limited to rest/wait expressions, for `requestedMinutes`. Thus `休息一小时` remains a 60-minute stage beneath a separate 120-minute overall cap.
- Kept the existing negative lookahead behavior that excludes historical `两小时前` while allowing the established `五分钟前往` budget form.

## TDD evidence

The new exact regression test first failed with `expected 180 to be 120`. After the fix:

```text
npx vitest run src/agents/mystery/action-authority.test.ts
26 tests passed

npx eslint src/agents/mystery/action-authority.ts src/agents/mystery/action-authority.test.ts
exit 0
```

The regression test verifies a 120-minute total, 105 completed investigation minutes, and only 15 executed minutes of a requested 60-minute rest. Its paired control verifies that one hour of rest plus half an hour of waiting remains an additive 90-minute budget when no global cap is present.

## Round 2: clause-local limits

The follow-up probe used `先休息十分钟，再只用五分钟等待` with Director stages `rest` then `wait`. Before the fix it produced:

```text
TASK4_LOCAL_CAP_PROBE {"budget":5,"requestedMinutes":[10,60],"executedMinutes":5}
```

Two parsing boundaries caused the result:

- the aggregate-cap expression searched the whole input and treated the second clause's `只用五分钟` as a whole-action cap;
- stage parsing only recognized verb-before-duration forms such as `等待五分钟`, so `五分钟等待` fell back to the program's default 60 minutes.

The aggregate expression is now anchored to the start of the whole input. Later clause-local `只用`/`只花` phrases stay in the additive stage-duration path. Stage parsing accepts the bounded verb-before-duration and duration-before-verb rest/wait forms. The existing historical-time exclusion remains in both directions.

The final ignored probe output is:

```text
npx vitest run --config .codex-test-tmp/vitest.config.ts --reporter=verbose
TASK4_LOCAL_CAP_PROBE {"budget":15,"requestedMinutes":[10,5],"executedMinutes":15}
1 test passed
```

Final scoped verification:

```text
npx vitest run src/agents/mystery/action-authority.test.ts
28 tests passed

npx eslint src/agents/mystery/action-authority.ts src/agents/mystery/action-authority.test.ts
exit 0

git diff --check -- src/agents/mystery/action-authority.ts src/agents/mystery/action-authority.test.ts
exit 0 (Git emitted only the repository's LF-to-CRLF working-copy notices)
```
