# Core Subinterface Visual Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the clue, map, and investigation/action interfaces with the existing monochrome low-resolution PC HUD without changing their game logic or background-loading behavior.

**Architecture:** Add presentation-only pixel modal primitives under `src/components/ui/`, extend the existing `PixelFrame` with an opaque double-rail modal variant, and compose the three existing business components from those primitives. Mount all first-batch overlays inside the existing 1672×941 `HudViewport` so one outer transform scales the complete HUD.

**Tech Stack:** React 19, TypeScript 5.8, Zustand, Tailwind utility classes plus `src/styles/globals.css`, Vitest 3, Testing Library, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-01-core-subinterface-visual-unification-design.md`

## Global Constraints

- PC only; do not add or revise mobile layouts in this plan.
- Preserve clue selection/deletion/inference, map travel settlement, investigation/action execution, and all store/data interfaces.
- Preserve background selection, time-of-day switching, and asset loading logic.
- Use the existing 1672×941 HUD design space and one outer scale; do not size the three overlays with `vw`.
- Use opaque `#050505` panels, `#f2f2f0` rails/text, grayscale dither, and `RenOuFangSong 16 / 人偶仿宋`.
- Use independent pixel-aligned SVG icons; do not add Unicode symbols as production icons.
- Use 180–220ms `steps(4, end)` open/close motion and honor `prefers-reduced-motion`.
- Preserve unrelated working-tree changes. Commit only files named by the current task.
- Do not push or deploy.

## File Structure

- `src/components/ui/PixelFrame.tsx`: existing frame rail renderer; gains the opaque double-rail `modal` variant.
- `src/components/ui/PixelModal.tsx`: new presentation-only shell, header, content, footer, action button, status tag, and list item primitives.
- `src/components/ui/PixelModal.test.tsx`: accessibility, close behavior, focus restoration, presence animation, and visual-state contract tests.
- `src/components/game/GameCanvas.tsx`: moves ActionPanel, ClueModal, and MapModal into the existing HudViewport.
- `src/components/game/GameCanvas.hud.test.tsx`: verifies all first-batch interfaces share the HUD design canvas.
- `src/components/game/ClueModal.tsx`: retains clue logic and composes the new primitives.
- `src/components/game/ClueModal.test.tsx`: protects clue selection, empty state, inference, and nested-confirm behavior.
- `src/components/game/MapModal.tsx`: retains map/travel logic and composes the new primitives.
- `src/components/game/MapModal.test.tsx`: protects current-location and travel availability behavior while asserting the new shell.
- `src/components/game/ActionPanel.tsx`: retains observe/investigate/action logic and composes the compact modal primitives.
- `src/components/game/ActionPanel.test.tsx`: protects close and item execution behavior while asserting the new shell.
- `src/components/system/ConfirmModal.tsx`: moves destructive confirmation onto the monochrome primitives.
- `src/components/system/ConfirmModal.test.tsx`: protects cancel/confirm and nested event behavior.
- `src/styles/globals.css`: namespaced shared modal styles and page-specific geometry; removal of conflicting colored/rounded first-batch rules.
- `public/assets/ui/penpot/icon-modal-clue.svg`, `icon-modal-map.svg`, `icon-modal-investigate.svg`, `icon-modal-action.svg`, `icon-modal-warning.svg`: independent monochrome modal icons.

---

### Task 1: Add the opaque double-rail modal frame

**Files:**
- Modify: `src/components/ui/PixelFrame.tsx`
- Modify: `src/components/ui/PixelFrame.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Produces: `PixelFrame` with `variant="modal"`.
- Preserves: existing `panel`, `dialogue`, and `button` behavior.

- [ ] **Step 1: Write the failing modal-rail test**

Add this case to `PixelFrame.test.tsx`:

```tsx
it('uses two rails and an opaque fill for a modal', () => {
  render(<PixelFrame variant="modal">弹窗内容</PixelFrame>);

  const frame = screen.getByText('弹窗内容').closest('.world-pixel-frame');
  expect(frame?.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
  expect(frame).toHaveClass('world-pixel-frame-modal');
  expect(frame).toHaveStyle({ backgroundColor: '#050505' });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run src/components/ui/PixelFrame.test.tsx`

Expected: TypeScript/test failure because `modal` is not an accepted variant.

- [ ] **Step 3: Implement the modal variant**

Change the variant and double-rail decisions in `PixelFrame.tsx` to:

```tsx
type PixelFrameVariant = 'panel' | 'dialogue' | 'button' | 'modal';

const isDoubleRail = variant === 'dialogue' || variant === 'modal';
const backgroundColor = variant === 'modal'
  ? '#050505'
  : variant === 'dialogue'
    ? 'rgba(9, 9, 9, 0.94)'
    : 'rgba(12, 12, 12, 0.93)';
```

Pass `isDoubleRail` to `PixelFrameRails` and `backgroundColor` into the existing inline style. Add a `.world-pixel-frame-modal` rule that uses the same stepped clip path as the corrected HUD frame and keeps `image-rendering: pixelated`.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run src/components/ui/PixelFrame.test.tsx`

Expected: all PixelFrame tests pass.

- [ ] **Step 5: Commit the frame variant**

```bash
git add src/components/ui/PixelFrame.tsx src/components/ui/PixelFrame.test.tsx src/styles/globals.css
git commit -m "feat: add monochrome pixel modal frame"
```

---

### Task 2: Build presentation-only pixel modal primitives

**Files:**
- Create: `src/components/ui/PixelModal.tsx`
- Create: `src/components/ui/PixelModal.test.tsx`
- Modify: `src/styles/globals.css`
- Create: `public/assets/ui/penpot/icon-modal-clue.svg`
- Create: `public/assets/ui/penpot/icon-modal-map.svg`
- Create: `public/assets/ui/penpot/icon-modal-investigate.svg`
- Create: `public/assets/ui/penpot/icon-modal-action.svg`
- Create: `public/assets/ui/penpot/icon-modal-warning.svg`

**Interfaces:**
- Produces: `PixelModalShell`, `PixelModalHeader`, `PixelModalContent`, `PixelModalFooter`, `PixelModalAction`, `PixelModalStatus`, and `PixelModalListItem`.
- `PixelModalShell` signature:

```ts
interface PixelModalShellProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  closeBlocked?: boolean;
}
```

- [ ] **Step 1: Write failing interaction tests**

Create `PixelModal.test.tsx` with these cases:

```tsx
it('closes from Escape and restores focus to the trigger', () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const { rerender } = render(<Harness open={false} onClose={onClose} />);
  const trigger = screen.getByRole('button', { name: '打开' });
  trigger.focus();
  rerender(<Harness open onClose={onClose} />);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<Harness open={false} onClose={onClose} />);
  act(() => vi.advanceTimersByTime(220));
  expect(trigger).toHaveFocus();
  vi.useRealTimers();
});

it('only closes from the backdrop itself', () => {
  const onClose = vi.fn();
  render(<Harness open onClose={onClose} />);
  fireEvent.click(screen.getByText('正文'));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('pixel-modal-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps the shell mounted for the stepped close animation', () => {
  vi.useFakeTimers();
  const { rerender } = render(<Harness open onClose={vi.fn()} />);
  rerender(<Harness open={false} onClose={vi.fn()} />);
  expect(screen.getByRole('dialog')).toHaveClass('is-closing');
  act(() => vi.advanceTimersByTime(220));
  expect(screen.queryByRole('dialog')).toBeNull();
  vi.useRealTimers();
});
```

The local `Harness` renders a real trigger plus `PixelModalShell`, `PixelModalHeader`, content, and footer.

- [ ] **Step 2: Run the new test and verify failure**

Run: `npm test -- --run src/components/ui/PixelModal.test.tsx`

Expected: module-not-found failure for `./PixelModal`.

- [ ] **Step 3: Implement the primitive contracts**

Use this presence and close structure in `PixelModalShell`:

```tsx
const CLOSE_MS = 220;
const [rendered, setRendered] = useState(open);
const previousFocusRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (open) {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setRendered(true);
    return;
  }
  const timer = window.setTimeout(() => {
    setRendered(false);
    previousFocusRef.current?.focus();
  }, CLOSE_MS);
  return () => window.clearTimeout(timer);
}, [open]);
```

Register one `keydown` listener while open. Call `onClose` for Escape only when `closeBlocked` is false. On the backdrop, close only when `event.target === event.currentTarget`. Render `role="dialog"`, `aria-modal="true"`, `aria-labelledby={labelledBy}`, `data-testid="pixel-modal-backdrop"`, and `is-open`/`is-closing` classes.

Implement the other exports as slot-based markup. `PixelModalHeader` accepts `titleId`, `title`, `meta`, `iconSrc`, `onClose`, and `closeLabel`. `PixelModalAction` is a real button with `data-active`, `disabled`, and monochrome SVG content support. `PixelModalListItem` exposes `data-selected` and `data-disabled` without importing Zustand.

- [ ] **Step 4: Add shared styles and SVG icons**

Add `.pixel-modal-*` rules under one `@layer components` block. Use `#050505`, `#f2f2f0`, stepped clip paths, opaque fills, integer design-pixel borders, and:

```css
.pixel-modal-shell.is-open .pixel-modal-frame {
  animation: pixelModalIn 200ms steps(4, end) both;
}
.pixel-modal-shell.is-closing .pixel-modal-frame {
  animation: pixelModalOut 220ms steps(4, end) both;
}
@media (prefers-reduced-motion: reduce) {
  .pixel-modal-shell .pixel-modal-frame { animation: none !important; }
}
```

Create each SVG with a 24×24 integer viewBox, `fill="#f2f2f0"`, and crisp rect/path geometry. Do not embed raster data or text in icons.

- [ ] **Step 5: Run primitive tests and lint the new module**

Run: `npm test -- --run src/components/ui/PixelModal.test.tsx src/components/ui/PixelFrame.test.tsx`

Run: `npx eslint src/components/ui/PixelModal.tsx src/components/ui/PixelModal.test.tsx`

Expected: all tests and lint pass.

- [ ] **Step 6: Commit the primitives**

```bash
git add src/components/ui/PixelModal.tsx src/components/ui/PixelModal.test.tsx src/styles/globals.css public/assets/ui/penpot/icon-modal-*.svg
git commit -m "feat: add shared pixel modal primitives"
```

---

### Task 3: Put all first-batch overlays in the virtual HUD canvas

**Files:**
- Modify: `src/components/game/GameCanvas.tsx`
- Create: `src/components/game/GameCanvas.hud.test.tsx`

**Interfaces:**
- Consumes: existing `HudViewport` with `data-design-size="1672x941"`.
- Produces: one `.hud-design-canvas` containing DialogueBox, StatusPanel, ActionBar, ActionPanel, ClueModal, and MapModal.

- [ ] **Step 1: Write the failing HUD-containment test**

Mock visual children in `GameCanvas.hud.test.tsx` with identifiable elements, render `GameCanvas`, and assert:

```tsx
const hud = container.querySelector('.hud-design-canvas');
expect(hud).not.toBeNull();
expect(within(hud as HTMLElement).getByTestId('action-panel-mock')).toBeInTheDocument();
expect(within(hud as HTMLElement).getByTestId('clue-modal-mock')).toBeInTheDocument();
expect(within(hud as HTMLElement).getByTestId('map-modal-mock')).toBeInTheDocument();
```

Mock `ActionPanel`, `ClueModal`, and `MapModal` to return the test IDs above. Mock the remaining GameCanvas children to return `null` so the test has no store or animation dependencies.

- [ ] **Step 2: Run the containment test and verify failure**

Run: `npm test -- --run src/components/game/GameCanvas.hud.test.tsx`

Expected: ActionPanel, ClueModal, and MapModal are outside `.hud-design-canvas`.

- [ ] **Step 3: Move the overlays into HudViewport**

Make the HUD block in `GameCanvas.tsx` exactly responsible for the six HUD elements:

```tsx
<HudViewport>
  <DialogueBox />
  <StatusPanel />
  <ActionBar />
  <ActionPanel />
  <ClueModal />
  <MapModal />
</HudViewport>
```

Remove their old sibling mounts. Do not move CharacterProfileModal, ConclusionModal, EndingPlayer, editor tools, or LoadingOverlay in this task.

- [ ] **Step 4: Run layout tests**

Run: `npm test -- --run src/components/game/GameCanvas.hud.test.tsx src/components/game/HudViewport.test.ts`

Expected: all tests pass, including the existing 1672×941 and 1469×1268 scale calculations.

- [ ] **Step 5: Commit HUD containment**

```bash
git add src/components/game/GameCanvas.tsx src/components/game/GameCanvas.hud.test.tsx
git commit -m "refactor: scale core overlays with the hud"
```

---

### Task 4: Restyle ClueModal without changing clue logic

**Files:**
- Modify: `src/components/game/ClueModal.tsx`
- Create: `src/components/game/ClueModal.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: `PixelModalShell`, `PixelModalHeader`, `PixelModalContent`, `PixelModalFooter`, `PixelModalAction`, and `PixelModalListItem`.
- Preserves: `toggleModal('clues')`, selected ID state, `updateClues`, deletion confirmation, and `sendMessage(prompt)`.

- [ ] **Step 1: Write failing behavior and structure tests**

Set `ui.showClues = true` in the real Zustand store and mock `useGameLoop`. Add tests that assert:

```tsx
expect(screen.getByRole('dialog', { name: '线索' })).toHaveClass('pixel-modal-shell');
expect(screen.getByText('ORGANIZED CLUE INDEX 0/6')).toBeInTheDocument();
expect(screen.getByText('暂无整理线索')).toBeInTheDocument();
```

With two organized clues, click both accessible select buttons, click the inference button, and assert `sendMessage` was called once and `showClues` became false. Open deletion confirmation, click inside the confirmation content, and assert the parent clue modal remains open.

- [ ] **Step 2: Run ClueModal tests and verify failure**

Run: `npm test -- --run src/components/game/ClueModal.test.tsx`

Expected: the existing modal does not expose the shared pixel shell contract.

- [ ] **Step 3: Compose ClueModal from shared primitives**

Remove the early `if (!showClues) return null`; pass `open={showClues}` to `PixelModalShell`. Use:

```tsx
<PixelModalShell
  open={showClues}
  onClose={close}
  labelledBy="clue-modal-title"
  className="clue-modal-shell"
  closeBlocked={pendingDeleteId !== null}
>
```

Use the clue SVG in `PixelModalHeader`, keep the current list mapping and handlers, and wrap cards with `PixelModalListItem selected={selected}`. Use `PixelModalFooter` for the selected count and `PixelModalAction` for inference. Keep the exact prompt construction and persistence code untouched.

- [ ] **Step 4: Replace colored clue styles**

Under `.hud-design-canvas .clue-modal-*`, set a fixed design width/height matching the approved Penpot board, opaque black content, white rails, fixed header/footer, and an internally scrolling list. Replace blue/gold selected states with white-background/black-text inversion. Delete or neutralize conflicting `.clean-modal-frame-blue`, `.clue-card` blue, and mobile-only first-batch overrides that can win at PC sizes.

- [ ] **Step 5: Run clue tests and shared primitive tests**

Run: `npm test -- --run src/components/game/ClueModal.test.tsx src/components/ui/PixelModal.test.tsx`

Expected: all tests pass.

- [ ] **Step 6: Commit ClueModal**

```bash
git add src/components/game/ClueModal.tsx src/components/game/ClueModal.test.tsx src/styles/globals.css
git commit -m "feat: unify the clue modal with the pc hud"
```

---

### Task 5: Restyle MapModal without changing travel settlement

**Files:**
- Modify: `src/components/game/MapModal.tsx`
- Create: `src/components/game/MapModal.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: shared PixelModal primitives and `icon-modal-map.svg`.
- Preserves: location visibility, map node positions, `estimateTravel`, `settleGameTransaction`, `commitGameTransaction`, background selection, scene updates, persistence, and notifications.

- [ ] **Step 1: Write failing shell and travel-state tests**

Render with `ui.showMap = true` and the real default game store. Assert:

```tsx
expect(screen.getByRole('dialog', { name: '地图' })).toHaveClass('pixel-modal-shell');
expect(screen.getByText(/当前位置：/)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /前往/ })).toBeDisabled();
```

The initial selected location is the current location, so the travel button must remain disabled. Click one visible travel-enabled location that is not current and assert that the button's disabled state reflects the existing stamina/waiting/typing predicates. Do not mock or rewrite `estimateTravel`.

- [ ] **Step 2: Run MapModal tests and verify failure**

Run: `npm test -- --run src/components/game/MapModal.test.tsx`

Expected: the shared shell assertion fails against the current colored clean-modal frame.

- [ ] **Step 3: Compose MapModal from shared primitives**

Remove the early `if (!showMap) return null`; use `PixelModalShell open={showMap}` and `labelledBy="map-modal-title"`. Replace only the outer shell, header, information panel, status labels, close control, and travel button. Keep the existing `mapViewportRef`, nodes, background image, selection handlers, and `handleTravel` body unchanged.

- [ ] **Step 4: Apply approved map geometry**

Add namespaced fixed design-pixel geometry for the large modal, header, map viewport, bottom information strip, cost metadata, and action button. Keep `map-pixel-background` and all location marker coordinates untouched. Remove blue/gold borders and gradients; represent current, selected, unavailable, and rumored states with white/black inversion, outline density, and gray dither.

- [ ] **Step 5: Run map tests and transaction regression tests**

Run: `npm test -- --run src/components/game/MapModal.test.tsx src/engine/game-transaction.test.ts src/data/locations.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit MapModal**

```bash
git add src/components/game/MapModal.tsx src/components/game/MapModal.test.tsx src/styles/globals.css
git commit -m "feat: unify the map modal with the pc hud"
```

---

### Task 6: Restyle ActionPanel without changing action execution

**Files:**
- Modify: `src/components/game/ActionPanel.tsx`
- Create: `src/components/game/ActionPanel.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: shared PixelModal primitives and investigation/action SVG icons.
- Preserves: `performAction`, item matching/viewing, observed clue candidates, clue organization, persistence, and notification behavior.

- [ ] **Step 1: Write failing compact-panel behavior tests**

Mock `useGameLoop` with `performAction` and `sendMessage`. Set a visible investigate panel with one real item in the Zustand store. Assert:

```tsx
expect(screen.getByRole('dialog', { name: '调查' })).toHaveAttribute('data-compact', 'true');
fireEvent.click(screen.getByRole('button', { name: /检查窗台/ }));
expect(loopMocks.performAction).toHaveBeenCalledWith('investigate', 0);
```

Also click the close control and assert `game.actionPanel.visible` is false. Add an observe-mode case that confirms the existing clue-organize button still records the candidate.

- [ ] **Step 2: Run ActionPanel tests and verify failure**

Run: `npm test -- --run src/components/game/ActionPanel.test.tsx`

Expected: the compact shared-dialog contract fails.

- [ ] **Step 3: Compose the compact ActionPanel**

Keep the existing visibility check for business state only if it does not bypass closing motion; otherwise pass `open={actionPanel.visible}` to `PixelModalShell compact`. Use `labelledBy="action-panel-title"` and choose the independent investigate/action icon from `actionPanel.type`. Replace the header, outer PixelFrame, item container, metadata chips, and close button with shared primitives. Do not change `handleSelectItem`, `handleOrganizeClue`, ItemViewer mounting, or content parsing.

- [ ] **Step 4: Apply compact fixed geometry and monochrome states**

Replace `width: min(88vw, 980px)` and viewport-relative positioning with approved design-pixel width, top position, max content height, fixed header, and internal scrolling. Use white-background/black-text hover or selection. Convert colored metadata chips and item slots to outline/dither states while retaining readable time, stamina, sanity, suspect, and style values.

- [ ] **Step 5: Run action and wheel regression tests**

Run: `npm test -- --run src/components/game/ActionPanel.test.tsx src/components/game/ActionBar.test.tsx`

Expected: all tests pass; the operation wheel still opens the real action panel.

- [ ] **Step 6: Commit ActionPanel**

```bash
git add src/components/game/ActionPanel.tsx src/components/game/ActionPanel.test.tsx src/styles/globals.css
git commit -m "feat: unify the action panel with the pc hud"
```

---

### Task 7: Move ConfirmModal onto the monochrome modal system

**Files:**
- Modify: `src/components/system/ConfirmModal.tsx`
- Create: `src/components/system/ConfirmModal.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:**
- Consumes: PixelModalShell, PixelModalHeader, PixelModalContent, PixelModalFooter, PixelModalAction, and warning SVG.
- Preserves: `isOpen`, `title`, `message`, `onConfirm`, and `onCancel` public props.

- [ ] **Step 1: Write failing confirmation tests**

```tsx
it('cancels only from cancel or the backdrop and confirms once', () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<ConfirmModal isOpen title="删除线索" message="确定删除？" onCancel={onCancel} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByText('确定删除？'));
  expect(onCancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
```

Add a second test for Escape invoking `onCancel` once.

- [ ] **Step 2: Run ConfirmModal tests and verify failure**

Run: `npm test -- --run src/components/system/ConfirmModal.test.tsx`

Expected: the existing implementation lacks the shared shell contract.

- [ ] **Step 3: Compose ConfirmModal from shared primitives**

Keep the public props unchanged. Replace colored radial backdrop, gold warning slot, and colored PixelButtons with an opaque compact `PixelModalShell`, warning header, content, and monochrome cancel/confirm actions. Ensure content clicks stop at the frame and the shell's target/currentTarget check handles backdrop cancellation.

- [ ] **Step 4: Run confirmation and clue tests**

Run: `npm test -- --run src/components/system/ConfirmModal.test.tsx src/components/game/ClueModal.test.tsx`

Expected: all tests pass and nested deletion no longer closes the parent clue modal.

- [ ] **Step 5: Commit confirmation styling**

```bash
git add src/components/system/ConfirmModal.tsx src/components/system/ConfirmModal.test.tsx src/styles/globals.css
git commit -m "feat: unify destructive confirmation styling"
```

---

### Task 8: Remove first-batch style conflicts and run full verification

**Files:**
- Modify: `src/styles/globals.css`
- Test: all files changed in Tasks 1–7

**Interfaces:**
- Produces: one authoritative `.hud-design-canvas .pixel-modal-*` style layer for the first-batch PC interfaces.

- [ ] **Step 1: Locate conflicting selectors**

Run:

```bash
rg -n "clean-modal-frame-(blue|gold)|clue-card|clue-infer|map-modal|map-travel|action-panel|meta-chip" src/styles/globals.css
```

Classify each match as shared legacy behavior, first-batch legacy styling, or mobile-only styling. Remove only declarations superseded by the new namespaced rules.

- [ ] **Step 2: Add a CSS contract test**

Create a test in `src/ui/penpotPcUiAssets.test.ts` that reads `globals.css` and asserts the authoritative rules contain opaque modal fill, stepped animation, reduced-motion coverage, and no `vw` width for `.hud-design-canvas .action-panel`, `.clue-modal`, or `.map-modal`.

```ts
expect(css).toMatch(/\.pixel-modal-frame[\s\S]*#050505/);
expect(css).toMatch(/pixelModalIn[\s\S]*steps\(4, end\)/);
expect(css).toMatch(/prefers-reduced-motion/);
expect(css).not.toMatch(/\.hud-design-canvas \.action-panel[^}]*\d+vw/);
```

- [ ] **Step 3: Run the complete automated verification**

Run: `npm test -- --run`

Run: `npm run lint`

Run: `npm run build`

Expected: every command exits with status 0. If a pre-existing unrelated failure appears, record the exact command and failure without modifying unrelated files.

- [ ] **Step 4: Commit conflict cleanup and verification contract**

```bash
git add src/styles/globals.css src/ui/penpotPcUiAssets.test.ts
git commit -m "test: lock core pixel ui visual contracts"
```

---

### Task 9: Perform local visual acceptance without deploying

**Files:**
- No production file changes expected.
- Reference: `docs/design/first-batch-ui-layouts.svg`
- Reference: Penpot page `First Batch / UI Layouts`.

**Interfaces:**
- Validates: design-space scaling, background contrast, layout, overflow, and motion.

- [ ] **Step 1: Start or reuse the local Vite server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: `http://127.0.0.1:5173/` returns HTTP 200. Do not deploy or push.

- [ ] **Step 2: Capture the design viewport**

Set the browser viewport to 1672×941. Open each interface through the operation wheel and capture clue, map, investigation, action, empty-state, selected-state, and confirmation screenshots. Compare frame coordinates, header/footer geometry, icon scale, and inversion states with the Penpot page.

- [ ] **Step 3: Capture standard 16:9 and 1469×1268**

Repeat at 1920×1080 and 1469×1268. Verify the entire HUD uses one scale, modal centers remain stable, title/footer do not detach, and no content is clipped by the virtual safe area.

- [ ] **Step 4: Test white and high-contrast backgrounds**

Use an existing light scene or the project's existing background test override; do not alter background resolution or selection code. Confirm opaque black panels, white rails, controls, and text remain readable over white, dark, and high-contrast images.

- [ ] **Step 5: Verify motion and overflow**

Open and close each interface, confirming 180–220ms stepped presence and no premature unmount. Populate long clue/action content using existing local test state and verify only content scrolls while header/footer remain fixed. Enable reduced motion and confirm spatial animation is removed.

- [ ] **Step 6: Report acceptance results**

List each viewport and interface as pass/fail, attach screenshot paths, and identify any remaining pixel offsets. Make no push, deployment, or unrelated cleanup commit.
