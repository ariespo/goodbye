# Task 5 fix round 1 report

## Scope

Resolved the three P1 findings from `task-5-review.md`. No files were staged or committed, and no live model or network calls were made.

## 1. Destination-bound opportunity preparation

The selected opportunity is now looked up and fully revalidated against the pre-action truth context before any destination, scene contract, NPC cast, or fact brief is prepared. Its exact program-owned `locationId` is passed to the narrative-context resolver. The visible label remains presentation text and is not parsed for authority.

This fixes the home-to-school F002 path:

- selection: `investigation:c1:F002:atmosphere:school`
- trusted public goal: `向门卫确认文穗今天是否到校`
- prepared truth and scene contract: `school`, with `school-guard`
- actual resolved work: one 10-minute home-to-school travel segment followed by one 55-minute investigation segment
- committed end: `2024-09-09T09:05:00`, location `school`, F002 atmosphere awarded once

An interrupted selection beginning at 15:30 reaches school at 15:40, performs 20 minutes of work before the 16:00 boundary, persists the original private selected snapshot, survives chat reconstruction and hook remount, then finishes the remaining 35 minutes at 16:35. The resumed Director may omit the original revelation; the pending authorization and selected opportunity identity still restore it from program state.

TDD RED: the preparation test received `truthContext.currentLocation=home` and no scene contract for the valid F002 menu selection. After the fix, the preparation/narrative-context pair passed 47/47 tests.

## 2. Authoritative empty menus

An explicit empty menu now differs from missing legacy data through every relevant boundary:

- `mergeParsedIntoScene` uses property presence rather than array length, so `[]` clears stale rows while `undefined` retains legacy fallback behavior.
- the streaming parser no longer initializes absent investigate/action tags as empty arrays;
- program serialization can emit explicit empty `<investigate>` and `<action>` blocks;
- the foreground hook always uses that authoritative serialization mode;
- `rebuildSceneFromChat` recognizes explicit empty menu blocks as reconstructable interaction state;
- async observation enrichment preserves the foreground program menus and cannot resurrect previous or Writer-authored rows.

The hook regression begins with a populated previous investigation list and a Writer response containing forged investigation/action rows. With no legal investigation candidates, the committed scene, persisted message, enriched scene, and reconstructed scene all retain an empty investigation array. Opening that empty panel is local, keeps the same clock value, and makes no additional Writer generation call.

TDD REDs:

- `mergeParsedIntoScene` returned the previous action row for an explicit `actionItems: []`;
- empty authoritative serialization returned an empty string;
- a stream containing no checklist tags started with fabricated empty arrays.

All parser, serializer, checklist, persistence, and hook cases pass after the fix.

## 3. Route opportunity catalog coverage

The authored catalog now includes safe public action goals for every gated A/B/C/NONE/FAKE milestone in the canonical truth graph. Candidate generation still goes through the unchanged `buildMysteryBrief` gates and the existing public `canTravel` projection. No canonical fact, reveal level, route requirement, suspicion threshold, affinity threshold, or destination visibility rule was changed.

Representative public output after the corresponding real gate passes:

```text
NONE day 2 / home: 仔细检查卧室抽屉和夹层
A / old-man-building: 询问周大爷是否保留过往来人员的旧资料
B / water-tower: 检查水塔基座和铁件缝隙的可见痕迹
C / home: 核对家中的通话和时间记录
FAKE / community-hospital: 核对医院遗体记录与文穗既往病历
```

These goals name actions, public people, or searchable areas. They do not state the hidden result, culprit, secret role, motive, route answer, or an unearned hidden object. Later milestones remain unavailable until their real prerequisite clues, suspicion/affinity, cycle, trip progress, route lock, and public travel gates allow them.

TDD RED: 19 cases failed initially—the day-two bedroom opportunity and 18 representative gated milestones across A/B/C/NONE/FAKE were absent. After adding authored affordances, `investigation-opportunities.test.ts` passes 32/32. Its existing tests also confirm reveal-level upgrades, same-cycle exact lookup, exhausted-topic demotion without removal, public projection privacy, travel visibility, and affordable/pre-boundary default ranking.

## Verification

Fresh focused suite:

```text
npx vitest run src/engine/investigation-opportunities.test.ts src/engine/action-narrative-context.test.ts src/agents/mystery/turn-preparation.execution.test.ts src/agents/mystery/action-authority.test.ts src/engine/scene-parser.test.ts src/sillytavern/stream-parser.test.ts src/engine/opportunity-integration.test.ts src/agents/mystery/scene-list.test.ts src/hooks/useGameLoop.action-resolution.test.tsx src/hooks/useGameLoop.checklist-review.test.tsx --maxWorkers=4
Test Files  10 passed (10)
Tests       192 passed (192)
```

The expected cancellation fixture logs its handled `DOMException`, and jsdom prints the repository's existing `--localstorage-file` warning. Neither affects the passing result.

Fresh type build:

```text
npx tsc -b --pretty false
exit 0
```

Scoped ESLint over all 16 changed production/test files exited 0. The restored Director guidance that states the 25/55/105-minute work baselines remains present in `prompts.ts`.

## Changed files

- `src/agents/mystery/scene-list.ts`
- `src/agents/mystery/turn-preparation.execution.test.ts`
- `src/agents/mystery/turn-preparation.ts`
- `src/engine/action-narrative-context.ts`
- `src/engine/action-scene-continuity.ts`
- `src/engine/investigation-opportunities.test.ts`
- `src/engine/investigation-opportunities.ts`
- `src/engine/opportunity-integration.test.ts`
- `src/engine/scene-parser.test.ts`
- `src/engine/scene-parser.ts`
- `src/hooks/useGameLoop.action-resolution.test.tsx`
- `src/hooks/useGameLoop.checklist-review.test.tsx`
- `src/hooks/useGameLoop.ts`
- `src/sillytavern/stream-parser.test.ts`
- `src/sillytavern/stream-parser.ts`
- `src/utils/sceneFromChat.ts`

## Root combined verification on frozen fix

Fullrepository Vitest:111passedfiles/2explicitlivefiles skipped;1049passedtests/3live tests skipped,115.32s,exit0. Logtask5-fix1-full-suite.log. Existing day-contract mocks also log handled asynchronous checklist critic parse failures; deterministic menus remain and tests pass. These are fixture-path warnings, not a real-model acceptance result. Production npm run build exit0,Vite13.26s withplugin timingadvisory. Buildlogtask5-fix1-build.log. No full-day paidgameacceptance claimed.
