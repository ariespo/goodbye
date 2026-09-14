# Task 8 bounded acceptance-harness preparation report

## Scope and provenance

- Worktree: `F:/farewell-live-acceptance`
- Branch: `feature/live-acceptance-harness`
- Base commit inspected before edits: `e6bf1663390fe71ea3ad2da8e1049ce9d4cb0525`
- Production `src/` edits: none
- Live model requests, credential reads, deploys, and pushes: none
- The copied `task-8-gateway-preflight.md` remains untracked and is deliberately excluded from this commit.

This is harness preparation only. Task 6 integration and Task 7 UI were not available on this branch, so real full-day, real-model, and browser acceptance remain unrun. The harness explicitly reports those gaps and does not fabricate an alive in-person Fumi scenario for the six-exchange character investigation.

## Implemented harness behavior

- `DAY_MODE` accepts only `standard`, `strict`, and `legacy`; unknown values throw. Legacy is recorded as `raw-legacy-compatibility` with standard policy behavior instead of being mislabeled as a native standard run.
- Acceptance startup rejects active `DAY_STYLE_OBSERVE` and `DAY_STYLE_DIAGNOSTIC` overrides.
- Checkpoints and result files carry the full tested Git commit plus profile/mode/model/base URL/max-turn/run-tag/baseline-cycle provenance. Resume rejects commit, configuration, start-cycle, current-cycle, or result/checkpoint disagreements.
- Both result and checkpoint serialization replace configured credentials with `[redacted]`. Checkpoints still omit settings/API credentials structurally.
- Cycle completion is baseline-relative, including cycle 3 to 4. Only a `day-end` reset observed at story-clock midnight, returning to story-clock 08:00, and advancing exactly one cycle can be classified as `completed-calendar-day`.
- Resource resets, invalid day-end resets, turn caps, provider balance/proxy/HTTP errors, early endings, and repeated failures remain distinct stop reasons. A single accepted row cannot pass full-day acceptance.
- The `program-menu` profile invokes the real hook `performAction` entry point when an actual program-owned menu row exists. It records the row metadata, persisted user-message `actionRequest`, and exact retry identity comparison. A program-menu run with no `performAction` selection cannot pass.
- A transparent test-only wrapper records the actual `settleGameTransaction` input without replacing the resolver or settlement. Rows retain the resolved ID, segments, planned/executed work and travel, resource before/after values, selected opportunity, settled progress, completed source IDs, presented knowledge/fact changes, and menu quote versus actual settlement.
- Narrative assertion-review results are captured through a transparent wrapper around the real review function. Persisted action continuity, opportunity progress, world-memory events/cognition/disclosures/commitments, and stable-ID deltas are bounded to the latest 100 records per category.
- Audit summaries report verified investigations against the 5–8 morning target and verified major actions against the 10–16 full-day target. These are status bands, not caps or pass requirements. Accepted rows without a captured resolution are counted as unverifiable instead of inferred from prose or clock movement.
- Provider request/status/error/token figures, retry counts, playable and foreground latency, resolution totals, source-award counts, and clock/resource contradictions are retained. Raw request/response bodies remain only under ignored `.codex-test-tmp`; the compact summary excludes them.
- The database remains a test double. Harness output states that in-memory committed chat/variables/history are observed, while IndexedDB durability, reload restoration, and browser playback persistence require later browser acceptance.

## Deterministic red/green evidence

Red runs were observed before each helper implementation:

- `npx vitest run scripts/live-day-evaluation-harness.test.ts --maxWorkers=2`
  - Initial result: 11 tests failed with the deliberate `not implemented` behavior.
  - Persisted-delta addition: 1 failed / 11 passed before implementation.
  - Quote-versus-actual addition: 1 failed / 12 passed before implementation.
- `npx vitest run scripts/summarize-live-day-evaluation.test.ts --maxWorkers=2`
  - Initial result: 3 failed against the old summarizer. One-row acceptance was absent, action statistics were absent, and sparse failure fixtures exposed an unsafe `before.time` access.

Clean green runs obtained before the host became load-contended:

- `npx vitest run scripts/live-day-evaluation-harness.test.ts --maxWorkers=2`
  - 13 passed, 0 failed.
- `npx vitest run scripts/summarize-live-day-evaluation.test.ts --maxWorkers=2`
  - 3 passed, 0 failed.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-day-evaluation.test.tsx scripts/live-agent-latency.test.tsx --maxWorkers=2`
  - 16 passed, 0 failed, 3 opt-in live tests skipped; exit 0.
- `npx tsc -b --force --pretty false`
  - Exit 0 with no diagnostics. This forced build was used because `node_modules` is a shared junction and incremental output could give a false pass.
- `node --check scripts/summarize-live-day-evaluation.cjs`
  - Exit 0.
- `git diff --check`
  - Exit 0; only line-ending conversion notices were printed.

Two later checks were intentionally terminated at root's request because its concurrent Task 6 full gate was experiencing shared-resource contention:

- `npm test -- --run --maxWorkers=2`: terminated with Ctrl-C, exit 1. This was non-gating and redundant; many suites had passed, but no full-suite success is claimed.
- Final targeted rerun under the same contention: terminated with Ctrl-C, exit 1 after the helper suite passed 13/13 and the summarizer passed its first two cases; the third subprocess-heavy case exceeded Vitest's 5-second timeout. The same complete summarizer suite had passed 3/3 in 1.868 seconds in the prior clean run. No functional failure was observed, but the terminated run is not reported as green.

Root requested no further tests or builds in this old-base isolated worktree. Root will rerun the final merged Task 8 gates after Tasks 6–7 integration.

## Exact changed files

- `scripts/live-day-evaluation.test.tsx`
- `scripts/live-agent-latency.test.tsx`
- `scripts/live-day-evaluation-harness.ts`
- `scripts/live-day-evaluation-harness.test.ts`
- `scripts/summarize-live-day-evaluation.cjs`
- `scripts/summarize-live-day-evaluation.test.ts`
- `.superpowers/sdd/2026-09-14-day-action-authority/task-8-harness-report.md`

## Remaining acceptance gates

- Merge against completed Task 6 integration and Task 7 UI, then rerun deterministic integration/full gates.
- Run the paid real-model profiles on one immutable tested commit with diagnostics disabled, including directed, first-option, program-menu, cycle 3 to 4, legal accusation positives/negatives, and legacy compatibility.
- Run the legal character-continuity scenario selected by root; do not substitute fabricated in-person Fumi access.
- Verify browser IndexedDB persistence, reload, playback, quotes, actual settlement, interruption/continuation, and next-loop character recall.
- Preserve failed/provider-limited samples and report unrun rows explicitly; tuning-target misses do not become hard action caps.
