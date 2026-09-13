# Task 2 fix round 1: authorized history and complete assertion coverage

## Changes

- Aligned the deterministic narrative sentinel with the source projection used by live review. A limited paraphrase of the fixed supermarket history now reaches semantic review, and an approved soft-history proposal reaches it only after its exact `evidenceText` appears in clean playable `maintext`.
- Kept absent, mismatched, option-only and nested observation evidence unable to activate a soft-history proposal. Unrelated time and delivery claims remain unsupported.
- Strengthened `validateAssertionAudit` so the union of exact `assertion.quote` spans must cover every visible non-punctuation character in each material field. This catches omitted later lines and omitted sentences on the same line. Dialogue protocol prefixes and control-only scene/music/camera/effect/animation/knowledge lines are excluded; a real item directive is excluded using the same item registry as the scene parser, while an unknown pipe suffix remains auditable visible text.
- Updated the critic prompt to enumerate every visible sentence, including ordinary present action.
- Added `WriterPacket.authorizedBackgroundSpeakers?: Array<{ factId: string; speakerIds: string[] }>` and populated it from authorized fact IDs plus expressible fixed and selected NPC background cognition. Background fact subjects are no longer treated as speakers. This permits Touko's authorized family-relationship knowledge while preventing `player`/`fumi` subject membership from becoming speaker authority.
- Added the cross-task optional interface `WriterPacket.resolvedAction?: ResolvedActionOutcome` at root's request. Task 4 owns its population and behavior.

## TDD evidence

RED before implementation:

```text
npx vitest run src/agents/mystery/narrative-review.test.ts -t "fixed supermarket|approved soft-history"
2 failed: both authorized history cases were rejected as ungrounded-past-claim

npx vitest run src/agents/mystery/fact-assertion-review.test.ts -t "omits material prose"
2 failed: separate-line and same-line omissions were approved

npx vitest run src/agents/mystery/fact-assertion-review.test.ts -t "projected NPC cognition"
1 failed: background source speakers were ['player', 'fumi'] instead of ['touko']
```

Fresh GREEN verification:

```text
npx vitest run src/agents/mystery/fact-assertion-review.test.ts src/agents/mystery/narrative-review.test.ts src/agents/mystery/narrative-repair.test.ts src/agents/mystery/mystery.test.ts src/agents/mystery/orchestrator.test.ts src/agents/mystery/turn-preparation.test.ts src/agents/mystery/scene-contract-review.test.ts
7 files passed, 157 tests passed

npx eslint src/agents/mystery/fact-assertion-review.ts src/agents/mystery/fact-assertion-review.test.ts src/agents/mystery/narrative-review.ts src/agents/mystery/narrative-review.test.ts src/agents/mystery/prompts.ts src/agents/mystery/review.ts src/agents/mystery/types.ts
passed

npx tsc -b --pretty false
passed
```

## Boundary

Span coverage proves that the critic supplied an audit entry for all visible prose. It does not prove that a cited source semantically entails the proposition; the live critic still owns that judgment.
