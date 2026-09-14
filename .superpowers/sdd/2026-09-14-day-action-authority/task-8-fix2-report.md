# Task 8 fix2 acceptance-harness report

## Scope and provenance

This fix starts from Task 8 fix1 `f9dd664` and reviewed runtime source `bca3ccf` (local dependency commit `a0166ff`). It changes only approved harness/helper/test files and this report. It made no live model request and changes no production runtime.

## Paid interruption path

The focused interruption scenario no longer fabricates `controlled-home-deep-*` menu metadata, which production correctly rejects because it is absent from `legalProgramActionMap`. It now sends an accurately labelled ordinary player action asking to remain at home and investigate deeply. The separate legal-fact scenario continues to exercise a genuine generated investigation opportunity through production `performAction('investigate', index, actionId, locationId)`.

The deterministic real-hook standard and raw-legacy cases now execute the full interruption contract. Production resolves a 105-minute current-location deep action at 15:30, executes 30 minutes to the 16:00 death-news boundary, commits that event effect exactly once, exposes the stored 75-minute continuation through a bound option, accepts production `selectOption(text, binding)`, and completes at 17:15. A transparent wrapper proves the partial and completion resolutions both came from the same actual `resolveAction(input.id)`, with the second call marked as a resume.

## Current-attempt factual evidence

The paid factual scenarios snapshot assistant message ids and history length before each attempt. Only a newly committed assistant message can become `acceptedContent`; a prior authored opening cannot be reused after provider, parser, critic, cancellation, or timeout failure.

Each fact review capture includes the exact candidate string it reviewed. Positive support and citations are selected only from reviews whose candidate exactly equals the newly accepted assistant content, so a supported assertion from a rejected revision cannot be pooled into acceptance. A negative case passes only through a newly accepted correction with no affirmative unsupported addition, or an explicit current-attempt semantic rejection whose unsupported assertion/violation/correction matches the requested false claim. A provider or malformed-output failure without that relevant semantic evidence remains failed. Deterministic regressions cover a stale opening, provider/malformed failure, accepted correction, relevant semantic rejection, and rejected-candidate citation pooling.

Affirmative-content patterns are anchored to narrative/sentence boundaries so an accepted correction such as “无法确认……” is not mislabeled as asserting the fabricated claim. Separate broader patterns classify a critic rejection as relevant.

## Additional runtime evidence left visible

Root's paid program-menu artifact at `F:\farewell-day-action-authority\.codex-test-tmp\day-evaluation\program-menu-standard-bca3ccf-menu-real-c1.json` records successful generated investigation row 2, then generated `program:travel:home` rows 3, 6, 9, and 12 failing locally with zero calls and “所选程序行动已经失效。” The harness uses the correct plural API value: `scripts/live-day-evaluation.test.tsx:343` stores `type: 'actions'`, and lines 375–379 pass it unchanged to the production four-argument method; `src/components/game/ActionPanel.tsx:119` does the same.

The failure occurs after action projection: `src/agents/mystery/turn-preparation.ts:400-409` rebuilds the legal program actions/map using projected state, then line 550 looks up the action selected from the preceding generated menu. A travel-to-home action selected while at school has already projected the player home, so that prior travel row is no longer in the rebuilt map. This report does not hide the failure by filtering cross-location actions and makes no runtime change. Root owns the follow-up runtime fix and paid rerun.

## Verification

- First focused red run: 30 passed and 3 failed. The source regression exposed a deliberately broad noun pattern treating a correction as an assertion; the hook test exposed live style review still enabled in the dynamic fixture.
- Intermediate hook runs exposed and corrected fixture expectations for the production `null` settled continuation and confirmed that public outcome display ids are not reliable execution identities.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx src/hooks/useGameLoop.day-contract.test.tsx src/agents/mystery/loop-contract.test.ts src/engine/conclusion-system.test.ts --maxWorkers=1`: 5 files passed, 2 opt-in live files skipped; 53 passed, 2 skipped.
- Final targeted rerun after the accepted/rejection pattern change: `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-action-authority.test.tsx src/hooks/useGameLoop.day-contract.test.tsx --maxWorkers=1`: 3 files passed, 1 opt-in live file skipped; 37 passed, 1 skipped.
- Final `npx tsc -b --force --pretty false`: exit 0.
- Scoped ESLint before the final report: exit 0 with one existing/accepted `no-explicit-any` warning.
- `git diff --check`: exit 0 with only expected LF-to-CRLF worktree notices.
- No full suite, build, key, live request, deployment, or push was performed. Root reported runtime `bca3ccf` review/build passing and separately preserved the incomplete paid program-menu artifact described above.

## Changed files

- `scripts/live-action-authority.test.tsx`
- `scripts/live-day-evaluation-harness.ts`
- `scripts/live-day-evaluation-harness.test.ts`
- `src/hooks/useGameLoop.day-contract.test.tsx`
- `.superpowers/sdd/2026-09-14-day-action-authority/task-8-fix2-report.md`

The copied untracked gateway preflight remains excluded.
