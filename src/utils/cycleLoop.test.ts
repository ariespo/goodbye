import { describe, it, expect } from 'vitest';
import {
  checkCycleFailure,
  settleCycleVariables,
  getCycleMetaOptions,
  buildCycleOpeningMaintext,
  STAY_OPTION_TEXT,
  GOODBYE_OPTION_TEXT,
} from './cycleLoop';
import { createDefaultVariables } from '../sillytavern/vars-merger';

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
    cycleCount: 2,
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
    worldMemory: { ...createDefaultVariables().worldMemory, softCanonFacts: [{ factId: 'soft:coffee' }] },
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
    expect(next.playerNameKnownByNpcIds).toEqual(['detective-b']);
    expect(next.worldMemory.softCanonFacts).toEqual([{ factId: 'soft:coffee' }]);
  });

  it('重置当日状态且 cycleCount+1', () => {
    const next = settleCycleVariables(current);
    expect(next.cycleCount).toBe(3);
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
