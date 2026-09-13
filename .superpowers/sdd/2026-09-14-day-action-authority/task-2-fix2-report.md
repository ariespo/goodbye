# Task 2 fix round 2: bind repeated quotes to every speaker occurrence

## Change

`validateAssertionAudit` now resolves every exact occurrence of an assertion quote and checks each overlapping dialogue line against the cited source's allowed speakers. An identical sentence spoken once by an allowed NPC and once by an unauthorized NPC can no longer inherit the first occurrence's permission. Repetition by the same allowed speaker and repetition by two independently allowed speakers remain valid.

## TDD evidence

RED before implementation:

```text
npx vitest run src/agents/mystery/fact-assertion-review.test.ts -t "every repeated occurrence"
1 failed: mixed allowed and unauthorized speakers approved because only the first matching line was checked
```

Fresh GREEN verification:

```text
npx vitest run src/agents/mystery/fact-assertion-review.test.ts src/agents/mystery/narrative-review.test.ts
2 files passed, 69 tests passed

npx eslint src/agents/mystery/fact-assertion-review.ts src/agents/mystery/fact-assertion-review.test.ts
passed
```

The final whole-tree `npx tsc -b --pretty false` run reached the concurrently edited `src/hooks/useGameLoop.action-resolution.test.tsx` and reported two external test-type diagnostics: its mode fixture still permits `legacy`, and `resumeActionId` is not yet in `SendMessageOptions`. Task 2 files produced no TypeScript diagnostics.
