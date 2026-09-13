import { describe, expect, it } from 'vitest';
import { assertTurnActive, runStateWithFallback } from './turn-lifecycle';

describe('turn ownership at state completion', () => {
  it.each(['cancel', 'session-switch'] as const)('never falls back or commits after %s during State', async change => {
    const controller = new AbortController();
    let current = true;
    let reject!: (error: Error) => void;
    let fallbackCalls = 0;
    const pending = runStateWithFallback(() => new Promise((_resolve, no) => { reject = no; }),
      () => { fallbackCalls++; return {}; }, () => assertTurnActive(controller.signal, () => current));
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'abort' });
    if (change === 'cancel') controller.abort(); else current = false;
    reject(new Error('state transport failed'));
    await assertion;
    expect(fallbackCalls).toBe(0);
  });
});
