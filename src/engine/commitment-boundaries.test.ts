import { describe, expect, it } from 'vitest';
import { commitmentBoundariesFromVariables } from './commitment-boundaries';
import { nextScheduledBoundary } from './scheduled-events';
import { resolveAction } from './action-resolution';
import { buildTurnCommit } from '../memory/world-memory';
import { maintextToScene } from './scene-parser';

describe('commitment boundary integration', () => {
  it('projects only active unacknowledged commitments from the current cycle', () => {
    const active = {
      id: 'commitment:turn-1:0', cycleCount: 2, actorId: 'chen-huihui', recipientId: 'player',
      action: '在便利店交出清单', locationId: 'supermarket', dueAt: '2024-09-09T10:00:00',
      status: 'active', sourceEventId: 'turn:turn-1', evidenceQuote: '十点来便利店，我把清单给你。',
    } as const;
    const variables = {
      cycleCount: 2,
      worldMemory: {
        version: 2, canonicalTruthVersion: 'test', events: [], cognition: [], episodes: [], softCanonFacts: [],
        disclosures: [], commitments: [
          active,
          { ...active, id: 'commitment:old', cycleCount: 1 },
          { ...active, id: 'commitment:fulfilled', status: 'fulfilled' },
          { ...active, id: 'commitment:acknowledged' },
        ],
        acknowledgedCommitmentBoundaryIds: ['commitment-boundary:commitment:acknowledged'],
      },
    };

    expect(commitmentBoundariesFromVariables(variables)).toEqual([
      { id: 'commitment-boundary:commitment:turn-1:0', at: '2024-09-09T10:00:00' },
    ]);
  });

  it('interrupts at a due promise once without fulfilling it or trapping the clock', () => {
    const commitment = {
      id: 'commitment:turn-1:0', cycleCount: 1, actorId: 'chen-huihui', recipientId: 'player',
      action: '在便利店交出清单', locationId: 'supermarket', dueAt: '2024-09-09T10:00:00',
      status: 'active' as const, sourceEventId: 'turn:turn-1', evidenceQuote: '十点来便利店，我把清单给你。',
    };
    const before = {
      cycleCount: 1, location: 'home', time: '2024-09-09T09:30:00', stamina: 100, sanity: 70,
      worldMemory: {
        version: 2, canonicalTruthVersion: 'test', events: [], cognition: [], episodes: [], softCanonFacts: [],
        disclosures: [], commitments: [commitment], acknowledgedCommitmentBoundaryIds: [],
      },
    };
    const boundary = nextScheduledBoundary(
      before.time, before, commitmentBoundariesFromVariables(before),
    );
    const resolution = resolveAction({
      id: 'action:search', cycleCount: 1, startTime: before.time, currentLocationId: 'home',
      stamina: 100, sanity: 70, nextBoundary: boundary,
      steps: [{ id: 'search', kind: 'investigation', scope: 'normal', locationId: 'home', completionSourceIds: [] }],
    });
    expect(resolution.interruption).toEqual({
      id: 'commitment-boundary:commitment:turn-1:0', at: '2024-09-09T10:00:00',
    });

    const commit = buildTurnCommit({
      turnId: 'turn-2', turnIndex: 2, createdAt: 2, occurredAt: resolution.endTime,
      locationId: 'home', cycleCount: 1, summary: '约定时间到了。',
      scene: maintextToScene('对话|旁白|calm|约定时间到了。'),
      beforeVariables: before,
      settledVariables: { ...before, time: resolution.endTime, stamina: resolution.resources.after.stamina },
      narrativeText: '对话|旁白|calm|约定时间到了。',
      encounteredCommitmentBoundaryId: resolution.interruption.id,
    });
    const after = { ...before, time: resolution.endTime, worldMemory: commit.worldMemory };
    expect(after.worldMemory.commitments[0]).toMatchObject({ status: 'active' });
    expect(commitmentBoundariesFromVariables(after)).toEqual([]);
    expect(nextScheduledBoundary(after.time, after, commitmentBoundariesFromVariables(after))).toEqual({
      id: 'death-news', at: '2024-09-09T16:00:00',
    });
  });
});
