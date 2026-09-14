# Task 6 core implementation report

Branch: `feature/character-continuity-core`

Base: `d28e072ea7e187b823de4eec81670a026b8b1cd0`

## Implemented core contract

- Added the pure character-continuity audit, accepted-candidate evidence, validation, disclosure, belief, commitment, reset, and boundary APIs in `src/memory/character-continuity.ts`.
- The live audit envelope requires `reviewed: true` and all three arrays. Supporting audience, reaction, and commitment evidence uses exact `lineIndex + quote` spans; only proposition assertions require `assertionIndex`.
- `canonicalCharacterContinuityMaintext` and `candidateFingerprint` bind effects to the accepted playable maintext whether the caller has a full tagged response or parsed maintext.
- `buildCharacterContinuityCandidateEvidence` accepts the optional program-owned `canonicalPropositionBySourceId` map. It keeps only entries for existing assertion sources whose values use the private `fact:*` namespace. A continuity effect uses a binding only when the accepted assertion cites that exact source; missing, invalid, unknown, or uncited bindings fall back to candidate-scoped opaque claims.
- Exact line and speaker checks prevent cast-union audience grants, earlier-segment listener reuse for repeated text, visual mentions being treated as hearing, unsupported belief reactions, and player claims becoming confirmed truth.
- Commitments require rendered acceptance by the obligated actor, a registered location, and a same-day due time strictly after the resolved end. Fulfillment requires performed-action evidence; cancellation requires explicit actor cancellation. Reaching the clock/location does not fulfill.
- `buildTurnCommit` adds `continuityEffects` and `encounteredCommitmentBoundaryId`, rechecks the fingerprint before any ledger work, assigns stable turn-derived IDs/root event sources, deduplicates retries, acknowledges a due boundary once, and expires a still-active promise only after its due time.
- World-memory v2 remains version 2. Missing ledgers normalize to empty arrays. Player cognition becomes durable; NPC imported learning becomes current-save-cycle day cognition; exact authored identity/background baselines are rebuilt rather than trusting stored provenance.
- Writer context receives rendered disclosure and active commitment projections without raw ledger IDs, canonical proposition IDs, or undercover private identity/background cognition. Director context retains private continuity links.
- Cycle settlement preserves events, episodes, player cognition, facts, suspicion, soft canon, and disclosure/history records; removes NPC day cognition and public undercover-name permission; expires active old-day commitments with `reset`; clears boundary acknowledgements and action/opportunity continuation state through default reconstruction.

## Integration API notes

- Import the audit and effect types from `src/memory/character-continuity.ts`; do not duplicate them in shared mystery types.
- Pass final accepted assertion sources, scene lines, resolved end time, possible audience maximum, and the private source-to-canonical proposition map to `buildCharacterContinuityCandidateEvidence`.
- Pass only `validation.effects` to `buildTurnCommit`, with the same accepted narrative used to build evidence. Pass a commitment boundary ID only on the accepted turn that rendered that boundary.
- Commitment boundary IDs are `commitment-boundary:${commitment.id}`.
- The old `introducedPlayerNameToNpcIds` option remains type-compatible but is deliberately non-authoritative. Only validated rendered self-introduction plus listener evidence creates a current-cycle name-expression permission.

## Verification

- Focused core suites: 53 passed.
- Full suite: 112 files passed, 2 skipped; 1052 tests passed, 3 skipped.
- `npm run lint`: exit 0.
- `npx tsc -b --force --pretty false`: exit 0. The forced build avoids the shared worktrees' incremental cache.
