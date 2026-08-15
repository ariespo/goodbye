import { describe, it, expect } from 'vitest';
import { createDefaultEndings } from '../stores/gameStore';
import { checkEndingConditions } from './ending-checker';
import { variablesToEndingContext } from './vars-merger';
import type { DynamicRecord } from './types';

const endings = createDefaultEndings();

function contextWith(vars: DynamicRecord, endingsSeen: string[] = []) {
  return variablesToEndingContext(vars, endingsSeen);
}

describe('default endings (三层体系)', () => {
  it('包含全部17个结局且无旧 D/E 体系残留', () => {
    const ids = endings.map(e => e.id);
    expect(ids).toEqual([
      'A-1', 'A-2', 'B-1', 'B-2', 'C-1', 'C-2',
      'N-1', 'N-2', 'F-1', 'F-2',
      'X-1', 'X-2', 'P-1', 'P-2',
      'STAY', 'TRUE', 'LOOP',
    ]);
    expect(endings.some(e => (e.truthType as string) === 'D' || (e.truthType as string) === 'E')).toBe(false);
  });

  it('binds the first ending CG batch to dedicated backgrounds', () => {
    const backgrounds = Object.fromEntries(endings.map(ending => [ending.id, ending.backgroundImage]));
    expect(backgrounds).toMatchObject({
      'C-1': 'ending-c-1',
      'F-1': 'ending-f-1',
      LOOP: 'ending-loop',
      STAY: 'ending-stay',
      TRUE: 'ending-true',
    });
  });

  it('锁定A线+报警 → A-1；叠加CULT后同条件不再触发A-1', () => {
    const real = contextWith({ lockedRoute: 'A', finalChoice: 'report' });
    expect(checkEndingConditions(real, endings)?.id).toBe('A-1');

    const cult = contextWith({
      lockedRoute: 'A',
      overlay: 'CULT',
      cultClues: ['c1', 'c2', 'c3'],
      finalChoice: 'destroy',
    });
    expect(checkEndingConditions(cult, endings)?.id).toBe('X-1');
  });

  it('锁定C线+PSYCH叠加+wake → P-1；无叠加+accept → C-1', () => {
    const psych = contextWith({
      lockedRoute: 'C',
      overlay: 'PSYCH',
      worldGlitchClues: ['g1', 'g2', 'g3'],
      finalChoice: 'wake',
    });
    expect(checkEndingConditions(psych, endings)?.id).toBe('P-1');

    const real = contextWith({ lockedRoute: 'C', finalChoice: 'accept' });
    expect(checkEndingConditions(real, endings)?.id).toBe('C-1');
  });

  it('无凶手线需要集齐3片告别信', () => {
    const incomplete = contextWith({ lockedRoute: 'NONE', letterFragments: ['l1'], finalChoice: 'letgo' });
    expect(checkEndingConditions(incomplete, endings)).toBeNull();

    const complete = contextWith({ lockedRoute: 'NONE', letterFragments: ['l1', 'l2', 'l3'], finalChoice: 'letgo' });
    expect(checkEndingConditions(complete, endings)?.id).toBe('N-1');
  });

  it('假死线需要3条证据', () => {
    const ctx = contextWith({ lockedRoute: 'FAKE', fakeEvidence: ['e1', 'e2', 'e3'], finalChoice: 'release' });
    expect(checkEndingConditions(ctx, endings)?.id).toBe('F-1');
  });

  it('STAY 由连续陪伴触发，TRUE 需三路线+曾STAY+告别', () => {
    const stay = contextWith({ stayStreak: 3 });
    expect(checkEndingConditions(stay, endings)?.id).toBe('STAY');

    const truePartial = contextWith({
      routesLockedEver: ['A', 'B'],
      stayedEver: true,
      finalChoice: 'goodbye',
    });
    expect(checkEndingConditions(truePartial, endings)?.id).not.toBe('TRUE');

    const trueCtx = contextWith({
      routesLockedEver: ['A', 'B', 'C'],
      stayedEver: true,
      finalChoice: 'goodbye',
    });
    expect(checkEndingConditions(trueCtx, endings)?.id).toBe('TRUE');
  });

  it('第7轮无锁定路线 → LOOP；锁定过路线则不触发', () => {
    const stuck = contextWith({ cycleCount: 7 });
    expect(checkEndingConditions(stuck, endings)?.id).toBe('LOOP');

    const locked = contextWith({ cycleCount: 7, routesLockedEver: ['B'] });
    expect(checkEndingConditions(locked, endings)?.id ?? null).toBeNull();
  });

  it('lockedRoute 写入时自动累计到 routesLockedEver', () => {
    const ctx = contextWith({ lockedRoute: 'B' });
    expect(ctx.routesLockedEver).toContain('B');
    expect(ctx.routesLockedCount).toBe(1);
  });
});
