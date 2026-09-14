# Task 6 fix round 3 report

## Outcome

Both P1 findings in `task-6-fix2-review.md` are addressed. The round 2 hearing and complete-clock fixes remain unchanged. The worktree is frozen unstaged for root verification and commit.

## Fixes

1. **Narrated fulfillment requires the actor's enacted action predicate.** Narration must begin with the committed actor and, after a limited completed-aspect prefix such as `已经`, its leading normalized predicate must match the stored action. Merely mentioning the action under an intervening predicate no longer counts. `赵刚拒绝交出值班表` and `赵刚正要交出值班表` fail, while `赵刚交出值班表` and `赵刚已经交出值班表` pass. Existing explicit completed actor speech remains valid.
2. **Belief polarity is evaluated per cited and proposition-bound clause.** The validator classifies each stance clause as positive, negative, or absent before checking assertion overlap. `不合理` cannot satisfy the positive `合理` stance, and `没有道理` is likewise negative. `我认为文穗买过牛奶的说法很合理`, the existing explicit belief, and `这很合理，我信了` remain valid.
3. **The live audit prompt mirrors the validator.** It explicitly identifies `不合理`/`没有道理` as opposition and says that narration describing refusal or imminent performance does not prove fulfillment.

## API and preserved behavior

No public type or function signature changed. The round 2 exchange-bound hearing and whole-clock parsing code was not modified.

## Modified paths

- `src/agents/mystery/narrative-review.test.ts`
- `src/agents/mystery/prompts.ts`
- `src/memory/character-continuity.test.ts`
- `src/memory/character-continuity.ts`

## TDD evidence

Before implementation, the focused suite reproduced both reviewer failures:

- `我认为文穗买过牛奶的说法很不合理` approved an affirmative belief effect;
- `赵刚拒绝交出值班表` approved fulfillment. The adjacent `赵刚正要交出值班表` probe exercises the same predicate-binding flaw.

Negative near variants cover `没有道理`; positive controls cover `很合理`, direct actual narration with and without completed aspect, existing explicit belief, and referential short belief.

## Verification

- `npx vitest run src/memory/character-continuity.test.ts src/agents/mystery/narrative-review.test.ts --maxWorkers=1`: 2 files, 70/70 tests passed.
- `npx tsc -b --force --pretty false`: exit 0.
- Scoped ESLint over all four modified TypeScript files: exit 0.
- `git diff --check`: exit 0 with only LF-to-CRLF conversion notices.

No full suite, production build, live call, staging, or commit was performed, per the bounded fix-round instruction.
