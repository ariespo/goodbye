# Task 7 fix4 report

Base checked before editing: `05068f164f64a13e4d2db2cab6374b98a581ded1` in `F:/farewell-action-ui`. Read `AGENTS.md` and `task-7-fix3-review.md`; existing untracked review/preparation artifacts were preserved. Sole implementer; no delegation, staging, commits, full suite, build, or live calls.

## Change

- `MapModal.tsx`, `ActionPanel.tsx`, and `ClueModal.tsx`: extend existing portal media queries from 700px to the native HUD's inclusive 800px boundary. Existing subscriptions and portal-target lifecycle remain unchanged.
- `globals.css`: align the three corresponding responsive CSS bridges to 800px. Define existing safe-area inset variables throughout that native range, because the observation bridge used them without fallbacks and they were previously only defined at 700px or below.
- Free action inspected: it intentionally remains inside the HUD, whose native canvas is viewport-sized at scale 1. Its existing 800px block already supplies fluid panel width and native controls, so no FreeActionDialog production change was needed.
- `NativeHudOverlays.test.tsx`: integration checks evaluate the production media-query string against viewport width, mount real HudViewport and overlays, and verify canvas dimensions, scale, single-dialog ancestry, and boundary transitions. Coverage: 390, 700, 701, 750, 800, 801, 1280px; resizing preserves selected map destination, clue selection, and typed free action.
- `MapModal.test.tsx`: remove the obsolete 700px CSS-string assertion, superseded by behavioral boundary coverage. Existing desktop geometry assertions remain.

## Evidence

RED, before production edits:

`npx vitest run src/components/game/NativeHudOverlays.test.tsx --maxWorkers=1`

Exit 1: 4 failed / 4 passed. The 701, 750, and 800px tests found the dialog still under the native HUD instead of the game canvas. The resize test reproduced the same mismatch at 800px. (An initial test-helper event issue was corrected before this recorded RED run.)

GREEN, after all production and test edits:

`npx vitest run src/components/game/NativeHudOverlays.test.tsx src/components/game/MapModal.test.tsx src/components/game/ActionPanel.test.tsx src/components/game/ClueModal.test.tsx src/components/game/FreeActionDialog.test.tsx src/components/game/HudViewport.test.ts --maxWorkers=1`

Exit 0: 6 files, 52 tests passed, including all 8 new boundary/transition tests.

- `npx tsc -b --force --pretty false`: exit 0.
- `npx eslint src/components/game/MapModal.tsx src/components/game/ActionPanel.tsx src/components/game/ClueModal.tsx src/components/game/NativeHudOverlays.test.tsx src/components/game/MapModal.test.tsx`: exit 0.
- PostCSS parsed the full stylesheet successfully; inspection of the three matching bridge media parents reports `(max-width: 800px)` for each.
- `git diff --check`: exit 0. Final diff reviewed; unrelated files preserved.

The integration tests establish portal and coordinate-system behavior, not browser pixel geometry. Root owns actual browser verification of map/observe/clues at 750px and regression checks at 390/1280px. Work is left unstaged and frozen for root commit and the same reviewer.
