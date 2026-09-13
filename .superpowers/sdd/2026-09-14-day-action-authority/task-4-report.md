# Task 4: one resolved action through the playable turn

Status: implementation checkpoint ready for independent review. Tasks 5–8 and live acceptance remain outstanding.

## Behavior

- Resolve Director intent before Writer construction. Both selectable modes (standard/strict) and raw legacy compatibility consume the same program resolution.
- Use central 25/55/105 work scope prices; additional travel once; ordered compound work; explicit player budgets execute partial work. Unqualified rest/wait currently default to a program-owned 60 minutes; Task 5 will add opportunity-aware quiet-wait compression.
- Snapshot preparation dependencies and reproject actual arrival, NPCs, memory, resources, background, scene contract and fact budget. Interrupted transit retains the origin map anchor with street presentation and no premature destination reception.
- Withhold incomplete findings from dependent beats, options, scene lists, background proposals and fact grants. A fact is committed only when completed by the resolver and cited in final approved maintext, not merely planned or summarized.
- Attach public execution sources and validate explicit whole-action duration contradictions. State/Writer/menu prices cannot override resolved time, location, stamina or sanity.
- Store cycle-scoped continuation, settled resolution identities and event-effect identities atomically with the accepted turn. Death delivery is a zero-minute official event and costs 12 sanity once.
- Persist request metadata and deep snapshots. Failed persistence/review/abort does not charge the action; retries and rerolls retain continuation selection.
- Preserve original pending outcome authorization beside continuation, outside model packets. Revalidate current gates and graph/alias identity, restore original revelations before all Director reviews, and clear the private ledger after completion/new work/midnight. Event/wait turns preserve it within the same day.
- Validate malformed actionSteps early enough for schema fallback repair. The Director proposal surface contains intent only: id, kind, scope, locationId.

## Evidence

Fresh checkpoint checks:

- `npm test -- --run`: **107 passed files, 961 passed tests**; 2 live-test files / 3 live tests intentionally skipped. `.codex-test-tmp/task4-pre-review-full.log`.
- `npx tsc -b`: exit 0. `.codex-test-tmp/task4-pre-review-tsc.log`.
- `npm run build`: exit 0. `.codex-test-tmp/task4-pre-review-build.log`.
- `npm run lint`: exit 0. `.codex-test-tmp/task4-pre-review-lint.log`.

Direct hook tests use the actual preparation/orchestrator/resolver/transaction with mocked model completion and storage, not real model quality evidence. They cover 55-minute regular work, 60-minute rest/wait, Writer failure, final-maintext-only facts, and 15:30 deep work → 16:00 interruption → official death event → 75-minute continuation ending17:15. Stamina follows100→96→86, sanity70→58 once. A failed assistant save then retry preserves these exact results. Original F001 authorization survives a resumed Director that omits it; canonical fact IDs/private ledger remain absent from Writer messages.

Regression RED/GREEN pairs are recorded in `.codex-test-tmp`: hook-continuation, action-retry-snapshot, action-proposal-runtime, continuation-midnight-transaction, action-outcome-prose, resume-budget, action-menu-authority and quiet-default-duration. Astra separately reproduced pending-fact omission before the private-ledger fix; the final hook now verifies recovery of that fact.

## Review focus and remaining scope

Review the uncommitted/then-committed Task 4 delta from7cdffe2, including new adapter, private authorization ledger and real hook tests. Task 2/3 are already approved; do not duplicate those reviews except at integration seams.

UI quotes/continuation controls, useful investigation opportunities, quiet-time compression, character/reset memory integration, real-model full-day runs, browser acceptance, push and deployment are later tasks. No claim of measured new day counts, model latency or narrative quality is made at this checkpoint.
