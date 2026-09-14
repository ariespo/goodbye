# Task 4 scoped fix-round-1 review

Astra reviewed `2c20c1b..d08eb9c`: CHANGES_REQUIRED.

Original three findings ADDRESSED: exterior-school constraints survive interruption/event/resume and reject forbidden teacher; completed supermarket work retains its authorized cast; aggregate 120-minute budget executes deep work105 + rest15.

Two new P2 findings confirmed by same-Implementer probes:

1. `turn-preparation.ts:159`: savedTransit applies to every non-work result. After interrupted school journey and official event, a new completed15-minute supermarket journey ends at supermarket but projects street and an authorized false still-in-transit statement. Preserve previous transit only for operations retaining that unfinished journey. Verify new arrival/background/public outcome and cancellation of old continuation; retain event-in-transit positive. Evidence `.codex-test-tmp/task4-new-travel-probe.log`.
2. `action-authority.ts:51,56`: clause-local only-duration becomes aggregate cap, and prefix duration before waiting is missed. Exact `先休息十分钟，再只用五分钟等待` yields budget5, requested[10,60], elapsed5; expected stages[10,5],elapsed15. Scope whole-action versus local caps; recognize prefix duration. Retain overall120 and additive controls. Evidence `.codex-test-tmp/task4-local-cap-probe.test.ts`.

Fresh recorded validation:99 focused tests, build/lint and diff-check passed; this does not invalidate reproduced edges. Tasks5+ outside review. Root dispatched fixround2 to same respective Implementers with disjoint file ownership, no stage/commit.
