const fs = require('fs');
const path = require('path');

const root = '.codex-test-tmp/day-evaluation';
const array = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const sum = values => values.reduce((total, value) => total + value, 0);
const quantile = (values, q) => values.length
  ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)] : null;
const target = (value, min, max) => ({ value, min, max,
  status: value < min ? 'below-target' : value > max ? 'above-target' : 'within-target' });

function hasExecutedKind(resolution, kinds) {
  return array(object(resolution).segments).some(value => {
    const segment = object(value);
    return (number(segment.executedMinutes) ?? 0) > 0 && kinds.has(String(object(segment.step).kind ?? ''));
  });
}

function storyMinute(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000);
}

function hasMorningInvestigation(resolution, investigationKinds) {
  let cursor = storyMinute(resolution.startTime);
  if (cursor === null) return false;
  const dayStart = cursor - (cursor % 1440);
  for (const value of array(resolution.segments)) {
    const segment = object(value);
    const executed = number(segment.executedMinutes) ?? 0;
    const segmentStart = cursor;
    const segmentEnd = cursor + executed;
    cursor = segmentEnd;
    if (executed > 0 && investigationKinds.has(String(object(segment.step).kind ?? ''))
      && segmentStart >= dayStart + 8 * 60 && segmentStart < dayStart + 16 * 60
      && segmentEnd <= dayStart + 16 * 60) return true;
  }
  return false;
}

function summarizeAudit(rows) {
  const accepted = rows.filter(row => row.success === true);
  const resolutions = accepted.map(row => object(row.resolvedAction)).filter(row => Object.keys(row).length > 0);
  const investigationKinds = new Set(['inquiry', 'investigation', 'search']);
  const majorKinds = new Set(['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait']);
  const wholeDayInvestigationTurns = resolutions.filter(value => hasExecutedKind(value, investigationKinds)).length;
  const morningInvestigationTurns = resolutions.filter(value => hasMorningInvestigation(value, investigationKinds)).length;
  const majorRows = accepted.filter(row => hasExecutedKind(object(row.resolvedAction), majorKinds));
  const majorIdentities = majorRows.map(row => typeof row.majorActionIdentity === 'string' && row.majorActionIdentity.trim()
    ? row.majorActionIdentity : null);
  const uniqueMajorActionIds = new Set(majorIdentities.filter(Boolean)).size;
  const unverifiableMajorActionIdentities = majorIdentities.filter(value => value === null).length;
  const resumedExecutionTurns = majorIdentities.length - unverifiableMajorActionIdentities - uniqueMajorActionIds;
  const verifiedInvestigationActions = morningInvestigationTurns;
  const verifiedMajorActions = uniqueMajorActionIds;
  const calls = rows.flatMap(row => array(row.calls));
  const statuses = {};
  for (const call of calls) {
    const key = String(call.status ?? call.error ?? 'unknown');
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  const playable = accepted.map(row => number(object(row.metrics).playableMs)).filter(value => value !== null);
  const firstToken = accepted.map(row => number(object(row.metrics).firstTokenMs)).filter(value => value !== null);
  const callClassification = { foreground: 0, background: 0, unclassified: 0 };
  for (const call of calls) {
    if (call.callClassification === 'foreground' || call.callClassification === 'background') {
      callClassification[call.callClassification]++;
    } else callClassification.unclassified++;
  }
  const retries = rows.filter(row => row.retry === true);
  const resolutionContradictions = accepted.flatMap(row => {
    const resolution = object(row.resolvedAction);
    if (!Object.keys(resolution).length) return [];
    const after = object(row.after);
    const resources = object(object(resolution.resources).after);
    const problems = [];
    if (number(resources.stamina) !== null && number(after.stamina) !== number(resources.stamina)) problems.push('stamina');
    if (number(resources.sanity) !== null && number(after.sanity) !== number(resources.sanity)) problems.push('sanity');
    const recordedClock = typeof after.storyTime === 'string' ? after.storyTime : after.time;
    if (typeof resolution.endTime === 'string' && typeof recordedClock === 'string'
      && resolution.endTime.slice(0, 19) !== recordedClock.slice(0, 19)) problems.push('clock');
    return problems.length ? [{ attempt: row.attempt, resolutionId: resolution.id, fields: problems }] : [];
  });
  return {
    successfulTurns: accepted.length,
    failures: rows.length - accepted.length,
    verifiedInvestigationActions,
    verifiedMajorActions,
    unverifiableAcceptedActions: accepted.length - resolutions.length,
    targets: {
      investigations: target(verifiedInvestigationActions, 5, 8),
      majorActions: target(verifiedMajorActions, 10, 16),
    },
    investigations: {
      morningExecutionTurns: morningInvestigationTurns,
      wholeDayExecutionTurns: wholeDayInvestigationTurns,
      morningWindow: '08:00 <= executed investigation segment and segment end <= 16:00; 16:00 start excluded',
    },
    majorActions: {
      executionTurns: majorRows.length,
      uniqueActionIds: uniqueMajorActionIds,
      resumedExecutionTurns,
      unverifiableActionIdentities: unverifiableMajorActionIdentities,
    },
    latency: {
      playableMedianMs: quantile(playable, 0.5),
      playableP90Ms: quantile(playable, 0.9),
      firstTokenMedianMs: quantile(firstToken, 0.5),
      foregroundMs: sum(accepted.map(row => number(object(row.metrics).totalMs) ?? 0)),
      withBackgroundMs: sum(rows.map(row => number(row.elapsedIncludingBackgroundMs) ?? 0)),
    },
    provider: {
      calls: calls.length,
      statuses,
      errorCalls: calls.filter(call => (number(call.status) ?? 0) >= 400 || call.error || call.providerError).length,
      reportedUsage: calls.filter(call => call.usage).length,
      tokens: {
        prompt: sum(calls.map(call => number(object(call.usage).prompt_tokens) ?? 0)),
        completion: sum(calls.map(call => number(object(call.usage).completion_tokens) ?? 0)),
      },
      maxRequestChars: Math.max(0, ...calls.map(call => number(call.inputChars) ?? 0)),
      maxReportedPromptTokens: Math.max(0, ...calls.map(call => number(object(call.usage).prompt_tokens) ?? 0)),
      callClassification: {
        ...callClassification,
        basis: callClassification.unclassified === 0
          ? 'explicit per-call stage or orchestration evidence'
          : 'unclassified without per-call stage or orchestration evidence',
      },
    },
    retries: {
      attempts: retries.length,
      identityMismatches: retries.filter(row => row.retryIdentityMatches === false).length,
      unverified: retries.filter(row => typeof row.retryIdentityMatches !== 'boolean').length,
    },
    resolution: {
      recorded: resolutions.length,
      plannedMinutes: sum(resolutions.map(value => number(value.plannedMinutes) ?? 0)),
      executedMinutes: sum(resolutions.map(value => number(value.executedMinutes) ?? 0)),
      completedSourceAwards: sum(resolutions.map(value => array(value.completedSourceIds).length)),
      contradictions: resolutionContradictions,
    },
    errors: rows.filter(row => !row.success).map(row => ({ attempt: row.attempt, error: row.error })),
  };
}

function assessAcceptance(data, audit) {
  const baselineCycle = number(object(data.provenance).baselineCycle)
    ?? number(object(data.startState).cycleCount);
  const finalCycle = number(object(data.finalState).cycleCount);
  const reasons = [];
  if (data.stopReason !== 'completed-calendar-day') reasons.push(`stop reason was ${data.stopReason ?? 'missing'}`);
  if (baselineCycle === null || finalCycle !== baselineCycle + 1) {
    reasons.push(`cycle did not advance exactly once from baseline ${baselineCycle ?? 'missing'}`);
  }
  if (audit.successfulTurns < 2) reasons.push('a single accepted row is not full-day evidence');
  if (data.diagnosticsEnabled === true || (data.diagnosticStylePrompt && data.diagnosticStylePrompt !== false)) {
    reasons.push('diagnostic review overrides are prohibited in acceptance evidence');
  }
  if (data.profile === 'program-menu' && (number(data.programMenuSelections) ?? 0) < 1) {
    reasons.push('program-menu profile did not execute performAction');
  }
  if (data.profile === 'options' && (number(data.optionChoiceSelections) ?? 0) < 1) {
    reasons.push('options profile did not execute an accepted selectOption choice');
  }
  return { passed: reasons.length === 0, reasons };
}

function summarizeFile(name) {
  const data = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const rows = array(data.rows).map(object);
  const accepted = rows.filter(row => row.success === true);
  const calls = rows.flatMap(row => array(row.calls));
  const texts = accepted.flatMap(row => array(row.lines).map(line => String(object(line).text ?? '')));
  const audit = summarizeAudit(rows);
  const acceptance = assessAcceptance(data, audit);
  const summary = {
    name,
    profile: data.profile,
    mode: data.mode ?? null,
    provenance: data.provenance ?? null,
    baseUrl: data.baseUrl,
    model: data.model,
    diagnosticsEnabled: data.diagnosticsEnabled ?? data.diagnosticStylePrompt ?? null,
    stop: data.stopReason,
    attempts: rows.length,
    successful: accepted.length,
    final: data.finalState,
    acceptance,
    audit,
    storageBoundary: data.storageBoundary ?? {
      browserPersistence: 'unreported by older sample; do not infer browser durability or playback persistence',
    },
    characterConversationCoverage: data.characterConversationCoverage ?? 'unreported',
    acceptedChars: sum(texts.map(text => text.length)),
    emptyTurns: accepted.filter(row => array(row.lines).length === 0).map(row => row.turn),
    zeroMinuteTurns: accepted.filter(row => object(row.before).time === object(row.after).time).map(row => row.turn),
    stateTurns: accepted.filter(row => array(object(row.metrics).stages).some(stage => object(stage).name === 'state')).map(row => row.turn),
    httpStatuses: audit.provider.statuses,
    tokens: { ...audit.provider.tokens, reported: audit.provider.reportedUsage },
    timeline: accepted.map(row => ({
      turn: row.turn, attempt: row.attempt, input: row.input, actionOrigin: row.actionOrigin,
      actionRequest: row.actionRequest, optionChoice: row.selectedOptionChoice ?? null,
      majorActionIdentity: row.majorActionIdentity ?? null,
      majorActionIdentitySource: row.majorActionIdentitySource ?? 'unverifiable',
      resolutionId: object(row.resolvedAction).id ?? null,
      priceVsActual: row.priceVsActual,
      options: row.options, from: object(row.before).time, to: object(row.after).time,
      minutes: typeof object(row.before).time === 'string' && typeof object(row.after).time === 'string'
        ? (Date.parse(object(row.after).time) - Date.parse(object(row.before).time)) / 60000 : null,
      location: object(row.after).location, stamina: object(row.after).stamina, sanity: object(row.after).sanity,
      deathNews: object(row.after).deathNews, knowledge: object(row.after).knowledge, facts: object(row.after).facts,
      persistedDelta: row.persistedDelta, chars: sum(array(row.lines).map(line => String(object(line).text ?? '').length)),
      calls: array(row.calls).length, playableMs: object(row.metrics).playableMs, reset: row.resetReason,
    })),
    rawCallCount: calls.length,
  };

  let transcript = `# ${name}\n\n`;
  transcript += `Mode: ${JSON.stringify(summary.mode)}; diagnostics: ${JSON.stringify(summary.diagnosticsEnabled)}; stop: ${summary.stop}; acceptance: ${acceptance.passed ? 'PASSED' : 'FAILED'}\n\n`;
  transcript += `Provenance: ${JSON.stringify(summary.provenance)}\n\n`;
  transcript += `Audit: ${JSON.stringify(audit)}\n\n`;
  transcript += `Storage boundary: ${JSON.stringify(summary.storageBoundary)}\n`;
  for (const row of rows) {
    transcript += `\n## Attempt ${row.attempt} / Turn ${row.turn} / ${row.success ? 'ACCEPTED' : 'REJECTED'}\n\n`;
    transcript += `Input: ${row.input ?? ''}\n\n${object(row.before).time ?? '?'} → ${object(row.after).time ?? '?'}; `;
    transcript += `${object(row.after).location ?? '?'}; stamina ${object(row.after).stamina ?? '?'}, sanity ${object(row.after).sanity ?? '?'}\n\n`;
    transcript += `Action request: ${JSON.stringify(row.actionRequest ?? null)}\n\nResolved action: ${JSON.stringify(row.resolvedAction ?? null)}\n\nPrice vs actual: ${JSON.stringify(row.priceVsActual ?? null)}\n\n`;
    if (row.success) {
      transcript += array(row.lines).map(line => `${object(line).speaker ?? ''} (${object(line).character ?? ''}/${object(line).emotion ?? ''}): ${object(line).text ?? ''}`).join('\n\n');
      transcript += `\n\nOptions: ${JSON.stringify(row.options ?? [])}\n\nPersisted delta: ${JSON.stringify(row.persistedDelta ?? null)}\n`;
    } else transcript += `Error: ${row.error ?? ''}\n`;
    if (array(row.assertionAudits).length) transcript += `\nAssertion audits: ${JSON.stringify(row.assertionAudits)}\n`;
    if (row.resetScene) transcript += `\nRESET: ${JSON.stringify(row.resetScene)}\n`;
  }
  fs.writeFileSync(path.join(root, name.replace('.json', '-transcript.md')), transcript);
  return summary;
}

if (!fs.existsSync(root)) throw new Error(`Missing live evaluation directory: ${root}`);
const summaries = fs.readdirSync(root)
  .filter(name => name.endsWith('.json') && !name.includes('checkpoint'))
  .map(summarizeFile);
fs.writeFileSync(path.join(root, '..', 'day-summary.json'), JSON.stringify(summaries, null, 2));
console.log(JSON.stringify(summaries.map(summary => ({
  name: summary.name,
  stop: summary.stop,
  acceptance: summary.acceptance,
  attempts: summary.attempts,
  successful: summary.successful,
  calls: summary.audit.provider.calls,
  playableMedianMs: summary.audit.latency.playableMedianMs,
  majorActions: summary.audit.verifiedMajorActions,
  investigations: summary.audit.verifiedInvestigationActions,
  time: object(summary.final).time,
  cycle: object(summary.final).cycleCount,
})), null, 2));
