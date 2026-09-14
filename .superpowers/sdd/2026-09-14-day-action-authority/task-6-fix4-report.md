# Task 6 fix round 4 report

## Scoped outcome

Addressed the remaining P1 in `task-6-fix3-review.md` against fresh HEAD `cff5e2740bdeb573794cc9bfff8003c7326914cc`. The initial worktree was clean. Changes are unstaged and frozen for root review and commit.

The previous completion-word branch bypassed the narration predicate check: `赵刚已经拒绝交出值班表。` was accepted as fulfillment because `已经` independently established completion. Explicit actor speech had the same bypass, including the direct-performance branch accepting a sentence explaining a refusal.

The existing predicate helper now handles narration and explicit actor speech (`我`, `本人`, or the actor alias). Every fulfillment branch must pass this shared actor/action predicate check. Completion markers remain supporting evidence; they cannot independently authorize an action merely mentioned under refusal or another predicate.

## Modified paths

- `src/memory/character-continuity.ts`
- `src/memory/character-continuity.test.ts`
- This local report.

No public API or prompt changes. Hearing, clock parsing, belief, privacy, and budget logic were not modified. The existing conservative leading-predicate matching remains; this is not a general natural-language parser.

## RED evidence

Command: `npx vitest run src/memory/character-continuity.test.ts --maxWorkers=1`

Result before implementation: exit 1, 7 failed / 33 passed. All seven failures were `expected true to be false` on real validator results:

- Narration: `赵刚已经拒绝交出值班表。`, `赵刚拒绝交出值班表了。`, `赵刚刚刚拒绝交出值班表。`
- Actor speech: `我已经拒绝交出值班表。`, `我拒绝交出值班表了。`, `我已经拒绝把值班表交给你了。`
- Direct actor speech: `我把拒绝交出值班表的原因说清楚。`

Six added positive controls passed before and after the fix: actual narration with and without `已经`; explicit actor speech with `已经` or trailing `了`; actual `把值班表交给你` speech with and without completion markers. Tests assert both approval and the presence/absence of fulfillment operations.

## GREEN and static verification

After the implementation, against the unchanged code snapshot:

- `npx vitest run src/memory/character-continuity.test.ts src/agents/mystery/narrative-review.test.ts --maxWorkers=1`: exit 0, 2 files, 83/83 tests passed.
- `npx tsc -b --force --pretty false`: exit 0.
- `npx eslint src/memory/character-continuity.ts src/memory/character-continuity.test.ts`: exit 0.
- `git diff --check`: exit 0; only LF-to-CRLF notices.

HEAD remained `cff5e2740bdeb573794cc9bfff8003c7326914cc`; only the two owned TypeScript files appeared in tracked status. No full suite, production build, live call, subagents, staging, or commit was performed.
