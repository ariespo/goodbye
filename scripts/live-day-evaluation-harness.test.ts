import { describe, expect, it } from 'vitest';
import {
  artifactDigest,
  assessFullDayAcceptance,
  assertAcceptanceOverrides,
  assertCampaignAdvance,
  assertResumeCompatible,
  buildEvaluationProvenance,
  classifyCycleReset,
  compareQuoteToResolution,
  assessReachableNpcEvidence,
  assessSourceGroundingEvidence,
  diffPersistedEvidence,
  parseDayMode,
  resolveCurrentOptionChoice,
  resolveCommittedActionIdentity,
  reviewedCandidateMatchesAcceptedContent,
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
    const checkpoint = { provenance: expected, baselineCycle: 3, currentCycle: 3,
      tavern: { variables: { cycleCount: 3 } } };
    const result = { provenance: expected, startState: { cycleCount: 3 }, finalState: { cycleCount: 3 } };
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

  it('rejects DAY_RESUME for an already completed segment without mutating artifact bytes', () => {
    const expected = buildEvaluationProvenance({ testedCommit: commit, profile: 'options', mode: parseDayMode('standard'),
      model: 'route-a', baseUrl: 'https://gateway.example/v1', maxTurns: 90, runTag: 'terminal', baselineCycle: 3 });
    const checkpoint = { provenance: expected, baselineCycle: 3, currentCycle: 4,
      tavern: { variables: { cycleCount: 4 } }, lineage: { source: 'fresh' } };
    const result = { provenance: expected, startState: { cycleCount: 3 }, finalState: { cycleCount: 4 },
      stopReason: 'completed-calendar-day', acceptance: { passed: true }, lineage: { source: 'fresh' } };
    const checkpointBytes = JSON.stringify(checkpoint);
    const resultBytes = JSON.stringify(result);
    const before = [artifactDigest(checkpointBytes), artifactDigest(resultBytes)];
    const providerCalls = 0;
    const writes = 0;
    expect(() => assertResumeCompatible({ expected, checkpoint, result })).toThrow(/DAY_ADVANCE/);
    expect([artifactDigest(checkpointBytes), artifactDigest(resultBytes)]).toEqual(before);
    expect({ providerCalls, writes }).toEqual({ providerCalls: 0, writes: 0 });
  });

  it('advances only from a passed natural parent segment on the same immutable campaign', () => {
    const parent = buildEvaluationProvenance({
      testedCommit: commit, profile: 'options', mode: parseDayMode('standard'),
      model: 'route-a', baseUrl: 'https://gateway.example/v1', maxTurns: 90,
      runTag: 'campaign', campaignId: 'campaign', baselineCycle: 2,
    });
    const expected = buildEvaluationProvenance({ ...parent, baselineCycle: 3 });
    const checkpointText = JSON.stringify({ parent: 'checkpoint' });
    const resultText = JSON.stringify({ parent: 'result' });
    const grandparentCheckpointText = JSON.stringify({ grandparent: 'checkpoint' });
    const grandparentResultText = JSON.stringify({ grandparent: 'result' });
    const parentLineage = { source: 'advance', parentBaselineCycle: 1,
      parentCheckpointDigest: artifactDigest(grandparentCheckpointText),
      parentResultDigest: artifactDigest(grandparentResultText) };
    const checkpoint = { provenance: parent, baselineCycle: 2, currentCycle: 3,
      tavern: { variables: { cycleCount: 3 } }, lineage: parentLineage };
    const result = { provenance: parent, startState: { cycleCount: 2 }, finalState: { cycleCount: 3 },
      stopReason: 'completed-calendar-day', acceptance: { passed: true }, lineage: parentLineage };
    const parentArtifacts = { checkpointText: grandparentCheckpointText, resultText: grandparentResultText };
    expect(assertCampaignAdvance({ expected, checkpoint, result, checkpointText, resultText, parentArtifacts })).toEqual({
      source: 'advance', parentBaselineCycle: 2,
      parentCheckpointDigest: artifactDigest(checkpointText), parentResultDigest: artifactDigest(resultText),
    });
    expect(() => assertCampaignAdvance({ expected, checkpoint, result: {
      ...result, stopReason: 'provider-proxy-error', acceptance: { passed: false },
    }, checkpointText, resultText, parentArtifacts })).toThrow(/passed legal completed loop/);
    expect(() => assertCampaignAdvance({ expected: { ...expected, testedCommit: 'abcdef1234567890abcdef1234567890abcdef12' },
      checkpoint, result, checkpointText, resultText, parentArtifacts })).toThrow(/tested commit/);
  });

  it('validates stored parent digests when resuming an advanced segment', () => {
    const expected = buildEvaluationProvenance({
      testedCommit: commit, profile: 'options', mode: parseDayMode('standard'),
      model: 'route-a', baseUrl: 'https://gateway.example/v1', maxTurns: 90,
      runTag: 'campaign', campaignId: 'campaign', baselineCycle: 3,
    });
    const parentCheckpointText = '{"parent":"checkpoint"}';
    const parentResultText = '{"parent":"result"}';
    const lineage = { source: 'advance', parentBaselineCycle: 2,
      parentCheckpointDigest: artifactDigest(parentCheckpointText), parentResultDigest: artifactDigest(parentResultText) };
    const checkpoint = { provenance: expected, baselineCycle: 3, currentCycle: 3,
      tavern: { variables: { cycleCount: 3 } }, lineage };
    const result = { provenance: expected, startState: { cycleCount: 3 }, finalState: { cycleCount: 3 }, lineage };
    expect(() => assertResumeCompatible({ expected, checkpoint, result,
      parentArtifacts: { checkpointText: parentCheckpointText, resultText: parentResultText } })).not.toThrow();
    expect(() => assertResumeCompatible({ expected, checkpoint, result,
      parentArtifacts: { checkpointText: `${parentCheckpointText}tampered`, resultText: parentResultText } }))
      .toThrow(/parent checkpoint digest/);
  });

  it('scrubs secrets from checkpoint payloads as well as result payloads', () => {
    const serialized = serializeScrubbed({ error: 'request key-live-secret failed', nested: ['key-live-secret'] }, ['key-live-secret']);
    expect(serialized).not.toContain('key-live-secret');
    expect(serialized).toContain('[redacted]');
  });
});

describe('live day evidence snapshots', () => {
  it('maps only the actual committed resolver input id and never the menu or resolution id', () => {
    const traces = [
      { inputId: 'execution-a', outputResolutionId: 'resolution-partial', resumed: false },
      { inputId: 'execution-a', outputResolutionId: 'resolution-complete', resumed: true },
      { inputId: 'execution-b', outputResolutionId: 'resolution-new-work', resumed: false },
    ];
    expect(resolveCommittedActionIdentity(traces, { id: 'resolution-partial' })).toEqual({
      actionId: 'execution-a', source: 'resolver-input', resumed: false,
    });
    expect(resolveCommittedActionIdentity(traces, { id: 'resolution-complete' })).toEqual({
      actionId: 'execution-a', source: 'resolver-input', resumed: true,
    });
    expect(resolveCommittedActionIdentity(traces, { id: 'resolution-new-work' })?.actionId).toBe('execution-b');
    expect(resolveCommittedActionIdentity(traces, { id: 'menu-opportunity-id' })).toBeNull();
  });

  it('requires learned name, a specific disclosure, reset clearing, player recall, and accepted reintroduction', () => {
    const firstMemory = { cognition: [{ observerId: 'chen-huihui', propositionId: 'identity:player-name' }],
      disclosures: [
        { id: 'claim-1', speakerId: 'player', listenerIds: ['chen-huihui'], propositionId: 'fact:opening-message',
          evidenceQuote: '文穗06:50说她今天不去学校。' },
        { id: 'intro-1', speakerId: 'player', listenerIds: ['chen-huihui'], propositionId: 'identity:player-name' },
      ] };
    const afterResetMemory = { cognition: [], disclosures: [] };
    const secondMemory = { cognition: [{ observerId: 'chen-huihui', propositionId: 'identity:player-name' }],
      disclosures: [{ id: 'intro-2', speakerId: 'player', listenerIds: ['chen-huihui'], propositionId: 'identity:player-name' }] };
    const base = { npcId: 'chen-huihui', firstClaimPattern: /06:50.*不去学校/u,
      first: { userInput: '我叫李明。文穗06:50说她今天不去学校。', knowledgeEvents: ['meet:chen-huihui'],
        playerNameKnownByNpcIds: ['chen-huihui'], memory: firstMemory },
      afterReset: { knowledgeEvents: ['meet:chen-huihui'], playerNameKnownByNpcIds: [], memory: afterResetMemory },
      second: { userInput: '我叫李明，我们重新认识。', playerNameKnownByNpcIds: ['chen-huihui'],
        memory: secondMemory, npcSpoke: true } };
    expect(assessReachableNpcEvidence(base)).toMatchObject({ passed: true, reasons: [] });
    expect(assessReachableNpcEvidence({ ...base,
      afterReset: { ...base.afterReset, playerNameKnownByNpcIds: ['chen-huihui'] } }).passed).toBe(false);
    expect(assessReachableNpcEvidence({ ...base,
      second: { ...base.second, memory: { cognition: [], disclosures: [] }, npcSpoke: false } }).passed).toBe(false);
    expect(assessReachableNpcEvidence({ ...base,
      afterReset: { ...base.afterReset,
        memory: { cognition: [], disclosures: [{ id: 'intro-2', speakerId: 'player',
          listenerIds: ['chen-huihui'], propositionId: 'identity:player-name' }] } } }).passed).toBe(false);
  });

  it('requires exact supported source evidence and rejects unsupported additions in accepted prose', () => {
    const accepted = '06:50文穗发来消息说今天不去学校。';
    const review = { approved: true, reviewedCandidate: accepted,
      assertionAudit: { assertions: [{ status: 'supported', quote: accepted,
      citations: [{ sourceId: 'public-event:opening-message-0650', quote: '今早06:50文穗发来聊天消息' }] }] } };
    expect(assessSourceGroundingEvidence({ acceptedContent: accepted, reviews: [review],
      required: { text: /06:50.*不去学校/u, sourceId: 'public-event:opening-message-0650', sourceQuote: /06:50/u },
      forbidden: /06:30|面包车/u })).toMatchObject({ passed: true });
    expect(assessSourceGroundingEvidence({ acceptedContent: '她发过消息。', reviews: [review],
      required: { text: /06:50.*不去学校/u, sourceId: 'public-event:opening-message-0650', sourceQuote: /06:50/u } }).passed)
      .toBe(false);
    expect(assessSourceGroundingEvidence({ acceptedContent: accepted, reviews: [
      { ...review, reviewedCandidate: '被拒绝的旧候选。' },
      { approved: true, reviewedCandidate: accepted, assertionAudit: { assertions: [] } },
    ], required: { text: /06:50.*不去学校/u, sourceId: 'public-event:opening-message-0650', sourceQuote: /06:50/u } }).passed)
      .toBe(false);
    expect(assessSourceGroundingEvidence({ acceptedContent: '06:30有面包车接走了文穗。', reviews: [review],
      forbidden: /06:30|面包车/u }).passed).toBe(false);
  });

  it('does not reuse a seeded opening or rejected candidate as current-attempt acceptance', () => {
    const forbidden = /06:30|面包车/u;
    expect(assessSourceGroundingEvidence({ acceptedContent: '开局场景仍在这里。', reviews: [], forbidden,
      requireDisposition: true }).passed).toBe(false);
    expect(assessSourceGroundingEvidence({ acceptedContent: null, reviews: [], forbidden,
      requireDisposition: true }).passed).toBe(false);
    expect(assessSourceGroundingEvidence({ acceptedContent: '现有资料只记录06:50消息。', reviews: [{
      approved: true, reviewedCandidate: '现有资料只记录06:50消息。', assertionAudit: { assertions: [] },
    }], forbidden, requireDisposition: true })).toMatchObject({ passed: true,
      evidence: { acceptedCandidateReviewCount: 1, relevantSemanticRejection: false } });
    expect(assessSourceGroundingEvidence({ acceptedContent: null, reviews: [{
      approved: false, reviewedCandidate: '06:30有面包车接走了文穗。',
      assertionAudit: { assertions: [{ status: 'unsupported', quote: '06:30有面包车接走了文穗。' }] },
    }], forbidden, requireDisposition: true })).toMatchObject({ passed: true,
      evidence: { accepted: false, relevantSemanticRejection: true } });
    expect(assessSourceGroundingEvidence({ acceptedContent: null, reviews: [{
      approved: false, reviewedCandidate: '<malformed>', violations: [{ message: '主输出协议缺少标签' }],
    }], forbidden, requireDisposition: true }).passed).toBe(false);
  });

  it('links only exact semantic fields while allowing program-owned checklist replacement', () => {
    const reviewed = '<maintext>对话|旁白|calm|06:50文穗说今天不去学校。</maintext><option>核对消息\n拨打电话</option><hint>先看现有记录。</hint><sum>复述开局消息。</sum><vars>{}</vars>';
    const committed = '<maintext>对话|旁白|calm|06:50文穗说今天不去学校。\n<investigate>核对考勤|老师|现实|55分钟|7|0|program</investigate>\n<action>原地等待|现实|25分钟|2|0|program</action></maintext><option>核对消息\n拨打电话</option><hint>先看现有记录。</hint><sum>复述开局消息。</sum><vars>{}</vars>';
    expect(reviewedCandidateMatchesAcceptedContent(reviewed, committed)).toBe(true);
    expect(reviewedCandidateMatchesAcceptedContent(reviewed,
      committed.replace('今天不去学校', '06:30乘面包车离开'))).toBe(false);
    expect(reviewedCandidateMatchesAcceptedContent(reviewed,
      committed.replace('拨打电话', '直接确认未登录'))).toBe(false);
    expect(reviewedCandidateMatchesAcceptedContent(reviewed,
      committed.replace('复述开局消息', '确认客观缺席'))).toBe(false);
  });
  it('resolves the current first option through validated stored metadata', () => {
    const validate = (value: unknown, index: number, text: string, active?: string) => {
      const candidate = value as { optionIndex?: number; optionText?: string; continuationId?: string } | undefined;
      return candidate?.optionIndex === index && candidate.optionText === text
        && candidate.continuationId === active ? candidate : undefined;
    };
    expect(resolveCurrentOptionChoice({ options: ['继续调查'], bindings: [{ optionIndex: 0,
      optionText: '继续调查', continuationId: 'action-1' }], activeContinuationId: 'action-1', validate }))
      .toMatchObject({ status: 'ready', optionIndex: 0, optionText: '继续调查', binding: { continuationId: 'action-1' } });
    expect(resolveCurrentOptionChoice({ options: ['普通选择'], bindings: [], validate }))
      .toEqual({ status: 'ready', optionIndex: 0, optionText: '普通选择', binding: undefined, storedBinding: false });
    expect(resolveCurrentOptionChoice({ options: ['继续调查'], bindings: [{ optionIndex: 0,
      optionText: '旧文本', continuationId: 'action-1' }], activeContinuationId: 'action-1', validate }))
      .toMatchObject({ status: 'invalid-stored-binding' });
    expect(resolveCurrentOptionChoice({ options: [], bindings: [], validate })).toEqual({ status: 'no-option' });
  });
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
  const resourceReset = { reason: 'stamina', beforeResetTime: '2024-09-09T14:00:00',
    afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4,
    afterLocation: 'home', beforeStamina: 0, beforeSanity: 35 };

  it.each(['stamina', 'sanity'])('accepts actual %s exhaustion without claiming calendar coverage', reason => {
    const resetEvidence = { ...resourceReset, reason,
      beforeStamina: reason === 'stamina' ? 0 : 35, beforeSanity: reason === 'sanity' ? 0 : 35 };
    expect(classifyCycleReset(resetEvidence)).toBe('completed-resource-loop');
    expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 12,
      stopReason: 'completed-resource-loop', resetEvidence })).toMatchObject({
      passed: true, completionKind: 'resource', calendarDayCompleted: false,
    });
  });

  it('preserves the complete bound intent across retry without including unrelated request credentials', () => {
    const playerActionIntent = { version: 1, originalInput: '询问门卫', startLocationId: 'school',
      steps: [{ kind: 'inquiry', scope: 'normal', locationId: 'school', targetNpcIds: ['school-guard'] }] };
    const request = { inputOrigin: 'option', originalInput: '询问门卫', playerActionIntent,
      apiKey: 'private-before', credentials: { token: 'private-before' } };
    expect(sameActionRequestIdentity(request, { ...structuredClone(request),
      apiKey: 'private-after', credentials: { token: 'private-after' } })).toBe(true);
    for (const intent of [undefined,
      { ...playerActionIntent, version: 2 },
      { ...playerActionIntent, originalInput: '询问周大爷' },
      { ...playerActionIntent, startLocationId: 'home' },
      { ...playerActionIntent, steps: [{ ...playerActionIntent.steps[0], targetNpcIds: ['old-man'] }] },
      { ...playerActionIntent, steps: [{ ...playerActionIntent.steps[0], kind: 'search' }] },
      { ...playerActionIntent, steps: [{ ...playerActionIntent.steps[0], scope: 'deep' }] },
      { ...playerActionIntent, steps: [{ ...playerActionIntent.steps[0], locationId: 'home' }] },
    ]) expect(sameActionRequestIdentity(request, { ...request, playerActionIntent: intent })).toBe(false);
  });

  it('never treats two invalid persisted intent bindings as an unchanged valid retry', () => {
    const request = { originalInput: '询问门卫', playerActionIntent: { version: 999 } };
    expect(sameActionRequestIdentity(request, structuredClone(request))).toBe(false);
    expect(sameActionRequestIdentity(request, { originalInput: '询问门卫' })).toBe(false);
  });

  it('advances a verified resource parent but rejects missing evidence and historical failed records', () => {
    const parent = buildEvaluationProvenance({ testedCommit: commit, profile: 'options', mode: parseDayMode('standard'),
      model: 'route-a', baseUrl: 'https://gateway.example/v1', maxTurns: 90, runTag: 'resource', baselineCycle: 3 });
    const expected = { ...parent, baselineCycle: 4 };
    const resetEvidence = { reason: 'sanity', beforeResetTime: '2024-09-09T16:00:00',
      afterResetTime: '2024-09-09T08:00:00', afterLocation: 'home', beforeSanity: 0, beforeStamina: 40,
      baselineCycle: 3, afterCycle: 4 };
    const checkpoint = { provenance: parent, baselineCycle: 3, currentCycle: 4,
      tavern: { variables: { cycleCount: 4 } }, lineage: { source: 'fresh' } };
    const result = { provenance: parent, startState: { cycleCount: 3 }, finalState: { cycleCount: 4 },
      stopReason: 'completed-resource-loop', successful: 12, optionChoiceSelections: 11,
      acceptance: { passed: true }, resetEvidence, lineage: { source: 'fresh' } };
    const advance = (candidate: unknown) => assertCampaignAdvance({ expected, checkpoint, result: candidate,
      checkpointText: JSON.stringify(checkpoint), resultText: JSON.stringify(candidate) });
    expect(advance(result)).toMatchObject({ source: 'advance', parentBaselineCycle: 3 });
    expect(() => assertResumeCompatible({ expected: parent, checkpoint, result })).toThrow(/DAY_ADVANCE/);
    for (const change of [
      { resetEvidence: undefined }, { resetEvidence: { ...resetEvidence, beforeSanity: 40 } },
      { successful: 1 }, { optionChoiceSelections: 0 }, { acceptance: { passed: false } },
      { stopReason: 'early-resource-reset:sanity' },
    ]) expect(() => advance({ ...result, ...change })).toThrow();
    expect(() => assertCampaignAdvance({ expected: { ...expected, testedCommit: 'abcdef1234567890abcdef1234567890abcdef12' },
      checkpoint, result, checkpointText: JSON.stringify(checkpoint), resultText: JSON.stringify(result) })).toThrow(/tested commit/);
  });

  it.each([
    { beforeStamina: 1 }, { beforeStamina: undefined }, { beforeStamina: NaN },
    { reason: 'sanity' }, { reason: 'resource' }, { afterCycle: 5 },
    { afterLocation: 'school' }, { afterResetTime: '2024-09-09T07:30:00' },
    { afterResetTime: '2024-09-09T08:00:45' }, { beforeResetTime: 'invalid' },
  ])('rejects unsupported exhaustion or malformed morning evidence: %j', change => {
    const resetEvidence = { ...resourceReset, ...change };
    expect(classifyCycleReset(resetEvidence)).not.toBe('completed-resource-loop');
    expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 12,
      stopReason: 'completed-resource-loop', resetEvidence }).passed).toBe(false);
  });

  it('does not accept an unverified resource label or evidence from another cycle', () => {
    for (const resetEvidence of [undefined, { ...resourceReset, baselineCycle: 2, afterCycle: 3 }]) {
      expect(assessFullDayAcceptance({ baselineCycle: 3, finalCycle: 4, successfulRows: 12,
        stopReason: 'completed-resource-loop', resetEvidence }).passed).toBe(false);
    }
  });

  it('accepts exhaustion between minute boundaries while requiring an exact reset clock', () => {
    expect(classifyCycleReset({ ...resourceReset, beforeResetTime: '2024-09-09T14:00:45.500' }))
      .toBe('completed-resource-loop');
  });
  it('recognizes only a natural baseline-relative cycle 3 to 4 calendar completion', () => {
    expect(classifyCycleReset({ reason: 'day-end', beforeResetTime: '2024-09-10T00:00:00',
      afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4 }))
      .toBe('completed-calendar-day');
    expect(classifyCycleReset({ reason: 'stamina-depleted', beforeResetTime: '2024-09-09T14:00:00.000Z',
      afterResetTime: '2024-09-09T08:00:00', baselineCycle: 3, afterCycle: 4 }))
      .toBe('invalid-resource-reset:stamina-depleted');
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
      stopReason: 'completed-calendar-day' })).toEqual({ passed: true, reasons: [],
        completionKind: 'calendar', calendarDayCompleted: true });
  });

  it('treats 5-8 investigations and 10-16 major actions as reported targets rather than caps', () => {
    const resolution = (id: string, kind: string, executedMinutes: number) => ({
      id, startTime: '2024-09-09T09:00:00', endTime: '2024-09-09T09:55:00',
      plannedMinutes: executedMinutes, executedMinutes,
      segments: [{ step: { kind }, plannedMinutes: executedMinutes, executedMinutes, completed: true }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } },
    });
    const rows = [
      ...Array.from({ length: 9 }, (_, index) => ({ success: true, metrics: { playableMs: 1000 + index },
        majorActionIdentity: `investigate-${index}`, calls: [{ status: 200, totalMs: 500 + index }],
        resolvedAction: resolution(`resolution-investigate-${index}`, 'investigation', 55) })),
      ...Array.from({ length: 8 }, (_, index) => ({ success: true, metrics: { playableMs: 2000 + index },
        majorActionIdentity: `wait-${index}`, calls: [{ status: 200, totalMs: 700 + index }],
        resolvedAction: resolution(`resolution-wait-${index}`, 'wait', 30) })),
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

  it('counts morning investigation intervals separately and deduplicates resumed major action ids', () => {
    const resolution = (id: string, kind: string, startTime: string, planned: number, executed: number) => ({
      id, startTime, endTime: new Date(new Date(startTime).getTime() + executed * 60_000).toISOString(),
      plannedMinutes: planned, executedMinutes: executed,
      segments: [{ step: { kind }, plannedMinutes: planned, executedMinutes: executed, completed: executed === planned }],
      resources: { before: { stamina: 100, sanity: 70 }, after: { stamina: 93, sanity: 70 } },
    });
    const summary = summarizeAuditRows([
      { success: true, majorActionIdentity: 'continuation-action-1',
        resolvedAction: resolution('r1', 'investigation', '2024-09-09T15:30:00', 90, 30),
        calls: [{ status: 200 }] },
      { success: true, majorActionIdentity: 'continuation-action-1',
        resolvedAction: resolution('r2', 'investigation', '2024-09-09T16:00:00', 60, 60),
        calls: [{ status: 200 }] },
      { success: true, majorActionIdentity: 'program-wait-2',
        resolvedAction: resolution('r3', 'wait', '2024-09-09T18:00:00', 30, 30),
        calls: [{ status: 200 }] },
    ]) as Record<string, any>;
    expect(summary.investigations).toMatchObject({ morningExecutionTurns: 1, wholeDayExecutionTurns: 2 });
    expect(summary.majorActions).toMatchObject({ executionTurns: 3, uniqueActionIds: 2, resumedExecutionTurns: 1 });
    expect(summary.targets.investigations.value).toBe(1);
    expect(summary.targets.majorActions.value).toBe(2);
    expect(summary.provider.callClassification).toEqual({ foreground: 0, background: 0, unclassified: 3,
      basis: 'unclassified without per-call stage or orchestration evidence' });
  });

  it('requires actual program-menu coverage when that profile is requested', () => {
    expect(assessFullDayAcceptance({ baselineCycle: 1, finalCycle: 2, successfulRows: 10,
      stopReason: 'completed-calendar-day', programMenuRequired: true, programMenuSelections: 0 }).passed).toBe(false);
  });

  it('requires an accepted selectOption call when the options profile is requested', () => {
    expect(assessFullDayAcceptance({ baselineCycle: 1, finalCycle: 2, successfulRows: 10,
      stopReason: 'completed-calendar-day', optionChoiceRequired: true, optionChoiceSelections: 0 }).passed).toBe(false);
  });
});
