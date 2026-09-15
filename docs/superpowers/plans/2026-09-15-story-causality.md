# Story causality implementation plan

> **For agentic workers:** Use subagent-driven-development for the independent file groups below. Do not revert other workers' edits.

**Goal:** Make mutually exclusive routes preserve established observations, require complete inference chains, and give the first three repeated days different playable scenes.

**Architecture:** Keep the existing fact gate and single commit authority. Version-compatible observations precede route selection; exclusive physical conclusions follow selection. A shared rule module and deterministic conclusion gates bind the final result; authored loop scenes use the existing player and persistence path.

**Tech Stack:** TypeScript, React, Zustand, Vitest, existing story protocol.

**Spec:** ../specs/2026-09-15-story-causality-design.md

## Global constraints

- Reset at08:00; cycleCount3 is not three completed loops. Route selection begins at cycleCount4; final solutions and normal endings require cycleCount>=5 and the complete evidence chain.
- Suspicion is an investigation focus, not proof. Preserve daily+15 policy; do not make evidence existence depend on it.
- No Writer state authority, added repair loops, or new runtime dependencies.
- Preserve unrelated artwork and existing save identifiers wherever possible.

## Task 1: Facts and inference prerequisites

- [x] Add failing tests for common evidence compatibility, missing causal prerequisites, suspicion-independent access, and six-step itinerary progress.
- [x] Change truth-graph.ts and brief.ts; add supporting fact nodes and knowledge-progression rules. Keep C death facts consistent with PSYCH and avoid preselection exclusive conclusions.
- [x] Run relevant Vitest files. Export fact requirement identifiers for root integration, and report intentional fixture changes.

## Task 2: Program conclusion and world rules

- [x] Add failing tests proving preparation-only FAKE/NONE claims and isolated confirmations cannot end a route; valid complete chains remain playable.
- [x] Share route requirements between conclusion-system and final ending checks, tighten overlays, and pass observation-versus-conclusion rules to generation and review.
- [x] Align C/P/F/X ending choices, bridge text and static outcomes with the agreed facts; document the current authority above old design notes.

## Task 3: Playable first-three-day scenes

- [x] Add failing tests for distinct scene content, actual-knowledge-only day4 recap, early reset safety, once-only playback and the standard/legacy shared entry.
- [x] Replace hard death confirmation in event instructions, authority and delivery checks with attributed preliminary notification.
- [x] Implement authored key scenes using existing transition/player/persistence infrastructure and expose subsequent actionable investigation directions without inventing rewards.
- [x] Run focused tests and report exact integration points and remaining generated portions.

## Task 4: Review and release

- [x] Independent causal/compatibility review, fix demonstrated issues and rerun affected tests.
- [x] Run npm test -- --run, npm run lint, npm run build; inspect all results.
- [x] Commit explicit files, fast-forward master, push and deploy with existing Vercel configuration.
- [x] Verify production output matches the build, report evidence and scope of testing (CSS build differences and equivalent JS references recorded in the retest report).
