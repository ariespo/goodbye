# Item detail interaction repair

## Reproduced cause

Opening a scene item from the investigation shelf or a linked action thumbnail rendered ItemViewer inside the scaled HUD. Its close button inherited `pointer-events: none`; browser hit testing selected the investigation shelf behind the visible button. On narrow screens the investigation parent moved outside the HUD while ItemViewer remained below it.

## Change

- Render item details in a viewport portal using the shared pixel modal. Keep a 44 px close button outside the scrollable content, with safe-area padding and bounded height.
- Suspend investigation interaction and Escape handling while details are open. Closing the details keeps the investigation list and gameplay state intact.
- Restore focus on direct modal unmount. If a responsive relocation replaced the original trigger, resume focus within the parent; do not take focus from an open child.
- Keep required-decision dialogs' Tab handling active and ignore Tab events owned by nested dialogs.

## Verification

- Regression was observed before repair: real close click timed out and computed pointer events were `none`.
- Desktop: shelf and action-thumbnail entry points, X, Escape, backdrop, Tab containment, return to trigger, repeated open/close, and 1600 → 390 px relocation while open.
- Chromium touch emulation: 390×844, 320×568, 844×390. Close button and frame remain in bounds; content taps preserve the dialog; close leaves the parent open and game status/history unchanged. At 320 px content scrolls while the header remains reachable.
- Independent audit: character, settings, map, save windows close correctly at 390×844 and 1600×900; clue deletion confirmation closes only itself and restores focus at 320, 390 and 1600 px.
- Full suite: 1,737 passed, 7 existing opt-in cases skipped. Focus-lifecycle cleanup then rechecked with 33 passing focused regressions. Browser screenshots inspected at 320 px and landscape width.
- Production build and lint passed, with no lint warnings.

Touch checks use browser emulation, not physical iOS/Android devices. No live model calls were needed for these UI paths.
