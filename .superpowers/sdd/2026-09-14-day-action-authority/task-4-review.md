# Task 4 review at 2c20c1b

Independent Astra reviewer `/root/astra_review_unified_action`: **CHANGES_REQUIRED**, spec and quality need fixes.

1. **P1: lost continuation scene restrictions** — `turn-preparation.ts:139`. Home15:55→school produces an exterior contract forbidding liu-renguang. After interrupted travel/death/resume, Writer sceneContract is undefined and a resumed teacher beat is accepted. Zero-time death also incorrectly moves presentation from street to home-day. Preserve original program-owned scene constraints and transit presentation; validate before resumed reviews and Writer projection.
2. **P2: lost participants in completed compound work** — `action-authority.ts:254`. Supermarket15:00→55min investigation→5min travel toschool has activeNpcIds=[] and strips Chen Huihui from completed work. Hard review blocks missing-fixed-location-npc and scene-contract-violation. Project cast per executed segment; keep unfinished travel free of destination reception.
3. **P2: overall budget adds child durations** — `action-authority.ts:47`. “最多两小时，先深入调查房间，再休息一小时” resolvesbudget180/executed165, instead of cap120. Aggregatecaps must bound childrequests; expected105min work+15minrest and remainingrestcontinuation.

Root ran requested ephemeral probes in `scripts/task4-review-probes.test.ts`, results `.codex-test-tmp/task4-review-probes.log`. Reviewer read both source/output and confirmed the findings. These use mocked completions, not live quality evidence.

Other inspected authority/atomic/private-ledger seams had no additional blockers. Baseline961tests/107files+build/lint passed but did not cover these edges. Tasks5–8 remain outside review scope.

Fixround1 dispatched: Sol budgethelper inadapter; Sol scenecontinuity/preparation; root executedsegmentcast/orchestrator/hooks/storage integration. Newcommit + same-reviewer scopedrereview required. Task4 NOTcomplete.
