# Task 5 opportunity and quiet-wait implementation report

## Owned scope

- Added `src/engine/investigation-opportunities.ts` and focused tests.
- Updated `src/engine/scheduled-events.ts` and focused tests.
- Did not edit scene-list, mystery schema/prompt/types, hook, transaction, or variable integration owned by other workers.

## Opportunity authority

`buildInvestigationOpportunities` evaluates only player-visible, travelable registered destinations, plus the current registered anchor. At each destination it calls `buildMysteryBrief` with the shared authored fixed-location cast. The brief remains the only fact gate for cycle, route, evidence, suspicion, location, and reveal depth.

Internal source IDs use the existing opaque alias convention (`fact:F###:level`). Opportunity IDs are deterministic and cycle-scoped (`investigation:c<cycle>:<alias>:<level>:<location>`). The default list selects only a level newer than current canonical player knowledge and omits an exactly completed opportunity. A known earlier level can still be recovered through exact lookup when the current brief continues to authorize that level. This keeps same-day menu retries and continuations executable without treating them as new rewards, while rejecting invented IDs and stale prior-cycle IDs.

`projectPublicInvestigationOpportunities` is the publication boundary. It returns only ID, location, public action goal, scope, and an optional authored availability time. Source IDs and topic keys never appear in that projection.

The authored catalog is intentionally conservative. It currently covers:

- F001: search Fumi's remaining clothes and belongings at home.
- F002: ask the school guard whether Fumi arrived at school.
- F003: ask about attendance and leave information at school.
- F004: ask whether anyone else looked for Fumi at school.
- F005: inspect visible living traces and objects after the water tower is publicly travelable.
- F006: seek witnesses along the mountain trail after that route is publicly travelable.
- F007: ask the shop clerk whether Fumi recently visited the supermarket.

The public goals state actions or questions and do not contain the hidden answer. Route-specific and ambiguous facts remain omitted until they have an authored public goal that does not reveal a secret actor, hidden location, or result. An omitted fact is never converted into generic invented clue prose.

Ranking prefers an opportunity whose work-plus-travel quote fits both current stamina and the next event boundary when those inputs are supplied. It then prefers topics with fewer than two consecutive no-progress attempts and shorter total time. Exhausted but still-unearned opportunities remain in the list at lower priority, so the program does not cancel player insistence.

## Atomic progress

`OpportunityProgress` adds an optional `settledResolutionIds` array for old-save compatibility. Settlement resets safely when the resolution cycle changes and records each resolution ID once.

A selected attempt is eligible for progress settlement only when a completed inquiry, investigation, or search segment carries that exact `opportunityId`. A reward counts only when the same source is present in all three sets: the selected opportunity's sources, the resolved action's completed sources, and the hook's final newly committed sources. This permits a newly authorized fact level or future accepted event/cognition source, while rejecting planned facts, partial work, unrelated events, summaries, and duplicate transactions.

An actual new source adds the opportunity ID and clears the topic's no-progress streak. Completed selected work with no actual new source increments the topic streak. Partial work, travel, and event-only turns do not increment it.

## Quiet waits and death aftermath

`planQuietWait` is an advisory pure function; `resolveAction` remains the time authority. An unqualified wait targets the next death event, commitment, or midnight boundary. A positive explicit limit stops earlier. A boundary already due returns `deliver-boundary` with zero minutes, so integration selects the existing required event instead of constructing an invalid zero-minute wait step.

If a caller supplies a validated `availableUntil`, any opportunity window crossed by the proposed wait is returned through the public projection. The function does not invent opening hours or schedules.

The death-news directives no longer command sanity loss, sustained collapse, or narrowing every option. They require delivery and grounded impact, then allow grief, limited evidence-based follow-up, rest, or explicit waiting. Resource changes remain program-owned.

## Verification

- Red runs observed for the missing opportunity module; exact lookup/public projection/settlement stubs; missing school alternatives/ranking; missing home/water-tower/mountain/supermarket affordances; and the old collapse/wait behavior.
- `vitest run src/engine/investigation-opportunities.test.ts src/engine/scheduled-events.test.ts --maxWorkers=4`: 32 tests passed.
- ESLint on the four owned engine files: passed with no output.
- A trailing-whitespace scan across the four owned engine files and this report returned no matches.
- `tsc -b --pretty false` reached two errors in concurrently edited integration tests (`action-authority.test.ts` and `vars-validator.test.ts`). It reported no diagnostic in the owned files. Root and the integration owner received the exact errors; this worker did not edit outside its scope.

## Integration requirements

- Validate a selected menu ID with `findInvestigationOpportunity` against the pre-transaction truth context; do not accept model-created IDs or sources.
- Capture the internal selected opportunity before merging knowledge. Continuations retain their original source location through the existing pending authorization ledger and do not depend on current default-list membership.
- Pass only final newly committed source IDs to `settleOpportunityProgress`, and commit the returned progress in the same guarded transaction as the resolution and knowledge changes.
- Persist/snapshot the counter, include it in preparation cache keys, and reset it at the repeated-day boundary.
- Publish only `PublicInvestigationOpportunity` values to the model and UI.
