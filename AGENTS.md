# Farewell Web Agent Contract

This file is mandatory project context for development agents working in this repository.

## Authoritative story terminology

- A **剧情回合 (narrative turn)** is one player input or choice followed by one generated playable scene and state settlement. A turn normally advances the in-game clock by minutes.
- A **轮回 (completed loop)** is one full in-world day experienced by the player character, ending only when the day resets to the next repeated morning.
- `cycleCount` is the ordinal of the current repeated day, starting at `1`. The number of completed loops is therefore `max(0, cycleCount - 1)`.
- Never describe one LLM response, one player choice, one scene, or one state transaction as a 轮回.

The detailed, authoritative story contract is [docs/agent-story-contract.md](docs/agent-story-contract.md). If older brainstorming or design documents conflict with it, this contract wins.

## Confirmed pacing requirements

- The player must experience three complete day resets before a culprit can be confirmed or a normal route ending can be committed. In current numbering, the earliest branching day is `cycleCount >= 4`.
- Days 1–3 are investigation and failed-rescue days. They may build hypotheses, suspicion, memories, and evidence, but must not confirm a culprit, expose a solution fact, or enter a normal route ending.
- Suspicion is a focus signal, not proof. Reaching `50` must not by itself bypass loop gates or required evidence.
- Final accusation and ending eligibility must ultimately be enforced by deterministic program rules, not prompt wording alone.
- The target repeated-morning reset time is **08:00**. The current engine still contains 07:30 assumptions; treat this as an explicit implementation mismatch, not a new source of truth. Until migrated, runtime agents must obey the actual `gameStatus.time` shown to the player and must not invent a conflicting clock time.

## Agent architecture invariants

- Preserve the one-way authority flow: fact gate -> director -> hard review -> semantic fact review -> writer -> protocol validation -> state agent -> deterministic transaction.
- The writer never receives canonical truth and never owns state.
- The state agent may only report changes supported by the player input or rendered narrative. It never owns loop counters, route locks, endings, or fact collections.
- Parallel work may be used for independent read-only analysis or candidate generation, but agents must not concurrently mutate the same canonical story state. Final facts, route eligibility, and state commits always pass through a single ordered authority path.

## Verification expectations

- Any pacing change must test narrative-turn counting separately from completed-loop counting.
- Test the boundary `cycleCount: 3 -> 4` and prove that normal route endings cannot occur on days 1–3.
- Test both the standard multi-agent pipeline and legacy compatibility mode; legacy mode must not bypass deterministic pacing gates.
- Keep `npm test -- --run`, `npm run build`, and `npm run lint` green in proportion to the change.
