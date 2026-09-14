export type DayEvaluationMode = 'standard' | 'strict' | 'legacy';

export interface DayModeProvenance {
  requestedMode: DayEvaluationMode;
  settingsValue: DayEvaluationMode;
  policyMode: 'standard' | 'strict';
  compatibility: 'native' | 'raw-legacy-compatibility';
}

export function parseDayMode(value: string | undefined): DayModeProvenance {
  const requestedMode = value === undefined || value === '' ? 'standard' : value;
  if (requestedMode !== 'standard' && requestedMode !== 'strict' && requestedMode !== 'legacy') {
    throw new Error(`Unsupported DAY_MODE ${JSON.stringify(value)}; expected standard, strict, or legacy`);
  }
  return {
    requestedMode,
    settingsValue: requestedMode,
    policyMode: requestedMode === 'strict' ? 'strict' : 'standard',
    compatibility: requestedMode === 'legacy' ? 'raw-legacy-compatibility' : 'native',
  };
}

export function assertAcceptanceOverrides(enabled: boolean, environment: Record<string, string | undefined>): void {
  if (!enabled) return;
  const active = ['DAY_STYLE_OBSERVE', 'DAY_STYLE_DIAGNOSTIC']
    .filter(name => environment[name] === '1');
  if (active.length > 0) {
    throw new Error(`Acceptance runs prohibit diagnostic overrides: ${active.join(', ')}`);
  }
}

export interface EvaluationProvenance {
  schemaVersion: 1;
  testedCommit: string;
  profile: string;
  mode: DayModeProvenance;
  model: string;
  baseUrl: string;
  maxTurns: number;
  runTag: string;
  baselineCycle: number;
}

export function buildEvaluationProvenance(
  input: Omit<EvaluationProvenance, 'schemaVersion'>,
): EvaluationProvenance {
  if (!/^[0-9a-f]{40}$/u.test(input.testedCommit)) {
    throw new Error('testedCommit must be a full lowercase Git SHA');
  }
  if (!Number.isSafeInteger(input.baselineCycle) || input.baselineCycle < 1) {
    throw new Error('baselineCycle must be a positive integer');
  }
  if (!Number.isSafeInteger(input.maxTurns) || input.maxTurns < 1) {
    throw new Error('maxTurns must be a positive integer');
  }
  return { schemaVersion: 1, ...structuredClone(input) };
}

export function assertResumeCompatible(input: {
  expected: EvaluationProvenance;
  checkpoint: unknown;
  result: unknown;
}): void {
  const checkpoint = asRecord(input.checkpoint);
  const result = asRecord(input.result);
  const checkpointProvenance = asRecord(checkpoint.provenance) as Partial<EvaluationProvenance>;
  const resultProvenance = asRecord(result.provenance) as Partial<EvaluationProvenance>;
  if (checkpointProvenance.testedCommit !== input.expected.testedCommit
    || resultProvenance.testedCommit !== input.expected.testedCommit) {
    throw new Error('checkpoint tested commit does not match the current immutable tested commit');
  }
  const withoutCommit = (value: Partial<EvaluationProvenance>) => {
    const { testedCommit: _testedCommit, ...rest } = value;
    return rest;
  };
  const expectedConfig = JSON.stringify(withoutCommit(input.expected));
  if (JSON.stringify(withoutCommit(checkpointProvenance)) !== expectedConfig
    || JSON.stringify(withoutCommit(resultProvenance)) !== expectedConfig) {
    throw new Error('checkpoint configuration does not match the current evaluation configuration');
  }
  const checkpointCycle = finiteNumber(checkpoint.currentCycle);
  const storedCycle = finiteNumber(asRecord(asRecord(checkpoint.tavern).variables).cycleCount);
  const resultStartCycle = finiteNumber(asRecord(result.startState).cycleCount);
  const resultFinalCycle = finiteNumber(asRecord(result.finalState).cycleCount);
  if (finiteNumber(checkpoint.baselineCycle) !== input.expected.baselineCycle
    || resultStartCycle !== input.expected.baselineCycle
    || checkpointCycle === null || checkpointCycle !== storedCycle
    || resultFinalCycle === null || resultFinalCycle !== checkpointCycle) {
    throw new Error('checkpoint cycle provenance is inconsistent');
  }
}

export function serializeScrubbed(value: unknown, secrets: readonly (string | undefined)[]): string {
  let serialized = JSON.stringify(value, null, 2) ?? 'null';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) serialized = serialized.replaceAll(secret, '[redacted]');
  }
  return serialized;
}

const EVIDENCE_LIMIT = 100;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneOrNull(value: unknown): unknown {
  return value && typeof value === 'object' ? structuredClone(value) : null;
}

function evidenceSlice(value: unknown): { total: number; retained: number; truncated: boolean; items: unknown[] } {
  const items = Array.isArray(value) ? value : [];
  const retained = items.slice(-EVIDENCE_LIMIT).map(item => structuredClone(item));
  return { total: items.length, retained: retained.length, truncated: retained.length < items.length, items: retained };
}

export function snapshotPersistedEvidence(variables: unknown): unknown {
  const source = asRecord(variables);
  const memory = asRecord(source.worldMemory);
  return {
    actionContinuity: cloneOrNull(source.actionContinuity),
    opportunityProgress: cloneOrNull(source.opportunityProgress),
    characterContinuity: Object.keys(memory).length === 0 ? null : {
      version: memory.version ?? null,
      canonicalTruthVersion: memory.canonicalTruthVersion ?? null,
      events: evidenceSlice(memory.events),
      cognition: evidenceSlice(memory.cognition),
      disclosures: evidenceSlice(memory.disclosures),
      commitments: evidenceSlice(memory.commitments),
      acknowledgedCommitmentBoundaryIds: Array.isArray(memory.acknowledgedCommitmentBoundaryIds)
        ? structuredClone(memory.acknowledgedCommitmentBoundaryIds) : [],
    },
  };
}

function evidenceItems(snapshot: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const character = asRecord(snapshot.characterContinuity);
  const slice = asRecord(character[key]);
  return Array.isArray(slice.items) ? slice.items.map(asRecord) : [];
}

function newStableIds(before: Record<string, unknown>[], after: Record<string, unknown>[], key: string): string[] {
  const previous = new Set(before.map(item => item[key]).filter((id): id is string => typeof id === 'string'));
  return after.map(item => item[key]).filter((id): id is string => typeof id === 'string' && !previous.has(id));
}

export function diffPersistedEvidence(before: unknown, after: unknown): unknown {
  const previous = asRecord(before);
  const current = asRecord(after);
  const beforeEvents = evidenceItems(previous, 'events');
  const afterEvents = evidenceItems(current, 'events');
  const beforeCognition = evidenceItems(previous, 'cognition');
  const afterCognition = evidenceItems(current, 'cognition');
  const beforeDisclosures = evidenceItems(previous, 'disclosures');
  const afterDisclosures = evidenceItems(current, 'disclosures');
  const beforeCommitments = evidenceItems(previous, 'commitments');
  const afterCommitments = evidenceItems(current, 'commitments');
  const previousCommitmentStatus = new Map(beforeCommitments
    .filter(item => typeof item.id === 'string').map(item => [item.id as string, item.status]));
  return {
    eventIds: newStableIds(beforeEvents, afterEvents, 'eventId'),
    cognitionIds: newStableIds(beforeCognition, afterCognition, 'cognitionId'),
    disclosureIds: newStableIds(beforeDisclosures, afterDisclosures, 'id'),
    commitmentChanges: afterCommitments.flatMap(item => {
      if (typeof item.id !== 'string') return [];
      const beforeStatus = previousCommitmentStatus.get(item.id) ?? null;
      const afterStatus = item.status ?? null;
      return beforeStatus === afterStatus ? [] : [{ id: item.id, beforeStatus, afterStatus }];
    }),
  };
}

export function compareQuoteToResolution(selectedProgramAction: unknown, resolvedAction: unknown): unknown {
  const selected = asRecord(selectedProgramAction);
  const quote = asRecord(selected.quote);
  const resolution = asRecord(resolvedAction);
  const quoted = Object.keys(quote).length === 0 ? null : structuredClone(quote);
  if (Object.keys(resolution).length === 0) return { quoted, actual: null, completion: 'unrecorded' };
  const segments = Array.isArray(resolution.segments) ? resolution.segments.map(asRecord) : [];
  const executedFor = (travel: boolean) => segments
    .filter(segment => (asRecord(segment.step).kind === 'travel') === travel)
    .reduce((total, segment) => total + (finiteNumber(segment.executedMinutes) ?? 0), 0);
  const before = asRecord(asRecord(resolution.resources).before);
  const after = asRecord(asRecord(resolution.resources).after);
  const planned = finiteNumber(resolution.plannedMinutes) ?? 0;
  const executed = finiteNumber(resolution.executedMinutes) ?? 0;
  return {
    quoted,
    actual: {
      workMinutes: executedFor(false),
      travelMinutes: executedFor(true),
      totalMinutes: executed,
      staminaCost: Math.max(0, (finiteNumber(before.stamina) ?? 0) - (finiteNumber(after.stamina) ?? 0)),
      sanityCost: Math.max(0, (finiteNumber(before.sanity) ?? 0) - (finiteNumber(after.sanity) ?? 0)),
    },
    completion: executed < planned ? 'partial' : 'complete',
  };
}

function actionRequestIdentity(value: unknown): unknown {
  const request = asRecord(value);
  const selection = asRecord(request.selection);
  return {
    inputOrigin: request.inputOrigin ?? null,
    originalInput: request.originalInput ?? null,
    resumeActionId: request.resumeActionId ?? null,
    selection: Object.keys(selection).length === 0 ? null : {
      actionId: selection.actionId ?? null,
      opportunityId: selection.opportunityId ?? null,
      kind: selection.kind ?? null,
      scope: selection.scope ?? null,
      locationId: selection.locationId ?? null,
      requestedMinutes: selection.requestedMinutes ?? null,
    },
  };
}

export function sameActionRequestIdentity(before: unknown, after: unknown): boolean {
  return JSON.stringify(actionRequestIdentity(before)) === JSON.stringify(actionRequestIdentity(after));
}

export function classifyCycleReset(input: {
  reason: string;
  beforeResetTime: string;
  afterResetTime: string;
  baselineCycle: number;
  afterCycle: number;
}): string {
  const clockMinutes = (value: string): number | null => {
    const match = value.match(/T(\d{2}):(\d{2})(?::\d{2})?/u);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
  };
  const reachedMidnight = clockMinutes(input.beforeResetTime) === 0;
  const returnedToMorning = clockMinutes(input.afterResetTime) === 8 * 60;
  const advancedOneCycle = input.afterCycle === input.baselineCycle + 1;
  if (input.reason === 'day-end') {
    return reachedMidnight && returnedToMorning && advancedOneCycle
      ? 'completed-calendar-day' : 'invalid-calendar-reset';
  }
  if (/stamina|sanity|resource|exhaust/iu.test(input.reason)) return `early-resource-reset:${input.reason}`;
  return `early-reset:${input.reason}`;
}

function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
}

function targetStatus(value: number, min: number, max: number): 'below-target' | 'within-target' | 'above-target' {
  if (value < min) return 'below-target';
  if (value > max) return 'above-target';
  return 'within-target';
}

export function summarizeAuditRows(rows: readonly unknown[]): unknown {
  const records = rows.map(asRecord);
  const successful = records.filter(row => row.success === true);
  const resolutions = successful.map(row => asRecord(row.resolvedAction)).filter(row => Object.keys(row).length > 0);
  const hasExecutedKind = (resolution: Record<string, unknown>, kinds: ReadonlySet<string>) => (
    (Array.isArray(resolution.segments) ? resolution.segments : []).some(value => {
      const segment = asRecord(value);
      return (finiteNumber(segment.executedMinutes) ?? 0) > 0
        && kinds.has(String(asRecord(segment.step).kind ?? ''));
    })
  );
  const investigationKinds = new Set(['inquiry', 'investigation', 'search']);
  const majorKinds = new Set(['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait']);
  const verifiedInvestigationActions = resolutions.filter(resolution => hasExecutedKind(resolution, investigationKinds)).length;
  const verifiedMajorActions = resolutions.filter(resolution => hasExecutedKind(resolution, majorKinds)).length;
  const calls = records.flatMap(row => Array.isArray(row.calls) ? row.calls.map(asRecord) : []);
  const statuses: Record<string, number> = {};
  for (const call of calls) {
    const key = String(call.status ?? call.error ?? 'unknown');
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  const errorCalls = calls.filter(call => (finiteNumber(call.status) ?? 0) >= 400
    || !!call.error || !!call.providerError).length;
  const playable = successful.map(row => finiteNumber(asRecord(row.metrics).playableMs)).filter((value): value is number => value !== null);
  const foreground = successful.map(row => finiteNumber(asRecord(row.metrics).totalMs)).filter((value): value is number => value !== null);
  const retryRows = records.filter(row => row.retry === true);
  return {
    successfulTurns: successful.length,
    failures: records.length - successful.length,
    verifiedInvestigationActions,
    verifiedMajorActions,
    unverifiableAcceptedActions: successful.length - resolutions.length,
    targets: {
      investigations: { value: verifiedInvestigationActions, min: 5, max: 8,
        status: targetStatus(verifiedInvestigationActions, 5, 8) },
      majorActions: { value: verifiedMajorActions, min: 10, max: 16,
        status: targetStatus(verifiedMajorActions, 10, 16) },
    },
    latency: {
      playableMedianMs: quantile(playable, 0.5),
      playableP90Ms: quantile(playable, 0.9),
      playableTotalMs: playable.reduce((total, value) => total + value, 0),
      foregroundTotalMs: foreground.reduce((total, value) => total + value, 0),
    },
    provider: { calls: calls.length, statuses, errorCalls },
    retries: {
      attempts: retryRows.length,
      identityMismatches: retryRows.filter(row => row.retryIdentityMatches === false).length,
      unverified: retryRows.filter(row => typeof row.retryIdentityMatches !== 'boolean').length,
    },
    resolution: {
      recorded: resolutions.length,
      plannedMinutes: resolutions.reduce((total, resolution) => total + (finiteNumber(resolution.plannedMinutes) ?? 0), 0),
      executedMinutes: resolutions.reduce((total, resolution) => total + (finiteNumber(resolution.executedMinutes) ?? 0), 0),
      travelMinutes: resolutions.reduce((total, resolution) => total + (Array.isArray(resolution.segments)
        ? resolution.segments.map(asRecord).filter(segment => asRecord(segment.step).kind === 'travel')
          .reduce((subtotal, segment) => subtotal + (finiteNumber(segment.executedMinutes) ?? 0), 0) : 0), 0),
      workMinutes: resolutions.reduce((total, resolution) => total + (Array.isArray(resolution.segments)
        ? resolution.segments.map(asRecord).filter(segment => investigationKinds.has(String(asRecord(segment.step).kind ?? '')))
          .reduce((subtotal, segment) => subtotal + (finiteNumber(segment.executedMinutes) ?? 0), 0) : 0), 0),
    },
  };
}

export function assessFullDayAcceptance(input: {
  baselineCycle: number;
  finalCycle: number;
  successfulRows: number;
  stopReason: string;
  programMenuRequired?: boolean;
  programMenuSelections?: number;
}): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.stopReason !== 'completed-calendar-day') reasons.push(`stop reason was ${input.stopReason}`);
  if (input.finalCycle !== input.baselineCycle + 1) {
    reasons.push(`cycle advanced from ${input.baselineCycle} to ${input.finalCycle}, expected exactly one completed day`);
  }
  if (input.successfulRows < 2) reasons.push('a single accepted row is not full-day evidence');
  if (input.programMenuRequired && (input.programMenuSelections ?? 0) < 1) {
    reasons.push('program-menu profile did not execute performAction');
  }
  return { passed: reasons.length === 0, reasons };
}
