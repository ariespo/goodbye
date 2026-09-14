# Task 8 acceptance-harness adaptation report

## Scope and dependency provenance

This commit changes only the approved acceptance scripts, their helper/tests, and the three approved production-test files. It does not change production runtime code and made no live model request.

The worktree began with harness preparation commit `f2fe8c776a05095e1e9ebe9cc65cac03fe297451`. It was then synchronized with the reviewed production/UI source commits `3840848`, `2cd9067`, `05068f1`, `d9b9c78`, and `e7df047`. Their local cherry-pick equivalents at the time of this report are `1119334`, `88770ef`, `bc23a53`, `2805585`, and `fff5b2f`. The final Task 8 commit is intentionally separate from those dependency commits.

## Implemented evidence

- `DAY_MODE` accepts only `standard`, `strict`, or the explicitly labelled `raw-legacy-compatibility` path. Unknown values fail at module load. Enabled acceptance rejects diagnostic style overrides.
- The options profile reads the currently displayed first option, validates any stored binding with the production `validatedOptionBinding`, invokes the production `selectOption(text, binding)`, and counts only an accepted selection. A stale stored binding fails locally. Unbound ordinary options remain legal.
- The program-menu profile invokes production `performAction(type, index, actionId, locationId)` using the rendered row metadata and current normalized location. It remains a distinct profile from options.
- Campaign segments use a stable campaign id, exact baseline cycle, tested commit, model/base/config, and SHA-256 checkpoint/result parent digests. Resume and natural advance are separate operations. Advance requires a passed `completed-calendar-day` parent and exactly one cycle of progress.
- Checkpoints and summaries scrub configured secrets. Checkpoints retain the production state needed for real continuity while audit snapshots bound action continuity, opportunity progress, and character continuity evidence.
- Calendar completion is distinguished from early resource reset, turn cap, provider/proxy error, and consecutive failure. A single accepted row cannot pass a full day.
- Audit counts morning investigation execution turns separately from whole-day investigation turns. The morning interval admits a segment ending at 16:00 and excludes one starting at 16:00. Major-action execution turns, stable unique action ids, resumed turns, and unverifiable identities are separate fields. Resolution hashes are never treated as stable action ids.
- Provider calls are foreground/background only when a call carries explicit classification evidence; all other calls are reported as unclassified. Latency, status, usage, retry identity, resolution contradiction, option/menu, reset, and major-action statistics remain auditable.
- Deterministic coverage exercises standard and raw-legacy days 1–3 through the real hook boundary, cycle 3 to 4 conclusion gates, missing and authorized route facts, the cycle-5 solution gate, and a cycle-3 15:30 partial action. The production deep investigation quote is 105 minutes: it executes 30 minutes to the 16:00 boundary and retains 75 minutes. An attempted exact 120-minute travel fixture correctly failed because production requires the mandatory detective encounter in `street`; the matrix does not bypass that scene contract. The audit helper separately proves that partial and completion resolutions with one continuation identity count as one distinct major action.
- `scripts/live-action-authority.test.tsx` is an opt-in real-model probe for early conclusion rejection, legal route-fact confirmation, interruption/bound-option resume, and reachable Chen Huihui disclosure/reintroduction. Each requested scenario/mode is reset independently and must pass at least three times. The artifact records controlled initial/final state, accepted or rejected outcome, raw scrubbed request/review responses, transactions, action identities, option bindings, and call timing/status.

## Honest coverage limits

No legal ordinary in-person Fumi encounter exists in current production. The authored opening starts at 08:00 after Fumi left at 06:50, and the production location/NPC/fact graph provides reports or sightings rather than a living direct encounter. The runner records this as unreachable and does not create a fixture or claim six substantial Fumi exchanges.

The Vitest database double isolates paid acceptance from user storage. It proves the exact save payloads passed to the database boundary, but it does not prove browser reload persistence. Browser persistence remains a separate real-browser acceptance gate.

The focused scenarios use controlled initial state and explicitly set `fullDayEvidence: false`. They cannot substitute for the three naturally completed campaign segments or the final real browser/full-day acceptance.

## Paid focused invocation and artifact

From the repository root in PowerShell, keep the key in the environment and run:

```powershell
$env:LIVE_ACTION_AUTHORITY = '1'
$env:ACTION_AUTHORITY_API_KEY = $env:DEEPSEEK_API_KEY
$env:ACTION_AUTHORITY_API_BASE_URL = 'https://api.deepseek.com/v1'
$env:ACTION_AUTHORITY_MODEL = 'deepseek-v4-flash'
$env:ACTION_AUTHORITY_MODES = 'standard,legacy'
$env:ACTION_AUTHORITY_SCENARIOS = 'early-gate,legal-fact,interruption-resume,reachable-npc'
$env:ACTION_AUTHORITY_REPETITIONS = '3'
$env:ACTION_AUTHORITY_RUN_TAG = 'task8-paid'
npx vitest run scripts/live-action-authority.test.tsx --maxWorkers=1
```

The test prints `ACTION_AUTHORITY_ARTIFACT` and writes:

```text
.codex-test-tmp/action-authority/task8-paid-<tested-full-git-sha>.json
```

The file is rewritten after every repetition, so a failed run still leaves the accepted/rejected evidence gathered up to the failure. The API key is scrubbed before every write.

## Natural day-chain invocation

Use one immutable checkout, one `DAY_CAMPAIGN_ID`, and the same mode/profile/model/base/max-turn configuration for every segment. Example for the options profile:

```powershell
$env:LIVE_DAY_EVAL = '1'
$env:DAY_API_KEY = $env:DEEPSEEK_API_KEY
$env:DAY_API_BASE_URL = 'https://api.deepseek.com/v1'
$env:DAY_MODEL = 'deepseek-v4-flash'
$env:DAY_MODE = 'standard'
$env:DAY_PROFILE = 'options'
$env:DAY_CAMPAIGN_ID = 'task8-options-standard'
$env:DAY_MAX_TURNS = '90'
$env:DAY_EXPECTED_BASELINE_CYCLE = '1'
Remove-Item Env:DAY_ADVANCE -ErrorAction SilentlyContinue
npx vitest run scripts/live-day-evaluation.test.tsx --maxWorkers=1

$env:DAY_EXPECTED_BASELINE_CYCLE = '2'
$env:DAY_ADVANCE = '1'
npx vitest run scripts/live-day-evaluation.test.tsx --maxWorkers=1

$env:DAY_EXPECTED_BASELINE_CYCLE = '3'
npx vitest run scripts/live-day-evaluation.test.tsx --maxWorkers=1
```

The third invocation starts from the validated natural cycle-2-to-3 parent and must finish cycle 3 at cycle 4. Repeat with `DAY_PROFILE=program-menu` under a distinct campaign id for the separate four-argument menu boundary. Summarize completed files with:

```powershell
node scripts/summarize-live-day-evaluation.cjs .codex-test-tmp/day-evaluation
```

## Verification record

- Helper TDD red: the initial focused helper run failed five new assertions for lineage, option binding, and audit accounting before implementation.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts --maxWorkers=1`: 2 files, 22 tests passed.
- First expanded matrix run: 6 expected fixture/assertion failures exposed missing review defaults, stale program metadata, route-readiness display semantics, and the mandatory travel encounter. Fixtures were corrected to match production contracts.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-action-authority.test.tsx src/hooks/useGameLoop.day-contract.test.tsx src/agents/mystery/loop-contract.test.ts src/engine/conclusion-system.test.ts --maxWorkers=1`: 5 files passed, 1 opt-in file skipped; 48 tests passed, 1 skipped.
- `npx tsc -b --force --pretty false`: exit 0.
- `npx eslint scripts/live-day-evaluation-harness.ts scripts/live-day-evaluation-harness.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx scripts/summarize-live-day-evaluation.test.ts src/hooks/useGameLoop.day-contract.test.tsx src/agents/mystery/loop-contract.test.ts src/engine/conclusion-system.test.ts`: exit 0 with 11 existing/accepted `no-explicit-any` warnings in the script/test harness.
- `node --check scripts/summarize-live-day-evaluation.cjs`: exit 0.
- No full suite or production build was run in this worktree. Root recorded the integrated source full suite as 119 files / 1166 passing tests / 3 explicit live tests skipped before this Task 8 freeze. A previously started redundant full-suite run in this isolated worktree was terminated under shared-node contention as directed; no global Node process was killed.
- No live model request, credential, deployment, or push was performed by this worker.

## Changed files

- `scripts/live-day-evaluation-harness.ts`
- `scripts/live-day-evaluation-harness.test.ts`
- `scripts/live-day-evaluation.test.tsx`
- `scripts/summarize-live-day-evaluation.cjs`
- `scripts/summarize-live-day-evaluation.test.ts`
- `scripts/live-action-authority.test.tsx`
- `src/hooks/useGameLoop.day-contract.test.tsx`
- `src/agents/mystery/loop-contract.test.ts`
- `src/engine/conclusion-system.test.ts`
- `.superpowers/sdd/2026-09-14-day-action-authority/task-8-adaptation-report.md`

The untracked copied preflight file `.superpowers/sdd/2026-09-14-day-action-authority/task-8-gateway-preflight.md` remains excluded.
