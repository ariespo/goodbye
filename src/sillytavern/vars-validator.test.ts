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

  it('路线、解释层和最终选择全部拒绝由编剧写入', () => {
    const result = sanitizeVarsPatch(
      { lockedRoute: 'A', overlay: 'CULT', finalChoice: 'report', location: 'water-tower' },
      createDefaultVariables(),
    );
    expect(result.vars).toEqual({ location: 'water-tower' });
    expect(result.rejected.map(item => item.path)).toEqual(['lockedRoute', 'overlay', 'finalChoice']);
    expect(result.rejected.every(item => item.reason.includes('程序专有'))).toBe(true);
  });

  it('线索数组过滤非字符串项', () => {
    const result = sanitizeVarsPatch({ unlockedClues: ['clue-1', 42, null, 'clue-2'] }, createDefaultVariables());
    expect(result.vars['unlockedClues']).toEqual(['clue-1', 'clue-2']);
  });

  it('location/time 自由通过', () => {
    const result = sanitizeVarsPatch(
      { location: 'water-tower', time: '2024-09-09T15:00:00' },
      createDefaultVariables(),
    );
    expect(result.rejected).toHaveLength(0);
  });
});
