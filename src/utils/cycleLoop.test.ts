import { afterEach, describe, it, expect, vi } from 'vitest';
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
import { compileTurnContext, normalizeWorldMemory } from '../memory/world-memory';
import { useGameStore } from '../stores/gameStore';
import * as database from '../sillytavern/database';
import type { ChatSession } from '../sillytavern/types';

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
    expect(text).not.toContain('确实尝试了');
    expect(text).toContain('早上8:00');
    expect(text).toContain('重置作废');
    expect(text).toContain('赵刚没有赴约');
  });
});

describe('persisted authored loop scenes', () => {
  const baseline = useGameStore.getState();
  afterEach(() => { vi.restoreAllMocks(); useGameStore.setState(baseline, true); });
  function openChat(cycleCount: number) {
    const variables = { ...createDefaultVariables(), cycleCount, time: '2024-09-09T10:00:00' };
    const chat: ChatSession = { id: 'loop-test', name: 'test', messages: [], characterName: 'fumi', userName: 'player',
      presetId: null, lorebookIds: [], variables, createdAt: 1, updatedAt: 1 };
    useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: chat.id, chats: [chat], variables } }));
    return chat;
  }
  it.each([false, true])('only carries the last accepted consequence inside the same story version (ended=%s)', async ended => {
    vi.spyOn(database, 'saveChat').mockResolvedValue();
    const chat = openChat(5);
    const oldText = '旧版本已经确认周德明杀害了文穗。';
    const memory = normalizeWorldMemory({ cycleCount: 5 });
    memory.events.push({ eventId: 'turn:accepted', turnId: 'accepted', turnIndex: 3, cycleCount: 5,
      occurredAt: '2024-09-09T17:05:00', locationId: 'home', actorIds: [], kind: 'narrative-turn',
      summary: oldText, evidenceLineIds: [], factIds: [], tags: [], salience: 0.5, createdAt: 3 });
    Object.assign(chat.variables, { lockedRoute: 'A', finalChoice: ended ? 'report' : null, worldMemory: memory });
    chat.messages = [{ id: 'accepted', role: 'assistant', timestamp: 3, variables: { cycleCount: 5 },
      content: `<sum>${oldText}</sum>`, acceptedActionOutcome: {
        resolutionId: 'resolved', actionId: 'ask', executedMinutes: 5, executedWorkMinutes: 5,
        executedTravelMinutes: 0, endTime: '2024-09-09T17:05:00', staminaDelta: -1, sanityDelta: 0,
      } }];
    await startNextCycle({ variables: settleCycleVariables(chat.variables), reason: 'day-end' });
    const state = useGameStore.getState();
    const history = state.tavern.chats[0].messages;
    const bundle = compileTurnContext({ userInput: '核对周德明的材料', locationId: 'home', activeNpcIds: [],
      history, variables: state.tavern.variables });
    expect(history[0].content).toContain(oldText);
    expect(history.at(-1)!.content.includes(oldText)).toBe(!ended);
    expect(JSON.stringify(state.game.currentScene).includes(oldText)).toBe(!ended);
    const modelContext = { recentHistory: bundle.recentMessages.map(({ role, content }) => ({ role, content })),
      directorMemory: bundle.directorMemory, writerMemory: bundle.writerMemory };
    expect(JSON.stringify(modelContext).includes(oldText)).toBe(!ended);
  });
  it('plays three different reset scenes, stores the boundary note, and carries their ledger to day four', async () => {
    vi.spyOn(database, 'saveChat').mockResolvedValue();
    openChat(1);
    for (const expectedCycle of [2, 3, 4]) {
      await startNextCycle({ variables: settleCycleVariables(useGameStore.getState().tavern.variables), reason: 'stamina' });
      const state = useGameStore.getState();
      expect(state.tavern.variables.cycleCount).toBe(expectedCycle);
      expect(state.game.currentScene?.lines.length).toBeGreaterThan(6);
    }
    const state = useGameStore.getState();
    const messages = state.tavern.chats[0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toContain('熟悉');
    expect(messages[0].content).toContain('去向');
    expect(messages[1].content).toContain('不要替我答应见谁');
    expect(messages[1].variables.mysteryKnowledge['shared-fumi-boundary-note']).toBe('clue');
    expect(messages[1].variables.unlockedClues).toContain('shared-fumi-boundary-note');
    expect(messages[2].content).toContain('身份');
    expect(messages[2].content).toContain('尚未核实');
    expect(state.tavern.variables.storyProgress.presentedBeatIds).toHaveLength(3);
    expect(state.game.currentScene?.lines.some(line => line.text.includes('不要替我答应见谁'))).toBe(true);
  });
  it('cannot turn an orphan player request or an earlier day summary into an executed rescue', async () => {
    vi.spyOn(database, 'saveChat').mockResolvedValue();
    const chat = openChat(3);
    chat.messages = [
      { id: 'earlier', role: 'assistant', content: '<sum>成功把文穗救回家</sum>', timestamp: 1, variables: { cycleCount: 2 } },
      { id: 'orphan', role: 'user', content: '冲进水塔把文穗救出来', timestamp: 2, variables: { cycleCount: 3 } },
    ];
    await startNextCycle({ variables: settleCycleVariables(chat.variables), reason: 'stamina' });
    const text = useGameStore.getState().tavern.chats[0].messages.at(-1)!.content;
    expect(text).not.toContain('成功把文穗救回家');
    expect(text).not.toContain('确实尝试了');
    expect(text).not.toContain('冲进水塔');
    expect(text).toContain('仍没找到一个可靠的时间点');
    expect(text).toContain('尚未收到初步通报');
  });
  it('persists the scene and ledger once when the same reset is called concurrently and again after completion', async () => {
    const writes: ChatSession[] = [];
    vi.spyOn(database, 'saveChat').mockImplementation(async chat => { writes.push(chat); });
    const chat = openChat(2);
    const options = { variables: settleCycleVariables(chat.variables), reason: 'stamina' as const };
    await Promise.all([startNextCycle(options), startNextCycle(options)]);
    useGameStore.setState(state => ({ game: { ...state.game, currentLineIndex: 2 } }));
    await startNextCycle(options);
    expect(writes).toHaveLength(1);
    expect(writes[0].messages).toHaveLength(1);
    expect(writes[0].variables.storyProgress.presentedBeatIds).toHaveLength(1);
    expect(writes[0].variables.mysteryKnowledge['shared-fumi-boundary-note']).toBe('clue');
    expect(useGameStore.getState().game.currentLineIndex).toBe(2);
  });
  it('keeps reset pending on failed persistence and permits a retry', async () => {
    const save = vi.spyOn(database, 'saveChat').mockRejectedValueOnce(new Error('disk failed')).mockResolvedValue();
    const chat = openChat(2);
    useGameStore.setState(state => ({ game: { ...state.game, pendingCycleReset: 'stamina' } }));
    const options = { variables: settleCycleVariables(chat.variables), reason: 'stamina' as const };
    await expect(startNextCycle(options)).rejects.toThrow('disk failed');
    expect(useGameStore.getState().tavern.variables.cycleCount).toBe(2);
    expect(useGameStore.getState().game.pendingCycleReset).toBe('stamina');
    expect(useGameStore.getState().tavern.variables.mysteryKnowledge?.['shared-fumi-boundary-note']).toBeUndefined();
    await startNextCycle(options);
    expect(save).toHaveBeenCalledTimes(2);
    expect(useGameStore.getState().game.pendingCycleReset).toBeNull();
  });
  it('aborts the persistence guard when the active chat changes during a reset', async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    let guard: database.ChatWriteGuard | undefined;
    vi.spyOn(database, 'saveChat').mockImplementation(async (_chat, value) => {
      guard = value; await wait; guard?.assertCurrent();
    });
    const chat = openChat(2);
    const task = startNextCycle({ variables: settleCycleVariables(chat.variables), reason: 'stamina' });
    useGameStore.setState(state => ({ tavern: { ...state.tavern, activeChatId: 'another-chat', variables: { cycleCount: 8 } } }));
    release();
    await expect(task).rejects.toThrow();
    expect(guard?.signal.aborted).toBe(true);
    expect(useGameStore.getState().tavern.variables.cycleCount).toBe(8);
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
