import { createHash } from 'node:crypto';
import { extractNarrativeFields } from '../src/agents/mystery/fact-assertion-review';

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
  campaignId: string;
  baselineCycle: number;
}

export function buildEvaluationProvenance(
  input: Omit<EvaluationProvenance, 'schemaVersion' | 'campaignId'> & { campaignId?: string },
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
  const campaignId = (input.campaignId ?? input.runTag).trim() || 'default';
  if (!/^[a-zA-Z0-9_-]+$/u.test(campaignId)) throw new Error('campaignId must be a safe non-empty identifier');
  return { schemaVersion: 1, ...structuredClone(input), campaignId };
}

export interface CampaignLineage {
  source: 'fresh' | 'advance';
  parentBaselineCycle?: number;
  parentCheckpointDigest?: string;
  parentResultDigest?: string;
}

export function artifactDigest(serialized: string): string {
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function sameLineage(left: unknown, right: unknown): boolean {
  return JSON.stringify(asRecord(left)) === JSON.stringify(asRecord(right));
}

function assertLineageParentDigests(
  lineageValue: unknown,
  parentArtifacts?: { checkpointText: string; resultText: string },
): void {
  const lineage = asRecord(lineageValue);
  if (lineage.source !== 'advance') return;
  if (!parentArtifacts) throw new Error('advanced checkpoint resume requires parent artifacts');
  if (lineage.parentCheckpointDigest !== artifactDigest(parentArtifacts.checkpointText)) {
    throw new Error('parent checkpoint digest does not match campaign lineage');
  }
  if (lineage.parentResultDigest !== artifactDigest(parentArtifacts.resultText)) {
    throw new Error('parent result digest does not match campaign lineage');
  }
}

export function assertResumeCompatible(input: {
  expected: EvaluationProvenance;
  checkpoint: unknown;
  result: unknown;
  parentArtifacts?: { checkpointText: string; resultText: string };
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
    const rest = { ...value };
    delete rest.testedCommit;
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
  const artifactsAgreeOnAdvancedCycle = checkpointCycle !== null
    && checkpointCycle !== input.expected.baselineCycle
    && checkpointCycle === storedCycle && checkpointCycle === resultFinalCycle;
  if (artifactsAgreeOnAdvancedCycle
    || result.stopReason === 'completed-calendar-day' || asRecord(result.acceptance).passed === true) {
    throw new Error('completed segment cannot use DAY_RESUME; use DAY_ADVANCE with immutable parent artifacts');
  }
  if (finiteNumber(checkpoint.baselineCycle) !== input.expected.baselineCycle
    || resultStartCycle !== input.expected.baselineCycle
    || checkpointCycle === null || checkpointCycle !== storedCycle
    || resultFinalCycle === null || resultFinalCycle !== checkpointCycle) {
    throw new Error('checkpoint cycle provenance is inconsistent');
  }
  if (!sameLineage(checkpoint.lineage, result.lineage)) {
    throw new Error('checkpoint and result campaign lineage disagree');
  }
  assertLineageParentDigests(checkpoint.lineage, input.parentArtifacts);
}

export interface ActionResolutionTrace {
  inputId: string;
  outputResolutionId: string;
  resumed: boolean;
}

export function resolveCommittedActionIdentity(
  traces: readonly ActionResolutionTrace[],
  resolvedAction: unknown,
): { actionId: string; source: 'resolver-input'; resumed: boolean } | null {
  const resolutionId = asRecord(resolvedAction).id;
  if (typeof resolutionId !== 'string' || !resolutionId) return null;
  const matches = traces.filter(trace => trace.outputResolutionId === resolutionId
    && typeof trace.inputId === 'string' && trace.inputId.length > 0);
  if (matches.length !== 1) return null;
  return { actionId: matches[0].inputId, source: 'resolver-input', resumed: matches[0].resumed };
}

export function assessReachableNpcEvidence(input: {
  npcId: string;
  firstClaimPattern: RegExp;
  first: { userInput: string; knowledgeEvents: unknown; playerNameKnownByNpcIds: unknown; memory: unknown };
  afterReset: { knowledgeEvents: unknown; playerNameKnownByNpcIds: unknown; memory: unknown };
  second: { userInput: string; playerNameKnownByNpcIds: unknown; memory: unknown; npcSpoke: boolean };
}): { passed: boolean; reasons: string[]; evidence: Record<string, unknown> } {
  const reasons: string[] = [];
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string') : [];
  const memoryItems = (value: unknown, key: string) => {
    const record = asRecord(value);
    return Array.isArray(record[key]) ? record[key].map(asRecord) : [];
  };
  const firstNames = strings(input.first.playerNameKnownByNpcIds);
  const resetNames = strings(input.afterReset.playerNameKnownByNpcIds);
  const secondNames = strings(input.second.playerNameKnownByNpcIds);
  const firstCognition = memoryItems(input.first.memory, 'cognition');
  const resetCognition = memoryItems(input.afterReset.memory, 'cognition');
  const firstDisclosures = memoryItems(input.first.memory, 'disclosures');
  const resetDisclosureIds = new Set(memoryItems(input.afterReset.memory, 'disclosures')
    .map(item => item.id).filter((id): id is string => typeof id === 'string'));
  const secondDisclosures = memoryItems(input.second.memory, 'disclosures');
  const firstClaim = firstDisclosures.find(item => item.speakerId === 'player'
    && Array.isArray(item.listenerIds) && item.listenerIds.includes(input.npcId)
    && typeof item.evidenceQuote === 'string' && input.firstClaimPattern.test(item.evidenceQuote));
  const secondIntroduction = secondDisclosures.find(item => item.speakerId === 'player'
    && Array.isArray(item.listenerIds) && item.listenerIds.includes(input.npcId)
    && item.propositionId === 'identity:player-name'
    && typeof item.id === 'string' && !resetDisclosureIds.has(item.id));
  const firstNameCognition = firstCognition.some(item => item.observerId === input.npcId
    && item.propositionId === 'identity:player-name');
  const resetNameCognition = resetCognition.some(item => item.observerId === input.npcId
    && item.propositionId === 'identity:player-name');
  const playerRecallRetained = strings(input.afterReset.knowledgeEvents).includes(`meet:${input.npcId}`);
  if (!/我叫\s*李明/u.test(input.first.userInput)) reasons.push('first turn did not explicitly request player self-introduction');
  if (!firstNames.includes(input.npcId) || !firstNameCognition) reasons.push('NPC did not learn the player name on the first accepted turn');
  if (!firstClaim) reasons.push('first specific claim lacks a player-to-NPC disclosure with matching evidence quote');
  if (resetNames.includes(input.npcId) || resetNameCognition) reasons.push('NPC player-name recognition remained stale after reset');
  if (!playerRecallRetained) reasons.push('player recall of meeting the NPC did not survive reset');
  if (!/我叫\s*李明/u.test(input.second.userInput)) reasons.push('second turn did not explicitly request reintroduction');
  if (!input.second.npcSpoke || !secondNames.includes(input.npcId) || !secondIntroduction) {
    reasons.push('second loop lacks accepted NPC reintroduction evidence');
  }
  return { passed: reasons.length === 0, reasons, evidence: {
    firstClaimDisclosureId: firstClaim?.id ?? null,
    firstNameLearned: firstNames.includes(input.npcId) && firstNameCognition,
    resetNameRecognitionCleared: !resetNames.includes(input.npcId) && !resetNameCognition,
    playerRecallRetained, secondIntroductionDisclosureId: secondIntroduction?.id ?? null,
  } };
}

export function assessSourceGroundingEvidence(input: {
  acceptedContent?: string | null;
  reviews: readonly unknown[];
  required?: { text: RegExp; sourceId: string; sourceQuote: RegExp };
  forbidden?: RegExp;
  rejectionPattern?: RegExp;
  requireDisposition?: boolean;
}): { passed: boolean; reasons: string[]; evidence: Record<string, unknown> } {
  const content = input.acceptedContent ?? '';
  const acceptedCandidateReviews = content.length > 0
    ? input.reviews.filter(review => reviewedCandidateMatchesAcceptedContent(
      asRecord(review).reviewedCandidate, content,
    )) : [];
  const assertions = acceptedCandidateReviews.flatMap(review => {
    const audit = asRecord(asRecord(review).assertionAudit);
    return Array.isArray(audit.assertions) ? audit.assertions.map(asRecord) : [];
  });
  const currentAttemptAssertions = input.reviews.flatMap(review => {
    const audit = asRecord(asRecord(review).assertionAudit);
    return Array.isArray(audit.assertions) ? audit.assertions.map(asRecord) : [];
  });
  const supported = input.required ? assertions.find(assertion => assertion.status === 'supported'
    && typeof assertion.quote === 'string' && input.required!.text.test(assertion.quote)
    && (Array.isArray(assertion.citations) ? assertion.citations.map(asRecord) : []).some(citation => (
      citation.sourceId === input.required!.sourceId
      && typeof citation.quote === 'string' && input.required!.sourceQuote.test(citation.quote)
    ))) : undefined;
  const forbiddenPresent = input.forbidden ? input.forbidden.test(content) : false;
  const unsupportedAssertions = currentAttemptAssertions.filter(assertion => assertion.status === 'unsupported');
  const rejectionPattern = input.rejectionPattern ?? input.forbidden;
  const relevantSemanticRejection = rejectionPattern ? input.reviews.some(review => {
    const record = asRecord(review);
    const audit = asRecord(record.assertionAudit);
    const reviewAssertions = Array.isArray(audit.assertions) ? audit.assertions.map(asRecord) : [];
    const rejectionText = [
      ...reviewAssertions.filter(assertion => assertion.status === 'unsupported')
        .map(assertion => `${assertion.quote ?? ''} ${assertion.proposition ?? ''} ${assertion.reason ?? ''}`),
      ...(Array.isArray(record.violations) ? record.violations.map(item => JSON.stringify(item)) : []),
      ...(Array.isArray(record.corrections) ? record.corrections.map(String) : []),
    ].join('\n');
    return record.approved === false && rejectionPattern.test(rejectionText);
  }) : false;
  const reasons: string[] = [];
  if (content.length > 0 && acceptedCandidateReviews.length === 0) {
    reasons.push('accepted content has no review tied to the current accepted candidate');
  }
  if (input.required && !input.required.text.test(content)) reasons.push('accepted content omits the required grounded assertion');
  if (input.required && !supported) reasons.push('required assertion lacks exact supported source evidence');
  if (forbiddenPresent) reasons.push('accepted content contains the forbidden unsupported addition');
  if (input.requireDisposition && content.length === 0 && !relevantSemanticRejection) {
    reasons.push('current attempt produced neither corrected accepted content nor a relevant semantic rejection');
  }
  return { passed: reasons.length === 0, reasons, evidence: {
    accepted: content.length > 0, acceptedCandidateReviewCount: acceptedCandidateReviews.length,
    relevantSemanticRejection, supportedQuote: supported?.quote ?? null,
    supportedCitations: supported?.citations ?? [], forbiddenPresent,
    unsupportedAssertions: unsupportedAssertions
      .map(assertion => ({ quote: assertion.quote, proposition: assertion.proposition, reason: assertion.reason })),
  } };
}

export function reviewedCandidateMatchesAcceptedContent(reviewedCandidate: unknown, acceptedContent: unknown): boolean {
  if (typeof reviewedCandidate !== 'string' || typeof acceptedContent !== 'string') return false;
  const semanticFields = (value: string) => Object.fromEntries(Object.entries(extractNarrativeFields(value))
    .filter(([field]) => field === 'maintext' || field.startsWith('option:') || field === 'hint' || field === 'summary'));
  return JSON.stringify(semanticFields(reviewedCandidate)) === JSON.stringify(semanticFields(acceptedContent));
}

function provenanceWithoutSegment(value: Partial<EvaluationProvenance>): Record<string, unknown> {
  const rest = { ...value };
  delete rest.baselineCycle;
  return rest;
}

export function assertCampaignAdvance(input: {
  expected: EvaluationProvenance;
  checkpoint: unknown;
  result: unknown;
  checkpointText: string;
  resultText: string;
  parentArtifacts?: { checkpointText: string; resultText: string };
}): CampaignLineage {
  const checkpoint = asRecord(input.checkpoint);
  const result = asRecord(input.result);
  const checkpointProvenance = asRecord(checkpoint.provenance) as Partial<EvaluationProvenance>;
  const resultProvenance = asRecord(result.provenance) as Partial<EvaluationProvenance>;
  if (checkpointProvenance.testedCommit !== input.expected.testedCommit
    || resultProvenance.testedCommit !== input.expected.testedCommit) {
    throw new Error('parent tested commit does not match the current immutable tested commit');
  }
  const expectedConfig = JSON.stringify(provenanceWithoutSegment(input.expected));
  if (JSON.stringify(provenanceWithoutSegment(checkpointProvenance)) !== expectedConfig
    || JSON.stringify(provenanceWithoutSegment(resultProvenance)) !== expectedConfig) {
    throw new Error('parent campaign configuration does not match the current evaluation configuration');
  }
  const parentBaseline = input.expected.baselineCycle - 1;
  const checkpointCycle = finiteNumber(checkpoint.currentCycle);
  const storedCycle = finiteNumber(asRecord(asRecord(checkpoint.tavern).variables).cycleCount);
  const resultStartCycle = finiteNumber(asRecord(result.startState).cycleCount);
  const resultFinalCycle = finiteNumber(asRecord(result.finalState).cycleCount);
  if (parentBaseline < 1 || finiteNumber(checkpoint.baselineCycle) !== parentBaseline
    || finiteNumber(checkpointProvenance.baselineCycle) !== parentBaseline
    || finiteNumber(resultProvenance.baselineCycle) !== parentBaseline
    || resultStartCycle !== parentBaseline || resultFinalCycle !== input.expected.baselineCycle
    || checkpointCycle !== input.expected.baselineCycle || storedCycle !== checkpointCycle) {
    throw new Error('parent checkpoint does not advance exactly one completed segment into the requested cycle');
  }
  if (result.stopReason !== 'completed-calendar-day' || asRecord(result.acceptance).passed !== true) {
    throw new Error('campaign advance requires a passed natural calendar day');
  }
  if (!sameLineage(checkpoint.lineage, result.lineage)) {
    throw new Error('parent checkpoint and result campaign lineage disagree');
  }
  assertLineageParentDigests(checkpoint.lineage, input.parentArtifacts);
  return {
    source: 'advance',
    parentBaselineCycle: parentBaseline,
    parentCheckpointDigest: artifactDigest(input.checkpointText),
    parentResultDigest: artifactDigest(input.resultText),
  };
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

export function resolveCurrentOptionChoice<T>(input: {
  options: readonly string[];
  bindings: readonly unknown[];
  activeContinuationId?: string;
  validate: (value: unknown, index: number, text: string, activeContinuationId?: string) => T | undefined;
}): { status: 'no-option' } | {
  status: 'invalid-stored-binding'; optionIndex: number; optionText: string; storedBinding: true;
} | {
  status: 'ready'; optionIndex: number; optionText: string; binding: T | undefined; storedBinding: boolean;
} {
  const optionText = input.options[0];
  if (typeof optionText !== 'string') return { status: 'no-option' };
  const optionIndex = 0;
  const rawBinding = input.bindings.find(value => asRecord(value).optionIndex === optionIndex)
    ?? input.bindings.find(value => asRecord(value).optionText === optionText);
  if (rawBinding === undefined) {
    return { status: 'ready', optionIndex, optionText, binding: undefined, storedBinding: false };
  }
  const binding = input.validate(rawBinding, optionIndex, optionText, input.activeContinuationId);
  if (!binding) return { status: 'invalid-stored-binding', optionIndex, optionText, storedBinding: true };
  return { status: 'ready', optionIndex, optionText, binding, storedBinding: true };
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
  const wholeDayInvestigationTurns = resolutions.filter(resolution => hasExecutedKind(resolution, investigationKinds)).length;
  const storyMinute = (value: unknown): number | null => {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u);
    if (!match) return null;
    return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60_000);
  };
  const hasMorningInvestigation = (resolution: Record<string, unknown>): boolean => {
    let cursor = storyMinute(resolution.startTime);
    if (cursor === null) return false;
    const dayStart = cursor - (cursor % 1440);
    for (const value of Array.isArray(resolution.segments) ? resolution.segments : []) {
      const segment = asRecord(value);
      const executed = finiteNumber(segment.executedMinutes) ?? 0;
      const segmentStart = cursor;
      const segmentEnd = cursor + executed;
      cursor = segmentEnd;
      if (executed > 0 && investigationKinds.has(String(asRecord(segment.step).kind ?? ''))
        && segmentStart >= dayStart + 8 * 60 && segmentStart < dayStart + 16 * 60
        && segmentEnd <= dayStart + 16 * 60) return true;
    }
    return false;
  };
  const morningInvestigationTurns = resolutions.filter(hasMorningInvestigation).length;
  const majorRows = successful.filter(row => {
    const resolution = asRecord(row.resolvedAction);
    return Object.keys(resolution).length > 0 && hasExecutedKind(resolution, majorKinds);
  });
  const majorIdentities = majorRows.map(row => typeof row.majorActionIdentity === 'string' && row.majorActionIdentity.trim()
    ? row.majorActionIdentity : null);
  const uniqueMajorActionIds = new Set(majorIdentities.filter((value): value is string => value !== null)).size;
  const unverifiableMajorActionIdentities = majorIdentities.filter(value => value === null).length;
  const resumedExecutionTurns = majorIdentities.length - unverifiableMajorActionIdentities - uniqueMajorActionIds;
  const verifiedInvestigationActions = morningInvestigationTurns;
  const verifiedMajorActions = uniqueMajorActionIds;
  const calls = records.flatMap(row => Array.isArray(row.calls) ? row.calls.map(asRecord) : []);
  const statuses: Record<string, number> = {};
  for (const call of calls) {
    const key = String(call.status ?? call.error ?? 'unknown');
    statuses[key] = (statuses[key] ?? 0) + 1;
  }
  const errorCalls = calls.filter(call => (finiteNumber(call.status) ?? 0) >= 400
    || !!call.error || !!call.providerError).length;
  const classifiedCalls = { foreground: 0, background: 0, unclassified: 0 };
  for (const call of calls) {
    const classification = call.callClassification;
    if (classification === 'foreground' || classification === 'background') classifiedCalls[classification]++;
    else classifiedCalls.unclassified++;
  }
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
      playableTotalMs: playable.reduce((total, value) => total + value, 0),
      foregroundTotalMs: foreground.reduce((total, value) => total + value, 0),
    },
    provider: { calls: calls.length, statuses, errorCalls, callClassification: {
      ...classifiedCalls,
      basis: classifiedCalls.unclassified === 0
        ? 'explicit per-call stage or orchestration evidence'
        : 'unclassified without per-call stage or orchestration evidence',
    } },
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
  optionChoiceRequired?: boolean;
  optionChoiceSelections?: number;
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
  if (input.optionChoiceRequired && (input.optionChoiceSelections ?? 0) < 1) {
    reasons.push('options profile did not execute an accepted selectOption choice');
  }
  return { passed: reasons.length === 0, reasons };
}
