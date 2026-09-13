# Task 4 adapter report

## Scope

Changed only:

- `src/agents/mystery/action-authority.ts`
- `src/agents/mystery/action-authority.test.ts`
- this report

No git operation was performed.

## Adapter changes

- Added `ActionAuthorityContext.sourceLocationId?: string`. It defaults to `currentLocationId`. Approved case facts bind only to the last work step at that trusted location; when no eligible work step exists, those facts remain unearned.
- Split approved knowledge events into arrival and work milestones. An arrival event is eligible only when its ID is present in both `plan.knowledgeEvents` and trusted `proposedScene.sceneContract.requiredKnowledgeEvents`.
- Inserted one explicit program travel step at the actual destination transition when an arrival event needs a completion milestone. The resolver then does not create a second leg. Interrupted travel earns nothing; completed travel earns the arrival event; continuation skips the completed travel and does not earn or present the encounter again. Other knowledge events remain bound to completed work.
- Added independent cloning for continuation inputs and projected plan collections/objects. An empty input beat array is no longer mutated when a fallback beat is added.
- Extended `projectExecutedPlan(plan, resolution, presentNpcIds?: readonly string[])`. Partial work at the executed destination retains the caller-provided, program-approved present NPC IDs. Event-only and travel-only projections carry neither fixed-location beat anchors nor reception speakers.
- Projection now rewrites `turnGoal`, beats, `scenePlan`, background proposals, assets, and menus whenever execution is partial/non-work or any planned revelation/knowledge event remains unearned. This also covers a fully completed attempt whose fact source had no eligible location-bound work step.
- Reworded projected segments and action-outcome sources as public Chinese facts. The official death-call source states only that police formally informed the player of Wen Sui's death and that cause, culprit, and circumstances were not given.

## Focused tests

`src/agents/mystery/action-authority.test.ts` now has 19 passing tests, including new coverage for:

- trusted arrival knowledge versus work-completion facts/knowledge;
- no repeated travel encounter on continuation;
- case-fact binding to the final eligible work step at `sourceLocationId`;
- withholding a fact when no eligible source-location step exists;
- removing outcome text from turn goal, beats, scene plan, and background proposals;
- preserving approved destination cast after arrival with partial work;
- suppressing unrelated reception for travel-only/event-only projections;
- independent projected objects and no empty-plan mutation;
- public Chinese action-outcome wording without Writer command language.

Verification:

```text
npm test -- --run src/agents/mystery/action-authority.test.ts
19 tests passed

npx eslint src/agents/mystery/action-authority.ts src/agents/mystery/action-authority.test.ts
exit 0
```

The npm wrapper prints its existing warning that `--run` is parsed as a normal npm argument; Vitest still ran the requested single test file successfully.
