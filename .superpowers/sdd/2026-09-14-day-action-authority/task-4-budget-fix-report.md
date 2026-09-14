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
