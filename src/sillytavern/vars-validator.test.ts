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
    expect(result.vars['suspicion.clerk']).toBe(25);
  });

  it('tripProgress 不允许下降', () => {
    const current = { ...createDefaultVariables(), tripProgress: 60 };
    const result = sanitizeVarsPatch({ tripProgress: 30 }, current);
    expect(result.vars['tripProgress']).toBe(60);
  });

  it('怀疑度不足时拒绝锁定路线', () => {
    const result = sanitizeVarsPatch({ lockedRoute: 'A' }, createDefaultVariables());
    expect(result.vars.lockedRoute).toBeUndefined();
    expect(result.rejected[0].path).toBe('lockedRoute');
  });

  it('怀疑度达标(含本回合增量)时允许锁定', () => {
    const current = { ...createDefaultVariables(), suspicion: { 'old-man': 45 } };
    const result = sanitizeVarsPatch({ suspicion: { 'old-man': 50 }, lockedRoute: 'A' }, current);
    expect(result.vars.lockedRoute).toBe('A');
  });

  it('已锁定路线不可改写', () => {
    const current = { ...createDefaultVariables(), lockedRoute: 'A', suspicion: { 'detective-a': 50 } };
    const result = sanitizeVarsPatch({ lockedRoute: 'B' }, current);
    expect(result.vars.lockedRoute).toBeUndefined();
    expect(result.rejected[0].reason).toContain('已锁定');
  });

  it('CULT 叠加需要 A线+4轮+3线索', () => {
    const insufficient = sanitizeVarsPatch(
      { overlay: 'CULT' },
      { ...createDefaultVariables(), lockedRoute: 'A', cycleCount: 4, cultClues: ['c1'] },
    );
    expect(insufficient.vars.overlay).toBeUndefined();

    const ok = sanitizeVarsPatch(
      { overlay: 'CULT' },
      { ...createDefaultVariables(), lockedRoute: 'A', cycleCount: 4, cultClues: ['c1', 'c2', 'c3'] },
    );
    expect(ok.vars.overlay).toBe('CULT');
  });

  it('PSYCH 叠加需要 C线+低理智+3异样线索', () => {
    const ok = sanitizeVarsPatch(
      { overlay: 'PSYCH' },
      { ...createDefaultVariables(), lockedRoute: 'C', sanity: 15, worldGlitchClues: ['g1', 'g2', 'g3'] },
    );
    expect(ok.vars.overlay).toBe('PSYCH');

    const highSanity = sanitizeVarsPatch(
      { overlay: 'PSYCH' },
      { ...createDefaultVariables(), lockedRoute: 'C', sanity: 50, worldGlitchClues: ['g1', 'g2', 'g3'] },
    );
    expect(highSanity.vars.overlay).toBeUndefined();
  });

  it('NONE 需要三片信、完整行程且无人怀疑度达到锁线值', () => {
    const ready = {
      ...createDefaultVariables(),
      tripProgress: 100,
      letterFragments: ['bedroom', 'tower', 'door'],
    };
    expect(sanitizeVarsPatch({ lockedRoute: 'NONE' }, ready).vars.lockedRoute).toBe('NONE');

    const accused = {
      ...ready,
      suspicion: { ...createDefaultVariables().suspicion, 'old-man': 50 },
    };
    expect(sanitizeVarsPatch({ lockedRoute: 'NONE' }, accused).vars.lockedRoute).toBeUndefined();
  });

  it('FAKE 需要至少三条假死证据', () => {
    const ready = {
      ...createDefaultVariables(),
      fakeEvidence: ['body', 'ticket', 'sighting'],
    };
    expect(sanitizeVarsPatch({ lockedRoute: 'FAKE' }, ready).vars.lockedRoute).toBe('FAKE');
    expect(sanitizeVarsPatch(
      { lockedRoute: 'FAKE' },
      { ...createDefaultVariables(), fakeEvidence: ['body', 'ticket'] },
    ).vars.lockedRoute).toBeUndefined();
  });

  it('线索数组过滤非字符串项', () => {
    const result = sanitizeVarsPatch({ unlockedClues: ['clue-1', 42, null, 'clue-2'] }, createDefaultVariables());
    expect(result.vars['unlockedClues']).toEqual(['clue-1', 'clue-2']);
  });

  it('finalChoice/location/time 自由通过', () => {
    const result = sanitizeVarsPatch(
      { finalChoice: 'report', location: 'water-tower', time: '2024-09-09T15:00:00' },
      createDefaultVariables(),
    );
    expect(result.vars.finalChoice).toBe('report');
    expect(result.rejected).toHaveLength(0);
  });
});
