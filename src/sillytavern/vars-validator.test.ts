import { describe, it, expect } from 'vitest';
import { sanitizeVarsPatch } from './vars-validator';
import { createDefaultVariables } from './vars-merger';

describe('sanitizeVarsPatch', () => {
  it('剥除程序专有字段', () => {
    const result = sanitizeVarsPatch(
      { cycleCount: 5, stayStreak: 3, stayedEver: true, routesLockedEver: ['A'], stamina: 90 },
      createDefaultVariables(),
    );
    expect(result.vars).toEqual({ stamina: 90 });
    expect(result.rejected).toHaveLength(4);
  });

  it('拒绝白名单外的字段', () => {
    const result = sanitizeVarsPatch({ hackerField: 1, suspicion: { ghost: 50 } }, createDefaultVariables());
    expect(result.vars).toEqual({});
    expect(result.rejected.map(r => r.path)).toEqual(['hackerField', 'suspicion.ghost']);
  });

  it('数值超范围与超增幅被钳制', () => {
    const current = { ...createDefaultVariables(), sanity: 80 };
    const result = sanitizeVarsPatch({ sanity: 10, suspicion: { 'old-man': 40 } }, current);
    // sanity 80→10 超过单回合 15 上限,钳到 65
    expect(result.vars['sanity']).toBe(65);
    // suspicion 0→40 超过 15 上限,钳到 15
    expect(result.vars['suspicion.old-man']).toBe(15);
    expect(result.clamped).toHaveLength(2);
  });

  it('烟雾弹角色怀疑度上限 25', () => {
    const current = { ...createDefaultVariables(), suspicion: { clerk: 20 } };
    const result = sanitizeVarsPatch({ suspicion: { clerk: 35 } }, current);
    expect(result.vars['suspicion.clerk']).toBe(20);
  });

  it('同一完整日内同一角色累计最多增加 15', () => {
    const current = {
      ...createDefaultVariables(),
      suspicion: { ...createDefaultVariables().suspicion, 'old-man': 14 },
      loopSuspicionStart: { ...createDefaultVariables().loopSuspicionStart, 'old-man': 0 },
    };
    const result = sanitizeVarsPatch({ suspicion: { 'old-man': 30 } }, current);
    expect(result.vars['suspicion.old-man']).toBe(15);
  });

  it('拒绝模型写入由事实授权派生的 tripProgress', () => {
    const current = { ...createDefaultVariables(), tripProgress: 60 };
    const result = sanitizeVarsPatch({ tripProgress: 30 }, current);
    expect(result.vars['tripProgress']).toBeUndefined();
    expect(result.rejected).toContainEqual(expect.objectContaining({ path: 'tripProgress' }));
  });

  it('路线、解释层和最终选择全部拒绝由编剧写入', () => {
    const result = sanitizeVarsPatch(
      { lockedRoute: 'A', overlay: 'CULT', finalChoice: 'report', location: 'water-tower' },
      createDefaultVariables(),
    );
    expect(result.vars).toEqual({ location: 'water-tower' });
    expect(result.rejected.map(item => item.path)).toEqual(['lockedRoute', 'overlay', 'finalChoice']);
    expect(result.rejected.every(item => item.reason.includes('程序专有'))).toBe(true);
  });

  it('拒绝模型写入线索事实集合', () => {
    const result = sanitizeVarsPatch({ unlockedClues: ['clue-1', 42, null, 'clue-2'] }, createDefaultVariables());
    expect(result.vars['unlockedClues']).toBeUndefined();
    expect(result.rejected).toContainEqual(expect.objectContaining({ path: 'unlockedClues' }));
  });

  it('location/time 自由通过', () => {
    const result = sanitizeVarsPatch(
      { location: 'water-tower', time: '2024-09-09T15:00:00' },
      createDefaultVariables(),
    );
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects model-written opportunity progress and private selected opportunity state', () => {
    const result = sanitizeVarsPatch({
      opportunityProgress: { cycleCount: 1, completedIds: ['forged'], noProgressByTopic: {} },
      actionContinuity: { cycleCount: 1, selectedOpportunity: {
        id: 'forged', locationId: 'home', publicGoal: '伪造调查', scope: 'normal',
        sourceIds: ['fact:forged:clue'], topicKey: 'forged',
      } },
    }, createDefaultVariables());

    expect(result.vars).toEqual({});
    expect(result.rejected.map(item => item.path)).toEqual([
      'opportunityProgress.cycleCount',
      'opportunityProgress.completedIds',
      'actionContinuity.cycleCount',
      'actionContinuity.selectedOpportunity.id',
      'actionContinuity.selectedOpportunity.locationId',
      'actionContinuity.selectedOpportunity.publicGoal',
      'actionContinuity.selectedOpportunity.scope',
      'actionContinuity.selectedOpportunity.sourceIds',
      'actionContinuity.selectedOpportunity.topicKey',
    ]);
    expect(result.rejected.every(item => item.reason.includes('程序专有'))).toBe(true);
  });

  it('rejects unknown location mutations while accepting registered and street locations', () => {
    const current = { ...createDefaultVariables(), location: 'school' };
    expect(sanitizeVarsPatch({ location: 'police_station' }, current).vars.location).toBeUndefined();
    expect(sanitizeVarsPatch({ location: 'supermarket' }, current).vars.location).toBe('supermarket');
    expect(sanitizeVarsPatch({ location: 'street' }, current).vars.location).toBe('school');
  });

  it('strips forged fact authority and derived ending progress from nested legacy model output', () => {
    const result = sanitizeVarsPatch({
      mysteryKnowledge: { 'a-murder-staged-fall': 'confirmation' },
      unlockedClues: ['a-murder-staged-fall'],
      cultClues: ['cult-symbol-sun-room'],
      worldGlitchClues: ['psych-doctor-badge'],
      fakeEvidence: ['fake-body-mismatch'],
      letterFragments: ['none-letter-water-tower'],
      tripProgress: 100,
    }, { ...createDefaultVariables(), cycleCount: 4 });

    expect(result.vars).toEqual({});
    expect(result.rejected.map(item => item.path)).toEqual([
      'mysteryKnowledge.a-murder-staged-fall',
      'unlockedClues',
      'cultClues',
      'worldGlitchClues',
      'fakeEvidence',
      'letterFragments',
      'tripProgress',
    ]);
  });

  it('strips dotted fact authority paths from legacy model output', () => {
    const result = sanitizeVarsPatch({
      'mysteryKnowledge.a-murder-staged-fall': 'confirmation',
      'unlockedClues.0': 'a-murder-staged-fall',
      'tripProgress.value': 100,
    }, createDefaultVariables());

    expect(result.vars).toEqual({});
    expect(result.rejected.map(item => item.path)).toEqual([
      'mysteryKnowledge.a-murder-staged-fall',
      'unlockedClues.0',
      'tripProgress.value',
    ]);
  });

  it('lets the UI organize only clues that program state already knows', () => {
    const knownClue = {
      id: 'known-clue', title: '衣柜空位', description: '衣柜里少了一条围裙。', source: '观察', createdAt: 1,
    };
    const forgedClue = {
      id: 'forged-clue', title: '真相', description: '周德明推落了文穗。', source: '模型', createdAt: 2,
    };
    const current = {
      ...createDefaultVariables(),
      unlockedClues: ['known-clue'],
      organizedClues: [knownClue],
    };
    const result = sanitizeVarsPatch({
      organizedClues: [knownClue, forgedClue],
    }, current);

    expect(result.vars.organizedClues).toEqual([knownClue]);
    expect(result.rejected).toContainEqual(expect.objectContaining({ path: 'organizedClues.1' }));
  });
});
