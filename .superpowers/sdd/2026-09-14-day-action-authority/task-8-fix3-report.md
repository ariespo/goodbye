# Task 8 fix3 acceptance-harness report

## Scope and provenance

This fix starts from Task 8 fix2 `0320cd4` and reviewed runtime source `6b97271` (local dependency commit `574d93a`). It changes only the acceptance helper, its deterministic tests, the approved real-hook day-contract test, and this report. It changes no production runtime and made no live request.

## Exact accepted-candidate linkage

Fact-review captures still retain the exact candidate passed to the production critic, and paid scenarios still identify the current attempt through a newly committed assistant message id and history delta. Candidate linkage now compares the production-extracted player-visible semantic fields rather than the whole serialized response.

The comparison admits only the known post-review checklist transformation: authoritative `observe`, `investigate`, and `action` blocks may be removed/reinserted by the hook. It requires exact equality for playable `maintext`, every indexed `option`, `hint`, and `summary`. It does not strip arbitrary markup, normalize prose, compare loose substrings, or pool assertions from other reviews.

The cycle-4 real-hook case demonstrates the positive boundary. The reviewed candidate contains the route-fact prose and no checklist tags; the committed assistant content is a different string containing the actual program-generated investigate/action/observe blocks. The harness assessment links them and accepts the exact supported citation. Deterministic negatives change maintext, an option, or the summary and fail linkage. Existing stale-opening, provider/malformed failure, and rejected-revision citation tests remain negative.

## Verification

- Initial real-hook red: helper tests passed, while the generated-menu positive failed because the first implementation also compared program-owned observation content. The comparator was narrowed to the exact required semantic fields: maintext, options, hint, and summary.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts src/hooks/useGameLoop.day-contract.test.tsx --maxWorkers=1`: 2 files and 34 tests passed.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx src/hooks/useGameLoop.day-contract.test.tsx src/agents/mystery/loop-contract.test.ts src/engine/conclusion-system.test.ts --maxWorkers=1`: 5 files passed, 2 opt-in live files skipped; 54 passed, 2 skipped.
- `npx tsc -b --force --pretty false`: exit 0.
- Scoped ESLint: exit 0 with one existing/accepted `no-explicit-any` warning in test code.
- `git diff --check`: exit 0 with expected LF-to-CRLF worktree notices only.
- No full suite, build, key, live model call, deployment, or push was performed. Root reported runtime `6b97271` at 144 focused tests passed plus TypeScript/lint.

## Changed files

- `scripts/live-day-evaluation-harness.ts`
- `scripts/live-day-evaluation-harness.test.ts`
- `src/hooks/useGameLoop.day-contract.test.tsx`
- `.superpowers/sdd/2026-09-14-day-action-authority/task-8-fix3-report.md`

The copied untracked gateway preflight remains excluded.
