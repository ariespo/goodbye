import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const script = resolve('scripts/summarize-live-day-evaluation.cjs');

function runSummary(sample: Record<string, unknown>): Record<string, any> {
  const directory = mkdtempSync(join(tmpdir(), 'farewell-day-summary-'));
  temporaryDirectories.push(directory);
  const root = join(directory, '.codex-test-tmp', 'day-evaluation');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'sample.json'), JSON.stringify(sample));
  execFileSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
  return JSON.parse(readFileSync(join(directory, '.codex-test-tmp', 'day-summary.json'), 'utf8'))[0];
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live day evaluation summary acceptance', () => {
  it('marks one accepted row as incomplete even if the file claims a calendar stop', () => {
    const summary = runSummary({
      profile: 'fast', mode: { requestedMode: 'standard', policyMode: 'standard', compatibility: 'native' },
      provenance: { testedCommit: '1234567890abcdef1234567890abcdef12345678', baselineCycle: 1 },
      diagnosticsEnabled: false, stopReason: 'completed-calendar-day', successful: 1,
      startState: { cycleCount: 1 }, finalState: { cycleCount: 2, time: '2024-09-09T08:00:00.000Z' },
      rows: [{ attempt: 1, turn: 1, success: true, before: { time: '2024-09-09T08:00:00.000Z' },
        after: { time: '2024-09-09T09:00:00.000Z' }, lines: [{ text: '只完成了一回合。' }], calls: [], metrics: {} }],
    });
    expect(summary.acceptance).toMatchObject({ passed: false });
    expect(summary.acceptance.reasons).toContain('a single accepted row is not full-day evidence');
    expect(summary.provenance.testedCommit).toBe('1234567890abcdef1234567890abcdef12345678');
  });

  it('reports actual verified action, retry, call, latency, and target statistics without turning targets into caps', () => {
    const resolvedAction = (id: string, kind: string, startTime: string) => ({ id, startTime,
      endTime: new Date(new Date(startTime).getTime() + 55 * 60_000).toISOString(), plannedMinutes: 55, executedMinutes: 55,
      segments: [{ step: { kind }, plannedMinutes: 55, executedMinutes: 55, completed: true }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } } });
    const rows = Array.from({ length: 17 }, (_, index) => ({
      attempt: index + 1, turn: index + 1, success: true,
      before: { time: `2024-09-09T${String(8 + Math.floor(index / 2)).padStart(2, '0')}:00:00.000Z` },
      after: { time: `2024-09-09T${String(8 + Math.floor(index / 2)).padStart(2, '0')}:55:00.000Z` },
      lines: [{ text: '可审计正文。' }], calls: [{ status: 200, totalMs: 500 }],
      metrics: { playableMs: 1000 + index }, majorActionIdentity: `major-${index}`,
      resolvedAction: resolvedAction(`resolution-${index}`, index < 9 ? 'investigation' : 'wait',
        `2024-09-09T${String(8 + Math.floor(index / 2)).padStart(2, '0')}:00:00`),
    }));
    rows.push({ attempt: 18, turn: 18, success: false, retry: true, retryIdentityMatches: false,
      before: { time: '2024-09-09T23:55:00.000Z' }, after: { time: '2024-09-09T23:55:00.000Z' },
      lines: [], calls: [{ status: 503, providerError: 'busy' }], metrics: {}, error: 'busy',
      resolvedAction: null } as never);
    const summary = runSummary({
      profile: 'program-menu', mode: { requestedMode: 'legacy', policyMode: 'standard',
        compatibility: 'raw-legacy-compatibility' },
      provenance: { testedCommit: '1234567890abcdef1234567890abcdef12345678', baselineCycle: 3 },
      diagnosticsEnabled: false, stopReason: 'completed-calendar-day', successful: 17, programMenuSelections: 4,
      startState: { cycleCount: 3 }, finalState: { cycleCount: 4, time: '2024-09-09T08:00:00.000Z' }, rows,
      storageBoundary: { browserPersistence: 'unverified' },
    });
    expect(summary).toMatchObject({
      mode: { requestedMode: 'legacy', compatibility: 'raw-legacy-compatibility' },
      acceptance: { passed: true },
      audit: {
        verifiedInvestigationActions: 9,
        verifiedMajorActions: 17,
        targets: { investigations: { status: 'above-target' }, majorActions: { status: 'above-target' } },
        provider: { calls: 18, statuses: { '200': 17, '503': 1 }, errorCalls: 1 },
        retries: { attempts: 1, identityMismatches: 1 },
      },
      storageBoundary: { browserPersistence: 'unverified' },
    });
  });

  it('counts partial plus resume once and abandoned follow-up work as a second resolver-input action', () => {
    const resolution = (id: string, startTime: string, planned: number, executed: number) => ({
      id, startTime, endTime: new Date(new Date(startTime).getTime() + executed * 60_000).toISOString(),
      plannedMinutes: planned, executedMinutes: executed,
      segments: [{ step: { kind: 'investigation' }, plannedMinutes: planned, executedMinutes: executed,
        cumulativeExecutedMinutes: executed, completed: executed === planned }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 95, sanity: 70 } },
    });
    const summary = runSummary({
      profile: 'options', diagnosticsEnabled: false, stopReason: 'completed-calendar-day', optionChoiceSelections: 2,
      provenance: { baselineCycle: 3 }, startState: { cycleCount: 3 }, finalState: { cycleCount: 4 },
      rows: [
        { success: true, majorActionIdentity: 'continued-action', calls: [{ status: 200 }],
          resolvedAction: resolution('resolution-partial', '2024-09-09T15:30:00', 90, 30), before: {}, after: {} },
        { success: true, majorActionIdentity: 'continued-action', calls: [{ status: 200 }],
          resolvedAction: resolution('resolution-complete', '2024-09-09T16:00:00', 60, 60), before: {}, after: {} },
        { success: true, majorActionIdentity: null, calls: [{ status: 200 }],
          resolvedAction: resolution('resolution-unclassified', '2024-09-09T18:00:00', 30, 30), before: {}, after: {} },
        { success: true, majorActionIdentity: 'new-work-after-abandon', calls: [{ status: 200 }],
          resolvedAction: resolution('resolution-new-work', '2024-09-09T19:00:00', 30, 30), before: {}, after: {} },
      ],
    });
    expect(summary.audit).toMatchObject({
      investigations: { morningExecutionTurns: 1, wholeDayExecutionTurns: 4 },
      majorActions: { executionTurns: 4, uniqueActionIds: 2, resumedExecutionTurns: 1, unverifiableActionIdentities: 1 },
      targets: { investigations: { value: 1 }, majorActions: { value: 2 } },
      provider: { callClassification: { foreground: 0, background: 0, unclassified: 4 } },
    });
  });

  it('fails acceptance for diagnostics, provider stops, and resource resets', () => {
    for (const sample of [
      { diagnosticsEnabled: true, stopReason: 'completed-calendar-day' },
      { diagnosticsEnabled: false, stopReason: 'provider-insufficient-balance' },
      { diagnosticsEnabled: false, stopReason: 'early-resource-reset:stamina-depleted' },
    ]) {
      const summary = runSummary({ ...sample, profile: 'fast', mode: { requestedMode: 'standard' },
        provenance: { baselineCycle: 1 }, successful: 12, startState: { cycleCount: 1 },
        finalState: { cycleCount: 2 }, rows: Array.from({ length: 12 }, () => ({ success: true, lines: [], calls: [] })) });
      expect(summary.acceptance.passed).toBe(false);
    }
  });
});
