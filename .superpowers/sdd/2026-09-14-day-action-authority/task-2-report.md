# Task 2 report: individual assertion/source review

## Changes

- Added `fact-assertion-review.ts` with stable narrative-field extraction, projected assertion sources, and structural assertion-audit validation. The extractor covers main text, options, summary, hint, observation, investigation and action fields, and removes nested checklist tags from playable main text.
- Added a separate narrative-review JSON schema that requires `assertionAudit`; the existing Director-plan `FactReview` schema remains unchanged. Live narrative approval now requires every material field to be reviewed and every assertion to carry a valid status, exact narrative span and, when supported, an exact allowed source span.
- Projected only approved WriterPacket sources: authorized and player-known facts, public continuity, background facts, accepted knowledge events, and optional authorized action outcomes. Canonical truth is never projected. Approved soft-background proposals become sources only when their exact `evidenceText` is already rendered in clean playable main text.
- Updated the narrative critic and repair prompts to require real semantic comparison, audit derived fields, preserve public/action sources during repair, and distinguish ordinary present action, questions and hypotheses from factual claims. A real source ID or a real but unrelated quote is not treated as entailment.
- Removed global narrative confirmation/history pardons and narrowed Director-plan critic sanitizer exceptions to the exact planned fact. Unrelated confirmation phrases, cycle timing or generic performance claims can no longer erase a critic violation. Narrative review remains unconditionally enabled even when a plan declares no revelation.
- Hard-reviewed every plan beat destination through the registered-location resolver while preserving transient `street` scenes.
- Denied model-origin writes to `mysteryKnowledge`, all fact/clue collections and derived `tripProgress` in the legacy sanitizer, including nested and dotted paths. `organizedClues` may only repeat an exact clue already organized by trusted UI state.
- Exported `buildAssertionSources`, `extractNarrativeFields`, `validateAssertionAudit` and their types from the mystery module.

## TDD evidence

Initial RED checks covered the missing assertion module, forged legacy fact collections, incomplete narrative audits, unsupported derived fields, global confirmation erasure and unregistered plan destinations. Later focused RED checks proved three additional compatibility gaps before their fixes:

```text
npx vitest run src/agents/mystery/orchestrator.test.ts -t "does not let an unrelated confirmation phrase"
1 failed: expected directorAttempts 2, received 1

npx vitest run src/agents/mystery/narrative-review.test.ts -t "unrelated authorized fact"
1 failed: unrelated authority suppressed invented monitor-record evidence

npx vitest run src/sillytavern/vars-validator.test.ts -t "organize only clues"
1 failed: forged organized clue passed through
```

Fresh GREEN verification:

```text
npx vitest run src/agents/mystery/fact-assertion-review.test.ts src/agents/mystery/narrative-review.test.ts src/agents/mystery/narrative-repair.test.ts src/agents/mystery/orchestrator.test.ts src/agents/mystery/scene-contract-review.test.ts src/agents/mystery/mystery.test.ts src/agents/mystery/structured.test.ts src/agents/mystery/repair-task.test.ts src/agents/mystery/turn-preparation.test.ts src/sillytavern/vars-validator.test.ts
10 files passed, 159 tests passed

npx eslint <Task 2 source and test paths>
passed
```

`npx tsc -b --pretty false` reports no Task 2 diagnostics. Whole-tree type checking is currently blocked by concurrently edited integration files:

```text
src/engine/game-transaction.resolved.test.ts:76,78: continuation does not exist on unknown
src/engine/game-transaction.ts:63-65,151,153-158: cycleCount/settledResolutionIds/appliedEventEffectIds/continuation do not exist on unknown
src/hooks/useGameLoop.checklist-review.test.tsx:45: incomplete ChatSession fixture cast
src/hooks/useGameLoop.ts:596: ChatWriteGuard argument is missing signal
```

## Integration boundary

- `WriterPacket.authorizedActionOutcomes?: Array<{ id: string; text: string; speakerIds?: string[] }>` is the public source ingress for resolved current-turn outcomes. The pending 16:00 death-news contract must populate an outcome such as `{ id: 'death-news:16:00', text: '电话明确告知文穗已经死亡。' }` before narrative review. This authorizes the death announcement only; cause, responsibility and process remain unsupported unless separately projected.
- `extractNarrativeFields(narrative)` is the stable hook-facing projection. Checklist tags nested inside `<maintext>` are returned as observation/investigation/action fields and excluded from `maintext`, so they cannot activate a soft-background proposal.
- Structural citation validation checks IDs, exact source spans, field coverage and delivery. Semantic entailment remains the live critic's job; passing structural validation alone is not proof of grounding.
