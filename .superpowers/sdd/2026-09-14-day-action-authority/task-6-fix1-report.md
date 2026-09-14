# Task 6 fix round 1 report

## Outcome

All five consolidated Astra findings from `task-6-review.md` are addressed in the Task 6 runtime. The work remains unstaged for root review and commit.

## Behavioral fixes

1. **Audience evidence is bound to the rendered exchange.** Continuity evidence now carries the optional rendered `background`. A listener's ordinary reply proves hearing only when it is an immediate same-scene response. A scene switch breaks that inference unless the accepted text explicitly supplies a phone/message channel. The live audit prompt states the same rule.
2. **Commitments require affirmative, grounded undertakings.** Accept operations require an actor-rendered affirmative clause that grounds the action, recipient, location, and time. Negative, conditional, interrogative, request-only, and mismatched-field proposals fail validation. Fulfillment rejects arrival-only, hypothetical, and negative/non-performance evidence; cancellation rejects denied or conditional cancellation. A positive undertaking in the second sentence of a multi-sentence line remains valid.
3. **Belief changes require positive, proposition-bound reactions.** Negated reactions and reactions about an unrelated subject cannot create affirmative belief/suspicion/inference effects. Immediate deictic responses and explicit same-proposition reactions remain valid.
4. **The actual Writer payload keeps continuity meaning without private identifiers.** Writer memory uses opaque cognition/disclosure/commitment identifiers and public summaries/evidence. Director-only `sourceMemoryIds` are removed from each approved beat before the Writer call. The integration test exercises validate -> `buildTurnCommit` -> context compilation -> full Writer messages and verifies public heard/belief/evidence text remains while canonical proposition IDs, raw cognition IDs, and `propositionId` do not appear.
5. **Disclosure and commitment records participate in real budget selection.** Full Director and Writer projections are measured while selecting whole optional records. Disclosures are ranked and admitted within the remaining budget instead of appended afterward. Every active current-cycle commitment is mandatory; compilation throws `ContextBudgetError` when the required authority cannot fit rather than silently truncating it.

## API note for Task 7

The only public shape change is additive: `CharacterContinuityEvidenceLine` and the narrative review evidence projection may include `background?: string`. There are no changes to the continuity audit envelope, validated effects, `buildTurnCommit`, or active commitment boundary signatures.

## Modified paths

- `src/agents/mystery/narrative-review.test.ts`
- `src/agents/mystery/narrative-review.ts`
- `src/agents/mystery/prompts.ts`
- `src/agents/mystery/review.ts`
- `src/agents/mystery/turn-preparation.execution.test.ts`
- `src/agents/mystery/turn-preparation.ts`
- `src/memory/character-continuity.test.ts`
- `src/memory/character-continuity.ts`
- `src/memory/world-memory.test.ts`
- `src/memory/world-memory.ts`

## TDD evidence

The following cases were observed failing before production fixes:

- school disclosure followed by an unrelated hospital reply incorrectly proved hearing;
- an adjacent rendered background switch incorrectly proved hearing;
- `我不相信文穗买过牛奶` and an unrelated positive reaction incorrectly created affirmative belief;
- negative and conditional promises and mismatched action/location/time/recipient fields were accepted;
- `我还没有交出值班表` incorrectly fulfilled, and `我没有取消约定` incorrectly cancelled;
- all 80 disclosure records were appended beyond the reported selection budget;
- an oversized mandatory active commitment compiled instead of failing explicitly;
- an actual validated/committed private proposition and Director-selected memory IDs reached the Writer payload;
- the live audit prompt did not explain the new background/polarity/undertaking constraints.

Positive controls cover immediate same-scene and explicit phone hearing, affirmative proposition-bound belief, multi-sentence affirmative acceptance, actual performance, and explicit cancellation.

## Verification

- Focused Task 6 integration gate: `141 passed` across 7 files:
  - `src/memory/character-continuity.test.ts`
  - `src/memory/world-memory.test.ts`
  - `src/agents/mystery/narrative-review.test.ts`
  - `src/agents/mystery/turn-preparation.execution.test.ts`
  - `src/agents/mystery/orchestrator.test.ts`
  - `src/hooks/useGameLoop.action-resolution.test.tsx`
  - `src/engine/commitment-boundaries.test.ts`
- After the final lint-only implementation cleanup, the directly affected context/payload suites passed `28/28`.
- `npx tsc -b --force --pretty false`: exit 0.
- Scoped ESLint over all ten modified TypeScript files: exit 0.
- `git diff --check`: exit 0 (Git emitted only the repository's LF-to-CRLF conversion notices).

No full suite or production build was run, per the bounded fix-round instruction; root owns the combined final gate.
