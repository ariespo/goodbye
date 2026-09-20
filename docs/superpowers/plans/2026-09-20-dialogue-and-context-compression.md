# Dialogue navigation and narrative context compression

User request: add common dialogue controls and generate a short summary with every narrative; replace older prompt history with those summaries automatically after a configurable limit. Implementation is authorized by the request.

## Agreed implementation scope

1. Previous/next reading controls and a seen-only dialogue log. Reading navigation must not change time, resources, route state, knowledge authority, or turn settlement. Existing automatic and fast playback remain available. An open dialog blocks playback; all controls fit mobile screens.
2. Writer produces a 2–4 sentence summary in the existing `<sum>` response, covering time, place, participants, executed events/results, uncertainty and unfinished business. Existing review includes this summary; no additional model request is added just for summarization.
3. Persist a program-owned `ChatMessage.narrativeSummary` envelope containing the accepted summary and authoritative turn timing/location/participants. Optional metadata keeps old saves compatible.
4. Project prompt history without editing the original messages. Default threshold is 12,000 estimated tokens, player-adjustable from 2,000 to 100,000. Compress older assistant narratives first, retain the latest two narrative turns in full where the model's hard budget permits. Missing summaries retain original text; summaries must not increase history size. Route-version isolation, valid commitments and facts keep existing authority.
5. Use one projection policy for actual turn preparation, compatibility assembly and prompt inspection. Keep original history available to authorized evidence retrieval. Show estimates and compression status in inspection/settings without promising exact provider token counts.

## Responsibilities and interfaces

- Playback worker: DialogueBox, its control parts/pagination, HistoryDrawer, isolated navigation styles and playback state/tests.
- Settings worker: AppSettings/defaults/normalization/SettingsModal; `DEFAULT_CONTEXT_COMPRESSION_TOKENS`, `normalizeContextCompressionThreshold(value)`; optional `narrativeSummary` type reference.
- Context worker: history projection, memory compiler/preparation/assembler/inspector and regression tests.
- Root: `memory/narrative-summary.ts`, Writer instructions and commit integration, integration review and browser/build verification.

`NarrativeSummary` contains version=1, text, startedAt, endedAt, cycleCount, startLocationId, endLocationId and participants. `formatNarrativeSummary(message)` provides a labeled historical record, or null when no trustworthy summary is available. Settings and compression consume the same normalized threshold.

## Required evidence

- Regression tests before implementing navigation, summary formatting and compression policy.
- Boundary: below/above threshold, oldest-first, latest two retained, missing/long summaries, immutable originals, route filtering and actual serialized budget.
- Summary is derived only from an accepted narrative; retries/failures cannot persist unaccepted text or duplicate summaries. Old saves/custom format remain usable.
- Reading cannot expose unread current narrative, replay state effects, or continue automatically behind a modal. First/last line and pagination are checked.
- Browser checks at desktop, 390 px, 320 px and landscape; settings save/reload; actual prepared request demonstrates replacement and original evidence remains retrievable.
- Appropriate tests, full suite, lint and production build; publish to the existing Cloudflare project after passing checks, as previously authorized.

## Verification completed

- Full suite: 1,789 passed, 7 skipped, 0 failed. ESLint and production build passed.
- Browser: desktop reading/review preserves live state, history omits unread text and summaries, dialogs pause typing and automatic progression. Touch emulation at 320×720, 390×844 and 844×390 verified all navigation controls fit and remain approximately 44 CSS pixels high; history closes correctly. Compression settings persist after reload.
- Actual turn preparation with six synthetic narrative records demonstrated old bodies replaced by summaries in Director and Writer requests, latest two bodies retained, and saved originals unchanged. No live model generation was run for this feature.
- Independent review found and resolved reflow while reviewing and restored-save identity projection issues. Restoring recognition gates uses accepted turn records and their evidence positions, never raw recognition syntax alone. Saves too old to contain those records retain their existing identity behavior.
- Current-line review returns to that line's first page so viewport/font changes cannot skip an unread prefix. Reading progress is reset on new scenes, new games, load, retry and day reset.
