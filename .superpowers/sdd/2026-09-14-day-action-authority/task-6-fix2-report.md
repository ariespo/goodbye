# Task 6 fix round 2 report

## Outcome

The three remaining P1 findings in `task-6-fix1-review.md` are addressed. The round 1 Writer privacy and context-budget fixes remain unchanged. The worktree is frozen unstaged for root verification and commit.

## Fixes

1. **Every audience-evidence branch now shares one exchange guard.** Evidence must be on the disclosure line, the immediately following line in the same rendered context, or part of a contiguous explicitly rendered phone/message bridge for that exchange. This guard runs before listener speech, narration, mention, direct-address, and channel-specific semantic checks. A later hospital direct address or a later new phone connection cannot retroactively prove hearing at school. Existing immediate replies and the explicit contiguous phone exchange remain valid.
2. **Commitment times are parsed as complete clock expressions.** The validator extracts and compares complete numeric or Chinese hour/minute values. `二十点` cannot satisfy 10:00, and 10:00 cannot satisfy a rendered 10:30. Validated forms include `10:30`, `10点30分`, `十点半`, and `十点三十分`.
3. **Fulfillment requires positive performed-action structure.** A proposal must bind the actor and stored action to accepted narration, a direct enacted `我把...` construction, or explicit completion evidence. Future, planned, conditional, hypothetical, negative, and arrival-only lines cannot fulfill. Exact negatives cover `我会交出值班表` and `我准备交出值班表`; accepted positives cover program-visible narration and `我已经把值班表交给你了`.
4. **Belief reactions bind the stance and proposition within the same clause.** Explicit belief/suspicion/inference must contain the accepted assertion in the same reaction clause. The immediate deictic fallback only accepts a reaction made entirely of referential/stance language, leaving no independent proposition. `我相信今天会下雨，这很合理` cannot bind the previous milk assertion, while `这很合理，我信了` and explicit milk belief remain valid.
5. **The live audit prompt matches the validator.** It now calls out complete time-expression matching and explains that future commitments or intentions are not completed performance.

## API and preserved behavior

No public types or function signatures changed in this round. The optional continuity-evidence `background` field from round 1 remains the same.

Round 1 Writer privacy projection, source-ID stripping, bounded disclosure selection, and mandatory active-commitment accounting were not modified.

## Modified paths

- `src/agents/mystery/narrative-review.test.ts`
- `src/agents/mystery/prompts.ts`
- `src/memory/character-continuity.test.ts`
- `src/memory/character-continuity.ts`

## TDD evidence

Before implementation, the exact reviewer probes failed:

- school milk disclosure -> hospital narration -> `林静，我想问件事` approved a Lin Jing listener effect;
- `我相信今天会下雨，这很合理` approved belief in the prior milk assertion;
- `好，我二十点在学校把值班表给你` approved a proposed 10:00 commitment.

Nearby tests also cover a later new phone connection, minute mismatches, future/planned fulfillment, complete numeric/Chinese clock variants, actual actor/narrator performance, immediate same-scene hearing, contiguous phone hearing, explicit proposition belief, and a genuinely referential short belief response.

## Verification

- `npx vitest run src/memory/character-continuity.test.ts src/agents/mystery/narrative-review.test.ts --maxWorkers=1`: 2 files, 70/70 tests passed.
- `npx tsc -b --force --pretty false`: exit 0.
- Scoped ESLint over all four modified TypeScript files: exit 0.
- `git diff --check`: exit 0 with only the repository's LF-to-CRLF conversion notices.

No full suite, production build, live call, staging, or commit was performed, per the bounded fix-round instruction.
