# Scene craft and adaptive repair implementation plan

**Goal:** Improve positive scene guidance and preserve accepted prose while avoiding model calls with no useful task.

**Approved design:** The user accepted the proposed sequence: concrete scene goals/examples, on-demand style and State, then localized narrative repair. This extends existing stages; no additional always-on agent or new factual authority.

**Architecture:** Director and Writer share bounded creative intent and program-selected illustrative examples. Deterministic gates remain mandatory; standard mode selectively invokes style and State using actual candidate evidence. Repair selects exact text spans, applies bounded replacements, and sends the complete merged candidate through the existing acceptance path.

**Stack:** TypeScript, React, Vitest, existing structured completion adapter.

## Constraints

- Writer receives authorized facts only. Creative guidance/examples never authorize past events, motives, evidence, NPC knowledge, routes, or resource/state updates.
- Retain fact/continuity/action validation, protocol checks, single deterministic settlement, loop and route gates.
- Old plans and cached turns remain readable; strict mode retains full checks.
- Missing evidence or ambiguous patch targeting falls back conservatively.
- No new model call for classifying the need for another model call.
- Keep retries bounded, aborts propagated, and every request charged to existing telemetry.

## Tasks and verification

- [x] Read current contracts, runtime and tests; baseline 1684 passed, 6 opt-in skipped.
- [x] Scene craft: add `scene-craft.ts`, bounded optional plan selection, runtime/schema validation and contextual examples. Extend Director/Writer prompts, packet projection and partial-action projection. Test absent legacy field, invalid references, context selection, and withholding unreached goals after interrupted execution. No freeform hidden facts become a new source.
- [x] Adaptive checks: add a pure decision module; keep deterministic repetition checks and strict mode behavior. In standard mode use semantic style checks for borderline repetition or important scenes. Decide State only after actual accepted candidate/evidence; skip only program-owned fixed actions without narrative state effects. Test skip/request branches and unchanged settlement. Every repaired candidate gets fresh fact/continuity/action validation.
- [x] Local repair: implement `buildLocalizedNarrativeRepair` and `applyLocalizedNarrativeRepair` in a separate module. Program owns offsets and opaque target IDs; model returns only replacements. Preserve raw bytes outside targets. No tag, command, speaker, emotion, item or knowledge-event edits. Unknown, duplicate, overlapping, oversized or stale targets fail closed. Unlocalizable/multi-field dependency problems use existing full-scene fallback. Test raw CRLF preservation, repeated quote ambiguity, question/answer dependencies, injection, correction bounds, fallback and cancellation.
- [x] Integration verification: focused regressions, full tests, lint, build; independent review of fact permissions, false skips, stale audits and patch boundaries. Where the configured endpoint responds, run a small live smoke test without claiming literary quality from mock tests.
- [x] Document measured results and remaining subjective evaluation work; prepare the verified release for the existing authorized Cloudflare flow. Published commit and deployment are reported in the delivery message.

## Ownership

Scene worker owns scene-craft, plan schema/types, Director/Writer prompt sections, review packet construction and execution projection. Adaptive worker owns style-review, adaptive policy and useGameLoop integration. Root owns localized narrative repair and final integration. Read-only reviewer checks the final combined changes. Shared changes must be preserved.

## Progress

2026-09-18: User-approved scope and baseline verified. Independent scene/adaptive implementation and repair exploration dispatched. No design requiring new user input remains.

2026-09-18 completion checks: 1734 tests passed, 7 opt-in tests skipped; build and lint passed. Independent combined review approved after three bounded-patch fixes. Real-provider guided writing and localized patch each succeeded; initial patch rate limit and retries are retained in public evidence. No full-playthrough or literary-quality claim.
