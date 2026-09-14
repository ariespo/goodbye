import { describe, expect, it } from 'vitest';
import {
  assessFullDayAcceptance,
  assertAcceptanceOverrides,
  assertResumeCompatible,
  buildEvaluationProvenance,
  classifyCycleReset,
  compareQuoteToResolution,
  diffPersistedEvidence,
  parseDayMode,
  sameActionRequestIdentity,
  serializeScrubbed,
  snapshotPersistedEvidence,
  summarizeAuditRows,
} from './live-day-evaluation-harness';

const commit = '1234567890abcdef1234567890abcdef12345678';

describe('live day evaluation harness policy', () => {
  it('rejects unknown DAY_MODE values instead of silently mapping them to standard', () => {
    expect(() => parseDayMode('typo')).toThrow(/Unsupported DAY_MODE/);
    expect(parseDayMode(undefined)).toMatchObject({ requestedMode: 'standard', policyMode: 'standard' });
    expect(parseDayMode('strict')).toMatchObject({ requestedMode: 'strict', policyMode: 'strict' });
  });

  it('labels raw legacy compatibility without claiming it is a native mode', () => {
    expect(parseDayMode('legacy')).toEqual({
      requestedMode: 'legacy',
      settingsValue: 'legacy',
      policyMode: 'standard',
      compatibility: 'raw-legacy-compatibility',
    });
  });

  it('prohibits active diagnostic review overrides in acceptance runs', () => {
    expect(() => assertAcceptanceOverrides(true, { DAY_STYLE_OBSERVE: '1' })).toThrow(/DAY_STYLE_OBSERVE/);
    expect(() => assertAcceptanceOverrides(true, { DAY_STYLE_DIAGNOSTIC: '1' })).toThrow(/DAY_STYLE_DIAGNOSTIC/);
    expect(() => assertAcceptanceOverrides(true, { DAY_STYLE_OBSERVE: '0' })).not.toThrow();
    expect(() => assertAcceptanceOverrides(false, { DAY_STYLE_OBSERVE: '1' })).not.toThrow();
  });

  it('rejects checkpoint resume across commit, config, or cycle provenance', () => {
    const expected = buildEvaluationProvenance({
      testedCommit: commit, profile: 'program-menu', mode: parseDayMode('standard'),
      model: 'route-a', baseUrl: 'https://gateway.example/v1', maxTurns: 90, runTag: 'sample', baselineCycle: 3,
    });
    const checkpoint = { provenance: expected, baselineCycle: 3, currentCycle: 4,
      tavern: { variables: { cycleCount: 4 } } };
    const result = { provenance: expected, startState: { cycleCount: 3 }, finalState: { cycleCount: 4 } };
    expect(() => assertResumeCompatible({ expected, checkpoint, result })).not.toThrow();
    expect(() => assertResumeCompatible({
      expected: { ...expected, testedCommit: 'abcdef1234567890abcdef1234567890abcdef12' }, checkpoint, result,
    })).toThrow(/tested commit/);
    expect(() => assertResumeCompatible({ expected, checkpoint: {
      ...checkpoint, provenance: { ...expected, model: 'route-b' },
    }, result })).toThrow(/configuration/);
    expect(() => assertResumeCompatible({ expected, checkpoint: {
      ...checkpoint, currentCycle: 5,
    }, result })).toThrow(/cycle provenance/);
  });

  it('scrubs secrets from checkpoint payloads as well as result payloads', () => {
    const serialized = serializeScrubbed({ error: 'request key-live-secret failed', nested: ['key-live-secret'] }, ['key-live-secret']);
    expect(serialized).not.toContain('key-live-secret');
    expect(serialized).toContain('[redacted]');
  });
});

describe('live day evidence snapshots', () => {
  it('captures bounded persisted action, opportunity, and character evidence without unrelated settings', () => {
    const evidence = snapshotPersistedEvidence({
      apiKey: 'do-not-copy',
      actionContinuity: { cycleCount: 3, lastResolutionId: 'resolution-7', settledResolutionIds: ['resolution-7'] },
      opportunityProgress: { cycleCount: 3, completedIds: ['school-question'], noProgressByTopic: { school: 1 } },
      worldMemory: {
        version: 2, canonicalTruthVersion: 'truth-v1',
        events: [{ eventId: 'event-7', summary: 'accepted event' }],
        cognition: [{ cognitionId: 'fumi|heard:x', evidenceSpans: [{ lineIndex: 1, quote: '我听见了。' }] }],
        disclosures: [{ id: 'disclosure-7', evidenceQuote: '我告诉你。' }],
        commitments: [{ id: 'commitment-7', status: 'active', evidenceQuote: '我会去。' }],
      },
    });
    expect(evidence).toMatchObject({
      actionContinuity: { lastResolutionId: 'resolution-7' },
      opportunityProgress: { completedIds: ['school-question'] },
      characterContinuity: {
        version: 2,
        events: { total: 1, items: [{ eventId: 'event-7' }] },
        cognition: { total: 1, items: [{ cognitionId: 'fumi|heard:x' }] },
        disclosures: { total: 1, items: [{ id: 'disclosure-7' }] },
        commitments: { total: 1, items: [{ id: 'commitment-7' }] },
      },
    });
    expect(JSON.stringify(evidence)).not.toContain('do-not-copy');
  });

  it('requires exact program-menu action metadata identity across retry', () => {
    const request = { inputOrigin: 'menu', originalInput: '询问门卫', resumeActionId: 'continuation-1',
      selection: { actionId: 'school-question', opportunityId: 'opportunity:F002:clue', kind: 'inquiry',
        scope: 'normal', locationId: 'school', requestedMinutes: 55 } };
    expect(sameActionRequestIdentity(request, structuredClone(request))).toBe(true);
    expect(sameActionRequestIdentity(request, { ...request,
      selection: { ...request.selection, actionId: 'invented-retry-id' } })).toBe(false);
  });

  it('derives auditable persisted continuity deltas from stable record identities', () => {
    const before = snapshotPersistedEvidence({ worldMemory: { version: 2,
      events: [{ eventId: 'event-1' }], cognition: [{ cognitionId: 'player|fact:a' }],
      disclosures: [], commitments: [{ id: 'promise-1', status: 'active' }] } });
    const after = snapshotPersistedEvidence({ worldMemory: { version: 2,
      events: [{ eventId: 'event-1' }, { eventId: 'event-2' }],
      cognition: [{ cognitionId: 'player|fact:a' }, { cognitionId: 'guard|heard:a' }],
      disclosures: [{ id: 'disclosure-2' }],
      commitments: [{ id: 'promise-1', status: 'fulfilled' }] } });
    expect(diffPersistedEvidence(before, after)).toEqual({
      eventIds: ['event-2'], cognitionIds: ['guard|heard:a'], disclosureIds: ['disclosure-2'],
      commitmentChanges: [{ id: 'promise-1', beforeStatus: 'active', afterStatus: 'fulfilled' }],
    });
  });

  it('records the menu price beside actual travel, work, and resource settlement', () => {
    expect(compareQuoteToResolution({ quote: { workMinutes: 55, travelMinutes: 15, totalMinutes: 70, staminaCost: 7 } }, {
      id: 'resolution-quote', plannedMinutes: 70, executedMinutes: 45,
      segments: [
        { step: { kind: 'travel' }, plannedMinutes: 15, executedMinutes: 15 },
        { step: { kind: 'investigation' }, plannedMinutes: 55, executedMinutes: 30 },
      ],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 96, sanity: 70 } },
    })).toEqual({
      quoted: { workMinutes: 55, travelMinutes: 15, totalMinutes: 70, staminaCost: 7 },
      actual: { workMinutes: 30, travelMinutes: 15, totalMinutes: 45, staminaCost: 4, sanityCost: 0 },
      completion: 'partial',
    });
  });
});

describe('full-day classification and audit statistics', () => {
  it('recognizes only a natural baseline-relative cycle 3 to 4 calendar completion', () => {
    expect(classifyCycleReset({ reason: 'day-end', beforeResetTime: '2024-09-10T00:00:00',
      afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4 }))
      .toBe('completed-calendar-day');
    expect(classifyCycleReset({ reason: 'stamina-depleted', beforeResetTime: '2024-09-09T14:00:00.000Z',
      afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4 }))
      .toBe('early-resource-reset:stamina-depleted');
    expect(classifyCycleReset({ reason: 'day-end', beforeResetTime: '2024-09-09T14:00:00.000Z',
      afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4 }))
      .toBe('invalid-calendar-reset');
  });

  it('does not accept one row, a turn cap, a provider error, or an early reset as a full day', () => {
    expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 1,
      stopReason: 'completed-calendar-day' }).passed).toBe(false);
    for (const stopReason of ['turn-cap', 'provider-insufficient-balance', 'provider-proxy-error',
      'early-resource-reset:stamina-depleted']) {
      expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 12, stopReason }).passed)
        .toBe(false);
    }
    expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 12,
      stopReason: 'completed-calendar-day' })).toEqual({ passed: true, reasons: [] });
  });

  it('treats 5-8 investigations and 10-16 major actions as reported targets rather than caps', () => {
    const resolution = (id: string, kind: string, executedMinutes: number) => ({
      id, plannedMinutes: executedMinutes, executedMinutes,
      segments: [{ step: { kind }, plannedMinutes: executedMinutes, executedMinutes, completed: true }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } },
    });
    const rows = [
      ...Array.from({ length: 9 }, (_, index) => ({ success: true, metrics: { playableMs: 1000 + index },
        calls: [{ status: 200, totalMs: 500 + index }], resolvedAction: resolution(`investigate-${index}`, 'investigation', 55) })),
      ...Array.from({ length: 8 }, (_, index) => ({ success: true, metrics: { playableMs: 2000 + index },
        calls: [{ status: 200, totalMs: 700 + index }], resolvedAction: resolution(`wait-${index}`, 'wait', 30) })),
      { success: false, retry: true, retryIdentityMatches: false, error: 'provider timeout',
        calls: [{ status: 503, providerError: 'busy' }] },
    ];
    const summary = summarizeAuditRows(rows);
    expect(summary).toMatchObject({
      successfulTurns: 17,
      verifiedInvestigationActions: 9,
      verifiedMajorActions: 17,
      targets: { investigations: { status: 'above-target' }, majorActions: { status: 'above-target' } },
      provider: { calls: 18, statuses: { '200': 17, '503': 1 }, errorCalls: 1 },
      retries: { attempts: 1, identityMismatches: 1 },
      failures: 1,
    });
    expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 17,
      stopReason: 'completed-calendar-day' }).passed).toBe(true);
  });

  it('requires actual program-menu coverage when that profile is requested', () => {
    expect(assessFullDayAcceptance({ baselineCycle: 1, finalCycle: 2, successfulRows: 10,
      stopReason: 'completed-calendar-day', programMenuRequired: true, programMenuSelections: 0 }).passed).toBe(false);
  });
});
