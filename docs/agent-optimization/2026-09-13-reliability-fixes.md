# Agent reliability fixes

Follow-up to `2026-09-13-system-audit.md`. Defaults remain 100,000 context tokens and 40,000 maximum output tokens per call.

## Implemented

- **Equivalent preparation:** foreground and speculative turns use `turn-preparation.ts` to resolve intention, action scene constraints, character knowledge, memory, scheduled instructions, and review policy inputs. Cache keys compare the complete request and primary Writer API configuration in memory. Retry cannot reuse an incompatible rejected draft. Predicted presentation uses the final scene background; changed history or actual presentation still conservatively invalidates the preplan.
- **Cancellation and ownership:** adopted preplans retain a cancellable owner and link to the foreground signal. Invalidation rejects even if an injected preplan runner ignores cancellation. Successful async completions check turn ownership before recovery/UI/state mutation. State cancellation cannot become a fixed-cost fallback. Chat writes use a guarded IndexedDB transaction and keep the abort listener attached through completion. Pending action costs are consumed only after successful commit.
- **Context enforcement:** optional messages/memory records are selected within the remaining budget; message snapshots that are not transmitted are not charged as prompt content. Final serialized streaming and secondary requests, including structured-output schema and output reservation, are checked before HTTP/retry. Mandatory authority text is not silently truncated; an impossible request reports a nonretryable budget error.
- **State evidence:** State receives only writable current state, intention separately, and program-issued evidence IDs. Positive suspicion requires a quote in the rendered narrative and a new authorized fact for the correct actor. New hints and atmosphere-to-hint progress remain eligible; atmosphere alone and already-known hint/clue/confirmation facts cannot receive repeated credit. Standard mode runs State when new evidence needs settlement even if the original plan policy skipped it. Deterministic pivot rules and daily clamps remain.
- **Complete-turn metrics:** the orchestration panel now separates preparation diagnostics from full foreground turns. Full-turn records include wall duration, first token, playable time, per-stage durations, and success/failure/cancellation. Parallel stages are not summed to obtain wall time. A bounded local history persists without raw inputs, model responses, keys, or request fingerprints.

## Verification and limits

Regression coverage includes adopted-preplan cancellation, request fingerprint changes, oversize HTTP rejection before fetch, long-history selection, authorized hint progression and duplicate evidence, State cancellation/session switching in the real hook, single successful commit, and complete timing/persistence fallback.

The final full current-workspace run passed 666 tests with one pre-existing failure in `src/ui/penpotPcUiAssets.test.ts:137` (93 test files passed, one failed; nested worktrees excluded). All 35 focused lifecycle/preparation/State tests passed. Production build and lint passed. After adding the required delivery field to a new test fixture, the four hook integration tests and production build were rerun successfully. `git diff --check` passed.

Token counts are conservative local estimates, not an exact tokenizer for every configurable provider; provider-side limits still apply. Evidence matching deliberately prefers rejection over awarding unsupported suspicion and can reject paraphrases without a sufficiently long shared quote. The persisted metrics measure actual local foreground turns; no live-model latency or cost benchmark was run during this repair.

The original three throwaway characterization probes in `.codex-test-tmp/agent-audit-probes.test.ts` were replaced by maintained regressions under `src/`; the audit remains a historical baseline.
