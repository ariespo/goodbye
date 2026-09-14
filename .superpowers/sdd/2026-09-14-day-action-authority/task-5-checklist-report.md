# Task 5 checklist authority report

## Scope

Implemented the checklist-side Task 5 boundary in:

- `src/agents/mystery/scene-list.ts`
- `src/agents/mystery/scene-list.test.ts`
- `src/agents/mystery/types.ts`
- `src/agents/mystery/schemas.ts`
- `src/agents/mystery/prompts.ts`

No files were staged or committed.

## Exported checklist API

`ProgramChecklistAction` is the program-authored generic action contract:

```ts
export interface ProgramChecklistAction {
  id: string;
  publicGoal: string;
  kind: 'inquiry' | 'investigation' | 'search' | 'travel' | 'rest' | 'wait';
  scope: ActionScope;
  locationId: string;
  requestedMinutes?: number;
}
```

The program path is activated only when `SceneListInput.publicOpportunities` is defined. An empty array still activates it. Leaving the property undefined preserves the legacy schema, prompt, parser, and model-authored legacy display fields.

The program path also accepts `programActions`, `currentLocationId`, and `currentTime`. It exports:

- `quoteProgramChecklistAction`, which calls `quoteActionSteps` using trusted kind, scope, location, and optional requested minutes;
- `materializeProgramSceneChecklist`, which validates model-echoed IDs and adds program quotes;
- `buildDeterministicSceneChecklist`, which produces a safe fallback directly from approved public goals with an empty observation.

Materialized items retain the legacy `time`, `stamina`, and `sanity` projections and add optional `actionId`, `opportunityId`, `kind`, `scope`, `locationId`, `requestedMinutes`, and `quote` metadata for root persistence and selection integration.

## Authority behavior

- The new strict model schema contains no time, stamina, sanity, or quote fields.
- The model echoes an opaque `actionId`; unknown IDs, duplicates, and investigation/action category mismatches reject the whole generated checklist.
- An investigation opportunity becomes a trusted `investigation` step. Generic action steps use only root-authored `ProgramChecklistAction` metadata.
- `quoteActionSteps` supplies work, travel, total, and stamina values. Legacy display fields are derived from that quote, and sanity is zero because checklist prose does not own resource effects.
- The operative label is always the trusted `publicGoal`; a valid ID paired with malicious destination/scope prose cannot change the selected action.
- The new prompt receives only approved main text, a public scene-plan projection, exact public opportunities, and public generic actions. It excludes variables, source IDs, topic keys, fact IDs, hidden concealment text, cost tiers, requested minutes, and old checklist price fields.
- Expired opportunities are excluded when a valid current clock is supplied.
- Zero- and one-item lists are accepted. The deterministic fallback does not invent observation text or filler items.
- Director option intents and scene investigation/action intents now carry optional `opportunityId` and `scope`. The prompt states that these are untrusted echoes and program pricing ignores legacy `costTier`.
- Existing hook behavior remains responsible for asynchronous assertion audit before any checklist merge or persistence.

## TDD and verification

Observed RED failures for the missing program API, unknown-ID acceptance, private scene-plan projection, old-price prompt leakage, and model-description/action mismatch before implementing each behavior.

Fresh focused result after the final behavior changes:

```text
npx vitest run src/agents/mystery/scene-list.test.ts --maxWorkers=1
Test Files  1 passed (1)
Tests       21 passed (21)
```

Scoped ESLint exited 0 for all five owned source/test files.

Repository type build was attempted with `npx tsc -b --pretty false`. It reached three errors only in the concurrent root-owned `src/hooks/useGameLoop.action-resolution.test.tsx`: `opportunityProgress` is currently typed as `unknown` at lines 61, 68, and 69. Root was notified and owns the typed integration fix. No type error was reported in the checklist-owned files before that build stopped.

