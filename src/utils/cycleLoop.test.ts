import { describe, it, expect } from 'vitest';
import {
  checkCycleFailure,
  settleCycleVariables,
  getCycleMetaOptions,
  buildCycleOpeningMaintext,
  startNextCycle,
  STAY_OPTION_TEXT,
  GOODBYE_OPTION_TEXT,
} from './cycleLoop';
import { createDefaultVariables } from '../sillytavern/vars-merger';
import { normalizeWorldMemory } from '../memory/world-memory';
import { useGameStore } from '../stores/gameStore';

describe('checkCycleFailure', () => {
  const base = { stamina: 50, sanity: 50, time: new Date(2024, 8, 9, 15, 0) };

  it('正常状态不触发', () => {
    expect(checkCycleFailure(base)).toBeNull();
  });

  it('体力/理智耗尽触发', () => {
    expect(checkCycleFailure({ ...base, stamina: 0 })).toBe('stamina');
    expect(checkCycleFailure({ ...base, sanity: -5 })).toBe('sanity');
  });

  it('过零点触发一天结束', () => {
    expect(checkCycleFailure({ ...base, time: new Date(2024, 8, 10, 0, 0) })).toBe('day-end');
    expect(checkCycleFailure({ ...base, time: new Date(2024, 8, 9, 23, 59) })).toBeNull();
  });
});

describe('settleCycleVariables', () => {
  const current = {
    ...createDefaultVariables(),
    cycleCount: 3,
    stamina: 0,
    sanity: 12,
    tripProgress: 40,
    lockedRoute: 'A',
    overlay: 'CULT',
    finalChoice: 'report',
    location: 'water-tower',
    suspicion: { 'old-man': 50, 'detective-a': 20, 'detective-b': 0, self: 10, clerk: 0, teacher: 0, senpai: 0 },
    unlockedClues: ['c1', 'c2'],
    cultClues: ['x1'],
    letterFragments: ['l1'],
    routesLockedEver: ['A'],
    knowledgeEvents: ['know:home', 'meet:old-man'],
    mysteryKnowledge: { 'fact-1': 'clue' },
    playerNameKnownByNpcIds: ['detective-b'],
    worldMemory: {
      ...normalizeWorldMemory({ cycleCount: 3 }),
      events: [{ eventId: 'turn:old', turnId: 'old', turnIndex: 1, cycleCount: 3, occurredAt: '2024-09-09T09:00:00', locationId: 'school', actorIds: ['detective-a'], kind: 'narrative-turn' as const, summary: '旧回合', evidenceLineIds: [], factIds: [], tags: [], salience: 0.5, createdAt: 1 }],
      cognition: [
        ...normalizeWorldMemory({ cycleCount: 3 }).cognition,
        { cognitionId: 'player|fact:fact-1', observerId: 'player', propositionId: 'fact:fact-1', status: 'believed' as const, confidence: 0.8, sourceEventIds: ['turn:old'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '玩家记得事实', provenance: 'accepted-turn' as const, scope: 'durable' as const, acquiredCycle: 3 },
        { cognitionId: 'detective-b|fact:fact-1', observerId: 'detective-b', propositionId: 'fact:fact-1', status: 'heard' as const, confidence: 1, sourceEventIds: ['turn:old'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '林静当天听过', provenance: 'accepted-turn' as const, scope: 'day' as const, acquiredCycle: 3 },
        { cognitionId: 'detective-b|expression:player-name', observerId: 'detective-b', propositionId: 'expression:player-name', subjectId: 'player', status: 'confirmed' as const, confidence: 1, sourceEventIds: ['turn:old'], firstLearnedTurn: 1, lastUpdatedTurn: 1, summary: '公开姓名权限', identityScope: 'full-name' as const, provenance: 'accepted-turn' as const, scope: 'day' as const, acquiredCycle: 3 },
      ],
      softCanonFacts: [{ factId: 'soft:coffee', text: '慧慧记得玩家常买无糖咖啡。', characterIds: ['chen-huihui'], locationIds: ['supermarket'], level: 'soft' as const, privacy: 'common' as const, timeScope: 'pre-game' as const, source: 'director' as const, createdTurn: 1 }],
      disclosures: [{ id: 'disclosure:old:0', cycleCount: 3, speakerId: 'player', listenerIds: ['detective-b'], propositionId: 'fact:fact-1', sourceEventId: 'turn:old', evidenceQuote: '我知道这个事实', evidenceSpans: [{ lineIndex: 0, quote: '我知道这个事实' }] }],
      commitments: [
        { id: 'commitment:active', cycleCount: 3, actorId: 'detective-b', recipientId: 'player', action: '交出记录', locationId: 'school', dueAt: '2024-09-09T10:00:00', status: 'active' as const, sourceEventId: 'turn:old', evidenceQuote: '我会交出记录' },
        { id: 'commitment:fulfilled', cycleCount: 3, actorId: 'detective-a', recipientId: 'player', action: '交出照片', locationId: 'school', dueAt: '2024-09-09T09:30:00', status: 'fulfilled' as const, sourceEventId: 'turn:old', evidenceQuote: '我会交出照片', statusSourceEventId: 'turn:done' },
      ],
      acknowledgedCommitmentBoundaryIds: ['commitment-boundary:commitment:active'],
    },
    actionContinuity: { cycleCount: 3, lastResolutionId: 'old', appliedEventEffectIds: ['effect:old'] },
    actionContinuation: { actionId: 'old' },
    opportunityProgress: { cycleCount: 3, completedIds: [], noProgressByTopic: {} },
    eventEffectIds: ['effect:old'],
    stayStreak: 1,
    stayedEver: false,
  };

  it('继承线索/认知/累计进度', () => {
    const next = settleCycleVariables(current);
    expect(next.unlockedClues).toEqual(['c1', 'c2']);
    expect(next.cultClues).toEqual(['x1']);
    expect(next.letterFragments).toEqual(['l1']);
    expect(next.routesLockedEver).toEqual(['A']);
    expect(next.knowledgeEvents).toContain('meet:old-man');
    expect(next.mysteryKnowledge).toEqual({ 'fact-1': 'clue' });
    expect(next.playerNameKnownByNpcIds).toEqual([]);
    expect(next.worldMemory.softCanonFacts).toContainEqual(expect.objectContaining({ factId: 'soft:coffee' }));
    expect(next.worldMemory.events).toContainEqual(expect.objectContaining({ eventId: 'turn:old' }));
    expect(next.worldMemory.cognition).toContainEqual(expect.objectContaining({ cognitionId: 'player|fact:fact-1' }));
    expect(next.worldMemory.cognition.some((item: { cognitionId: string }) => item.cognitionId === 'detective-b|fact:fact-1')).toBe(false);
    expect(next.worldMemory.disclosures).toHaveLength(1);
    expect(next.worldMemory.commitments).toContainEqual(expect.objectContaining({ id: 'commitment:active', status: 'expired', expiredReason: 'reset' }));
    expect(next.worldMemory.commitments).toContainEqual(expect.objectContaining({ id: 'commitment:fulfilled', status: 'fulfilled' }));
    expect(next.worldMemory.acknowledgedCommitmentBoundaryIds).toEqual([]);
  });

  it('重置当日状态且 cycleCount+1', () => {
    const next = settleCycleVariables(current);
    expect(next.cycleCount).toBe(4);
    expect(next.stamina).toBe(100);
    expect(next.sanity).toBe(70);
    expect(next.tripProgress).toBe(0);
    expect(next.lockedRoute ?? null).toBeNull();
    expect(next.overlay ?? null).toBeNull();
    expect(next.finalChoice ?? null).toBeNull();
    expect(next.location).toBe('home');
    expect(next.suspicion['old-man']).toBe(50);
    expect(next.loopSuspicionStart['old-man']).toBe(50);
    expect(next.time).toBe('2024-09-09T08:00:00');
    expect(next.actionContinuity).toBeUndefined();
    expect(next.actionContinuation).toBeUndefined();
    expect(next.opportunityProgress).toBeUndefined();
    expect(next.eventEffectIds).toBeUndefined();
  });

  it('stayed 累加 stayStreak，满3轮标记 stayedEver', () => {
    expect(settleCycleVariables(current, { stayed: true }).stayStreak).toBe(2);
    expect(settleCycleVariables(current).stayStreak).toBe(0);
    const third = settleCycleVariables({ ...current, stayStreak: 2 }, { stayed: true });
    expect(third.stayStreak).toBe(3);
    expect(third.stayedEver).toBe(true);
  });

  it('stayedEver 一旦为真不会回退', () => {
    expect(settleCycleVariables({ ...current, stayedEver: true }).stayedEver).toBe(true);
  });
});

describe('getCycleMetaOptions', () => {
  it('初始不提供元层选项', () => {
    expect(getCycleMetaOptions(createDefaultVariables(), [])).toEqual([]);
  });

  it('锁定过路线且见过3结局时在家提供 STAY 选项', () => {
    const vars = { ...createDefaultVariables(), routesLockedEver: ['A'], location: 'home' };
    expect(getCycleMetaOptions(vars, ['A-1', 'A-2', 'B-1'])).toEqual([STAY_OPTION_TEXT]);
    expect(getCycleMetaOptions({ ...vars, location: 'school' }, ['A-1', 'A-2', 'B-1'])).toEqual([]);
    expect(getCycleMetaOptions(vars, ['A-1'])).toEqual([]);
  });

  it('三线锁定且曾 STAY 时提供告别选项', () => {
    const vars = {
      ...createDefaultVariables(),
      routesLockedEver: ['A', 'B', 'C'],
      stayedEver: true,
      location: 'home',
    };
    const options = getCycleMetaOptions(vars, ['A-1', 'B-1', 'C-1', 'STAY']);
    expect(options).toContain(GOODBYE_OPTION_TEXT);
  });
});

describe('buildCycleOpeningMaintext', () => {
  it('包含轮回过场与次数', () => {
    const text = buildCycleOpeningMaintext(4, 'stamina');
    expect(text).toContain('loop-transition');
    expect(text).toContain('第 4 次');
    expect(text).toContain('bedroom1-day');
  });

  it('把上一行动、重置和新日计划调整连成一段', () => {
    const text = buildCycleOpeningMaintext(4, 'day-end', {
      lastPlayerChoice: '在水塔下等赵刚',
      lastTurnSummary: '赵刚没有赴约，午夜已经到来',
    });
    expect(text).toContain('确实尝试了');
    expect(text).toContain('早上8:00');
    expect(text).toContain('重置作废');
    expect(text).toContain('赵刚没有赴约');
  });
});

describe('cycle action UI reset', () => {
  it('clears the prior day outcome and continuation binding from the live scene bridge', async () => {
    const baseline = useGameStore.getState();
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: null, chats: [] },
      api: {
        ...state.api,
        parsedContent: {
          ...state.api.parsedContent,
          options: ['继续未完成的行动'],
          actionOutcome: {
            resolutionId: 'old', actionId: 'old-action', executedMinutes: 30,
            executedWorkMinutes: 30, executedTravelMinutes: 0,
            endTime: '2024-09-09T16:00:00', staminaDelta: -4, sanityDelta: 0,
          },
          optionBindings: [{
            optionIndex: 0, optionText: '继续未完成的行动',
            actionId: 'old-action', continuationId: 'old-action',
          }],
        },
      },
    }));

    await startNextCycle({ variables: { ...createDefaultVariables(), cycleCount: 2 }, reason: 'day-end' });

    const parsed = useGameStore.getState().api.parsedContent;
    expect(parsed.options).toEqual([]);
    expect(parsed.actionOutcome).toBeUndefined();
    expect(parsed.optionBindings).toBeUndefined();
    useGameStore.setState(baseline, true);
  });
});
