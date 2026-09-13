# Day Action Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enforce sourced facts and registered locations, unified scarce action time/resources, meaningful opportunities, and correct character memory across repeated days.

**Architecture:** Extend the existing authority pipeline; one ordered commit owns state. Astra supplies design and task review; bounded implementation is delegated to Luna.

**Tech Stack:** React, TypeScript, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-day-action-authority-design.md`

## Global Constraints

- Read AGENTS.md and the spec. Writer never receives canonical truth or owns state.
- Preserve cancellation/persistence atomicity, daily suspicion cap, and day 3→4 route gates.
- Explicit user approval covers continuous implementation. No new approval stall.
- This initial executable task was specified by Astra; downstream tasks are being expanded by Astra before their dispatch. This does not narrow the full three-phase goal.

### Task 1: Registered location ingress and playable escape validation

**Files:**
- Modify/test: `src/data/locations.ts`, `src/data/locations.test.ts`
- Modify/test: `src/sillytavern/vars-validator.ts`, `src/sillytavern/vars-validator.test.ts`
- Modify/test: `src/agents/state/state-agent.ts`, its existing tests
- Modify/test: `src/sillytavern/output-protocol.ts`, `src/sillytavern/output-protocol.test.ts`
- Modify/test: `src/engine/game-transaction.ts`, `src/engine/game-transaction.test.ts`

**Interfaces:** export `resolveRegisteredLocation(id: unknown, currentId: string): { locationId: string; sceneId?: 'street'; accepted: boolean }` from locations.ts. Named catalogue IDs are accepted. Literal `street` is a supported transient scene anchored to the current registered map location, not a new map coordinate. Unknown IDs including `police_station` are rejected, preserving the valid current anchor. Existing home fallback remains only a recovery for an already-invalid old-save anchor; invalid mutations must never teleport a valid anchor home. Later tasks reuse this resolver for Director/Writer and executed travel.

- [ ] Add failing tests for registered IDs, unknown/non-string IDs, valid current anchor preservation, and transient street. Example: `expect(resolveRegisteredLocation('police_station', 'school')).toEqual({ locationId: 'school', accepted: false })`; street yields school plus sceneId street and accepted true.
- [ ] Add failing tests at State validation, compatibility sanitizer, and transaction final ingress. Unknown proposed locations cannot replace current school; valid supermarket succeeds; street keeps current map anchor. Test real public APIs, not only the helper.
- [ ] Add failing protocol cases for a literal backslash-n/backslash-r inside ordinary dialogue, not only preceding instruction names. Use the existing real parsed/raw protocol path. Legitimate JSON escaping, Windows paths, and ordinary backslashes remain valid. Existing whole-scene repair and full revalidation remain in use; no global unescape or silent dialogue deletion.
- [ ] Run focused tests and record the intended failing assertions before production edits.
- [ ] Implement the shared resolver and use it at each named ingress without changing resource/time/fact behavior. Mark State unknown mutations invalid according to its established validation contract; compatibility sanitation drops or preserves the rejected mutation without creating a new location. Final transaction preserves the prior valid location regardless of caller sanitation.
- [ ] Extend protocol rejection narrowly for unrendered newline artifacts in playable dialogue while retaining existing errors and repair flow. Avoid treating JSON-level escaped transport strings as already-rendered artifacts.
- [ ] Re-run focused tests, relevant TypeScript/lint checks, review diff for unrelated edits. Do not change action costs, memory, fact review, or UI in this task.
- [ ] Commit only owned files and write report with red/green evidence, exact commands, file changes, and remaining concerns. Root owns integration and deployment.
