# Task 4 pending action authorization report

## Scope

Changed only:

- `src/agents/mystery/pending-action-authorization.ts`
- `src/agents/mystery/pending-action-authorization.test.ts`
- this report

No git stage or commit operation was performed.

## Result

Added a pure, program-owned `PendingActionAuthorization` ledger and capture/restore helpers.

- The ledger binds the continuation action ID and cycle to an exact private graph fingerprint containing the graph version and ordered canonical fact IDs.
- Revelation rows preserve public alias, private canonical identity, reveal level, delivery, speaker, source ID, and original source location.
- Knowledge rows preserve only remaining continuation milestones, their original evidence, and source location.
- Capture uses the continuation's active step and later steps, removes sources completed by the latest resolution, and retains matching prior rows when a repeated-resume Director omits them.
- A retained row keeps its original source location across repeated interrupted travel even when the fresh preparation still starts at the origin.
- Restore rejects graph, action, cycle, alias, source, and location mismatches before resolution. It rebuilds each original-location brief with the current truth gates, authored fixed NPCs, and a location-specific player discovery projection.
- Restore runs `reviewDirectorPlan` over the combined restored rows, enforcing current reveal depth, delivery/speaker authority, discovery rules, and reveal budget.
- The returned projection contains only public aliases, revelation text projections, NPC knowledge projections, knowledge events, and `allowedDiscoveries`. It contains neither `canonicalTruth` nor canonical fact IDs.
- A continuation with no pending revelation or knowledge source still receives an empty ledger with its action/cycle/fingerprint. A completed action returns no ledger.

## Regression coverage

The focused tests cover:

- the real F001 deep action interrupted at 15:30 after 30 minutes and completed over the remaining 75 minutes when the resume Director omits the revelation;
- preservation over another partial resume;
- source-location preservation across repeated interrupted travel from home to school;
- pruning a completed knowledge milestone while a later fact remains pending;
- fact-table reorder rejection;
- rejection when a current suspicion gate makes the original reveal illegal;
- legal restore with original dialogue delivery and speaker;
- action and cycle mismatch rejection;
- knowledge-event restore only while its completion source remains pending;
- destination `allowedDiscoveries` reconstruction while the resumed action still starts at home;
- absence of canonical truth and canonical fact IDs from the public restore projection.

## Verification

- `npm test -- --run src/agents/mystery/pending-action-authorization.test.ts`: 11 tests passed.
- Combined pending/adapter/orchestrator/transaction/hook run: 59 tests passed.
- `npx eslint src/agents/mystery/pending-action-authorization.ts src/agents/mystery/pending-action-authorization.test.ts`: exit 0.
- `npm run build`: exit 0.

A separate Astra review found no correctness, security, compatibility, or mutation issue in the two owned source files. It noted that orchestration-level tests must establish call order and prove that the private ledger never enters Writer/repair prompts; root owns and tests that integration boundary.

## Freeze

The module and its tests are frozen for root integration. Remaining work is outside this slice: root persists the ledger beside `actionContinuity`, restores its public projection before every hard and semantic review, and verifies serialization/call ordering at the orchestrator and hook boundary.
