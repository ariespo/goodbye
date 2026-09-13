# Task 4 schema and prompt report

## Scope

Owned files:

- `src/agents/mystery/types.ts`
- `src/agents/mystery/schemas.ts`
- `src/agents/mystery/prompts.ts`
- `src/agents/mystery/action-proposal-schema.test.ts`

No files were staged or committed.

## Changes

- Added optional `DirectorPlan.actionSteps` using the intent-only `DirectorActionStepProposal` shape: non-empty `id`, allowed non-event `kind`, `short|normal|deep` scope, and `locationId`. Program-owned completion sources, event effects, exact durations, and prices are absent from the proposal type.
- Added `actionSteps` to the strict Director JSON schema with one to eight items, four required fields, closed item objects, allowed kind/scope enums, and non-empty string constraints.
- Kept `timeCostMinutes` optional for compatibility and documented that program resolution ignores it.
- Replaced the old 5–15 / 20–40 prompt guidance with central 25 / 55 / 105 minute work prices, one charge per actual travel leg, shared travel at the same destination, ordered compound-stage totals, and partial reward for a short explicit budget.
- Added Writer instructions to treat `resolvedAction` as authoritative, cover the complete current elapsed interval through selected highlights, leave time/resources to the program, withhold unfinished findings, and avoid replaying completed travel/work on resume.
- Clarified that `WriterPacket.resolvedAction` is required for new live turns and optional only for legacy test/persisted packet migration.

## TDD evidence

The focused test was added first and failed in the expected three places: the strict schema omitted `actionSteps`, the Director prompt retained the old prices, and the Writer prompt had no resolved-action authority. After implementation, the focused test passed all four cases.

The test guards the runtime response-format schema, the closed four-field proposal surface, optional compatibility time, central pricing/travel/budget instructions, and Writer elapsed/outcome/resume instructions.

## Integration check

`parseDirectorPlan` returns the parsed plan object without reconstructing it. Subsequent Director sanitizers and scene enforcement use object spread, so they retain `actionSteps`. No orchestrator edit was required for transport.

## Verification

- `npm test -- --run src/agents/mystery/action-proposal-schema.test.ts src/agents/mystery/action-authority.test.ts src/agents/mystery/prompt-efficiency.test.ts src/agents/mystery/narrative-repair.test.ts src/agents/mystery/orchestrator.action-resolution.test.ts` — 5 files, 40 tests passed.
- `npx tsc -b --pretty false` — passed.
- `npx eslint src/agents/mystery/types.ts src/agents/mystery/schemas.ts src/agents/mystery/prompts.ts src/agents/mystery/action-proposal-schema.test.ts` — passed.

The existing Task 2 assertion-source and fact-authorization rules were not changed.
