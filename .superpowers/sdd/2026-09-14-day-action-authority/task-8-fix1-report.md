# Task 8 fix1 acceptance-harness report

## Scope and source provenance

This fix is based on the reviewed runtime source `a47cbe8` (local dependency commit `4ffc0f8`) and the earlier Task 8 harness commit `91dea7b`. It changes only the approved live-evaluation scripts, helpers, deterministic tests, and this report. It changes no production runtime code and made no live model request.

## Review findings addressed

- Each real `resolveAction(input)` call is wrapped transparently. The wrapper calls production unchanged, records the actual `input.id` and returned resolution id, and the transaction wrapper attaches the latest matching trace to the exact committed transaction. Audit rows derive identity only from that attached resolver-input trace. Menu/opportunity ids, resolution hashes, and an earlier continuation are never fallback identities. Partial and resumed executions therefore share one identity; separate post-abandon work has another. The TypeScript and CJS summaries both cover the one-plus-two accounting case.
- `DAY_RESUME=1` preflights the current checkpoint/result before installing provider instrumentation, changing the game store, creating directories, restoring state, or writing artifacts. A completed calendar segment, passed segment, or mutually consistent advanced-cycle artifact rejects with `DAY_ADVANCE`. The deterministic check preserves the exact serialized checkpoint/result digests and records zero provider calls and writes. The existing advance checks still require a passed natural parent and immutable commit/config/parent digests.
- The reachable Chen Huihui probe now requires a specific first claim with Chen as listener, accepted player-name recognition and cognition, durable player recall, cleared NPC name recognition after the real cycle reset, and a new accepted second-loop self-introduction disclosure. A disclosure already present at reset cannot satisfy reintroduction. Stale recognition and absent/stale reintroduction fixtures fail. The probe preserves Chen's authored familiar-honorific baseline and does not force player amnesia. After reset it follows a current validated bound continuation when offered and otherwise performs an ordinary transit turn; it does not require Chen on the first post-reset turn.
- Four selectable paid factual probes cover the authorized 06:50 message, a fabricated 06:30 van, the actual unanswered call, and unsupported absence/no-login conclusions. Each mode/scenario starts from an independent controlled state and requires at least three repetitions. Positive cases require the assertion in the final accepted response plus an exact supported audit citation to the production public-event id. Negative cases fail if the unsupported addition survives in accepted content. Raw scrubbed requests, responses, critic audits, accepted output, and failures are rewritten to the artifact after every repetition.
- The interruption probe uses the approved current-location deep action at 15:30. Production quotes 105 minutes, executes 30 minutes to the 16:00 event, and resumes the remaining 75 minutes. The probe invokes the real four-argument program-menu API, then the real validated `selectOption(text, binding)`, and requires the same actual resolver-input identity, one death event effect, no premature source reward, and completion at 17:15. It does not bypass the mandatory street encounter to fabricate a 120-minute travel case.

## Paid focused invocation

From the repository root in PowerShell, provide the key only in the environment:

```powershell
$env:LIVE_ACTION_AUTHORITY = '1'
$env:ACTION_AUTHORITY_API_KEY = $env:DEEPSEEK_API_KEY
$env:ACTION_AUTHORITY_API_BASE_URL = 'https://api.deepseek.com/v1'
$env:ACTION_AUTHORITY_MODEL = 'deepseek-v4-flash'
$env:ACTION_AUTHORITY_MODES = 'standard,legacy'
$env:ACTION_AUTHORITY_SCENARIOS = 'early-gate,legal-fact,interruption-resume,reachable-npc,opening-message-positive,opening-van-negative,contact-unanswered-positive,contact-absence-negative'
$env:ACTION_AUTHORITY_REPETITIONS = '3'
$env:ACTION_AUTHORITY_RUN_TAG = 'task8-fix1-paid'
npx vitest run scripts/live-action-authority.test.tsx --maxWorkers=1
```

The test prints `ACTION_AUTHORITY_ARTIFACT` and incrementally writes:

```text
.codex-test-tmp/action-authority/task8-fix1-paid-<tested-full-git-sha>.json
```

This worker did not run the paid path. Root must inspect every final `outcome.passed`, accepted response, exact citation, unsupported assertion/correction, resolver trace, transaction, and scrubbed raw review response. A failed repetition remains in the artifact and makes the test fail, so a later retest does not erase it.

## Honest limits

The focused scenarios use controlled initial state and record `fullDayEvidence: false`; they are not evidence of a naturally completed day. The database remains a Vitest double, so browser reload and IndexedDB durability require the separate browser acceptance gate. Production has no legal living in-person Fumi encounter after the authored 08:00 opening, so the artifact continues to record that gap without an invented fixture or rescue outcome.

## Verification

- Initial fix1 focused run: 25 passed, 2 opt-in skipped, 1 expected assertion failure. The malformed checkpoint fixture expected the general cycle-provenance diagnostic, while the first completed-segment guard classified every cycle mismatch as terminal. The guard was narrowed to a completed stop/pass or mutually consistent advanced cycle.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx --maxWorkers=1`: 2 files passed, 2 opt-in files skipped; 26 passed, 2 skipped.
- `npx vitest run scripts/live-day-evaluation-harness.test.ts scripts/summarize-live-day-evaluation.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx src/hooks/useGameLoop.day-contract.test.tsx src/agents/mystery/loop-contract.test.ts src/engine/conclusion-system.test.ts --maxWorkers=1`: 5 files passed, 2 opt-in files skipped; 52 passed, 2 skipped.
- Final helper/CJS rerun after strengthening the new-disclosure predicate: 2 files and 26 tests passed.
- `npx tsc -b --force --pretty false`: exit 0 after the final code change.
- `npx eslint scripts/live-day-evaluation-harness.ts scripts/live-day-evaluation-harness.test.ts scripts/live-day-evaluation.test.tsx scripts/live-action-authority.test.tsx scripts/summarize-live-day-evaluation.cjs scripts/summarize-live-day-evaluation.test.ts`: exit 0 with 8 pre-existing/accepted `no-explicit-any` warnings in script/test code.
- `node --check scripts/summarize-live-day-evaluation.cjs`: exit 0.
- `git diff --check`: exit 0; Git reported only expected LF-to-CRLF worktree notices.
- No full suite, production build, live API call, credential write, deploy, or push was performed. Root independently reported source `a47cbe8` at 121 files / 1208 tests passed / 4 paid tests skipped, plus forced TypeScript, full lint, and production build passing.

## Changed files

- `scripts/live-action-authority.test.tsx`
- `scripts/live-day-evaluation-harness.ts`
- `scripts/live-day-evaluation-harness.test.ts`
- `scripts/live-day-evaluation.test.tsx`
- `scripts/summarize-live-day-evaluation.test.ts`
- `.superpowers/sdd/2026-09-14-day-action-authority/task-8-fix1-report.md`

The copied untracked gateway preflight remains excluded.
