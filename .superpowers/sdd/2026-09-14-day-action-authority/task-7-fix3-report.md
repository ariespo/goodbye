# Task 7 fix round 3 report

Status: the two findings in `task-7-fix2-review.md` are fixed in the isolated `F:/farewell-action-ui` worktree. The change is limited to local resume ref cleanup and the existing HUD's phone layout.

## Fixed behavior

- A settled local map operation now clears its ref when it is still the same operation, even after chat/session ownership is lost. Shared notifications, parsed state, and waiting controls remain guarded by current ownership.
- Returning to the original save after switching away can start its continuation again after either resolution or rejection of the old save.
- `HudViewport` opts into native viewport coordinates at widths up to 800px. At 390×844 it now renders a 390×844 canvas at scale 1 instead of shrinking the 1672×941 desktop canvas to 0.233 scale.
- The shared layout helper keeps its fixed-canvas default for the title screen and other callers. At 1280×720 the game HUD retains the existing 1672×941 desktop transform and centering calculation.
- The existing phone status, dialogue, choices, shortcut strip, and free-action panel receive a final narrow-screen sizing layer. Touch controls are at least 44px high, dialogue and action labels use readable native font sizes, and the existing map/action/clue responsive rules remain in place.

## Regression and verification evidence

The initial focused run reproduced both findings: the 390×844 layout returned scale 0.233 and the fixed 1672×941 canvas, while both old-save settlement paths left the local operation ref blocking a second dispatch after returning to the original chat. The 1280×720 desktop invariant already passed.

Focused verification after the fix:

```text
npx vitest run src/components/game/HudViewport.test.ts \
  src/hooks/useGameLoop.action-resolution.test.tsx \
  -t "native viewport coordinates|fixed reference canvas|measured desktop transform unchanged|releases a stale local-map operation|does not let a stale local-map save|resumes a reloaded map-origin continuation" \
  --maxWorkers=1

Test Files  2 passed (2)
Tests       8 passed | 25 skipped (33)
```

```text
PostCSS parse of src/styles/globals.css
exit 0

npx tsc -b --force
exit 0

npx eslint <5 changed TypeScript/TSX files>
exit 0

git diff --check
exit 0 (checkout line-ending warnings only)
```

Root's pre-freeze 390×844 browser check measured the updated `观察` shortcut at 58.33×48px with 14px text and `快进` at 91.33×44px with 14px text; the prior shortcut measured 17.7×11.2px with approximately 3.7px text. The native phone dialogue and six shortcut buttons fit and were readable. Root also checked 1280×720 after setting the viewport explicitly: the complete desktop status bar, dialogue, and controls retained their existing positions and remained legible. Root owns the final frozen browser recheck.

No full-suite, build, or live-model claim is made.
