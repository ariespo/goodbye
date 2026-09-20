# Budget-aware memory, ending continuity and save transfer

**Goal:** Complete the user's three requested improvements and publish the verified result to the existing Cloudflare project.

**Architecture:** Keep compression as a reversible request projection with a 60,000-token preferred threshold; account for the actual serialized memory budget before discarding history. Audit all 17 authored endings against the accepted mutually exclusive route contract. Transfer versioned local save files through explicit export/import controls, with import creating a validated new save rather than replacing current progress.

**Spec:** The current user request plus `AGENTS.md`, `docs/agent-story-contract.md` and `docs/story-world-rules.md`. Existing permission to push/deploy continues. No new permission ceremony is required.

## Independent responsibilities

- Root: `src/memory/context-compression.ts`, `world-memory.ts`, `src/sillytavern/prompt-assembler.ts`, their tests and prompt-inspector compression reporting.
- Ending worker: all `public/assets/endings/*.txt`, ending metadata/player presentation/tests and an audit table in `docs/fixed-ending-audit.md`. Preserve ending IDs, ownership of route facts, and eligibility gates. Explain reality/recall/meta transitions in readable prose; a label alone cannot excuse contradictory route facts.
- Save worker: `src/utils/save-transfer.ts`, tests, `src/components/system/SaveModal.tsx`, dedicated styles/tests and any required isolated database helper. Export complete gameplay save data with explicit format/version, never API credentials or global provider settings. Imported IDs are new, existing saves/current game untouched until the user chooses to load.

## Task 1: Compress before budget eviction

- [x] Add regressions for history below 60,000 but larger than actual remaining serialized capacity; fixed prompts, active commitments and selected disclosures must retain priority.
- [x] Extend the shared projection with a capacity/fit input so it can replace old bodies until the request fits, using the same route filter and original archive. Keep latest two full where possible; if those alone block fit, compress eligible summaries as a fallback before eviction. Missing/longer summaries never fabricate or expand records.
- [x] Apply the policy before whole-record selection in real preparation and legacy assembly; inspector and real request must agree. Actual model hard limits remain mandatory.
- [x] Test boundaries, original immutability, saved preference unchanged, route isolation and actual Director/Writer serialization.

## Task 2: Audit all fixed endings

- [x] Read each fixed ending and the conditions/bridge that lead to it. Record ID, narrative layer, route responsibility, clock and character-presence checks.
- [x] Fix contradictions and introduce explicit natural transitions for memories/meta scenes. STAY/TRUE must not silently place a missing/dead character back into present-day reality or treat incompatible routes as one incident.
- [x] Cover all 17 endings with metadata/asset consistency tests and parser checks; preserve existing collection IDs and ending gates.

## Task 3: Export/import saves

- [x] Write versioned serializer/parser tests including real round-trip load data, unknown version, malformed shape, invalid dates, prototype keys, oversized input and duplicate import.
- [x] Add export/download and import/file selection in both title load and in-game management entry points. Import is a new saved copy; loading remains explicit. Show errors in existing notification UI and reset the file input for retry.
- [x] Preserve full chat, state, progress, summaries and ending collection needed to resume; leave provider/API credentials outside the archive.
- [x] Verify mobile wrapping, keyboard and touch interaction, closing and busy states; imported data remains a save until loaded.

## Integration and release

- [x] Review the independent diffs, targeted tests, full suite, lint and build.
- [x] Browser check budget projection, save download/upload round trip and 390px layout; verify ending layer presentation where applicable.
- [ ] Commit scoped files, fast-forward master, push, deploy Cloudflare and compare deployed assets with the verified build.

## Verification results

- Full suite: 162 files passed, 6 skipped; 1,872 tests passed, 7 skipped. No paid model calls; budget integration uses the real preparation/serialization path with deterministic model responses.
- Full lint and TypeScript build passed; production build passed.
- Independent review found and resolved final-envelope overflow, repeated unchanged budget scans, blocked ending dialogue, and a delayed-storage bridge race. Reviews confirmed both sets of fixes.
- Real browser checks: desktop download; cross-context mobile import, corrupt file rejection, repeated import with distinct IDs, explicit load with revived clocks/full scene/summary; 320px and 390px portrait plus landscape fit, keyboard focus cycle and close controls; actual title-page import-to-game flow.
- Browser checks: below-60,000 early compression is visible in inspection and originals remain intact; impossible fixed budgets show a closable explanation. N-2 manual, back, fast-forward, ending menu and soft-loop return; TRUE meta label and neutral backdrop; STAY mobile automatic playback, ending load menu and close.
- All 17 ending assets, labels, paragraph parsing and eligibility boundaries are covered by the audit and tests. Five contradictory legacy CGs remain archived but are no longer automatic ending backgrounds.