import { afterEach, expect, it, vi } from 'vitest';
import { callSecondaryApi } from '../../sillytavern/api-router';
import { createDefaultVariables } from '../../sillytavern/vars-merger';
import { runStateAgent } from './state-agent';

vi.mock('../../sillytavern/api-router', () => ({ callSecondaryApi: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('keeps player intent separate, rejects player-only evidence, and excludes accumulated memory from the request', async () => {
  vi.mocked(callSecondaryApi).mockResolvedValue(JSON.stringify({
    patch: { suspicion: { 'old-man': 10 } },
    evidence: [{ path: 'suspicion.old-man', quote: '老人的证词前后矛盾', evidenceId: 'fact:F001' }],
  }));
  const result = await runStateAgent({
    api: { baseUrl: 'https://example.invalid', apiKey: 'test', model: 'state-request-test' }, preset: null,
    currentVariables: { ...createDefaultVariables(), worldMemory: { text: 'x'.repeat(20000) } },
    gameStatus: { time: new Date('2026-01-01T08:00:00Z'), stamina: 100, sanity: 100, items: [] },
    playerInput: '我猜老人的证词前后矛盾', narrative: '没有找到新的证据。',
    evidenceAuthority: { newEvidence: [{ id: 'fact:F001', actorIds: ['old-man'], text: '老人的证词前后矛盾' }] },
  });
  expect(result.vars['suspicion.old-man']).toBeUndefined();
  const request = vi.mocked(callSecondaryApi).mock.calls[0];
  const payload = JSON.parse(request[1][1].content);
  expect(payload.currentState.variables.worldMemory).toBeUndefined();
  expect(payload.currentState.variables.mysteryKnowledge).toBeUndefined();
  expect(payload.playerInput).toBe('我猜老人的证词前后矛盾');
  expect(payload.narrative).toBe('没有找到新的证据。');
  expect(request[3]?.maxTokens).toBe(40000);
});
