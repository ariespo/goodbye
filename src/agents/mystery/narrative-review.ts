import { getMaxOutputTokens } from '../../sillytavern/token-budget';
import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { AdaptedSchemaResponseError, completeParsedStructured, completeStructured, extractJson, type AgentCompletion } from './structured';
import {
  buildNarrativeFactCriticUserPrompt,
  buildNarrativeFormatRepairPrompt,
  buildNarrativeRepairPrompt,
  buildWriterSystemPrompt,
} from './prompts';
import { LOOP_PACING_CONTRACT } from './loop-contract';
import { ACTION_AUDITED_NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT, NARRATIVE_FACT_REVIEW_JSON_SCHEMA, NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import { ActionAuditReferenceError, buildActionAuditRequirements, resolveActionAuditReferences, validateActionAudit } from './action-audit';
import { mergeRepairResiduals } from './repair-task';
import type { FactReview, FactReviewViolation, WriterPacket } from './types';
import type { ValidationError } from '../../sillytavern/output-protocol';
import { maintextToScene } from '../../engine/scene-parser';
import { characterIdFromSpeaker } from '../../data/npcPlayerKnowledge';
import { normalizeWorldMemory, type WorldMemoryState } from '../../memory/world-memory';
import {
  buildCharacterContinuityCandidateEvidence,
  validateCharacterContinuityAudit,
  type CharacterContinuityAudit,
} from '../../memory/character-continuity';
import type { Scene } from '../../sillytavern/types';
import {
  buildAssertionSources,
  buildCanonicalPropositionBySourceId,
  extractNarrativeFields,
  validateAssertionAudit,
  type AssertionAudit,
} from './fact-assertion-review';
import type { FactAliasTable } from './fact-aliases';
import { AssertionReferenceError, buildAssertionReferenceTable, resolveAssertionAuditReferences, type AssertionReferenceTable } from './assertion-references';
import { buildNarrativeReportRepairStrategy, NarrativeReportRepairError, type NarrativeReportRepairTarget } from './narrative-report-repair';
import { validateAdaptedSchemaValue } from './schema-compatibility';
import { applyNarrativePatch, buildNarrativePatchPrompt, buildNarrativePatchTask, InvalidNarrativePatchError, narrativePatchResponseFormat } from './narrative-patch';

const ASSERTION_STATUSES = new Set([
  'supported', 'unsupported', 'contradicted', 'question', 'hypothesis', 'ordinary-present',
]);
const BELIEF_STATUSES = new Set(['believed', 'suspected', 'inferred']);
const COMMITMENT_OPERATIONS = new Set(['accept', 'fulfill', 'cancel']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function metadataError(path: string, expectation: string): never {
  throw new Error(`${path} ${expectation}。`);
}

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) metadataError(path, '必须是对象');
  return value;
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) metadataError(path, '必须是数组');
  return value;
}

function nonEmptyStringAt(value: unknown, path: string): string {
  if (!isNonEmptyString(value)) metadataError(path, '必须是非空字符串');
  return value;
}

function indexAt(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) metadataError(path, '必须是非负整数');
  return Number(value);
}

function assertReviewedLineSpan(value: unknown, path: string): void {
  const span = recordAt(value, path);
  indexAt(span.lineIndex, `${path}.lineIndex`);
  nonEmptyStringAt(span.quote, `${path}.quote`);
}

function assertContinuityAuditShape(value: unknown): asserts value is CharacterContinuityAudit {
  const audit = recordAt(value, 'continuityAudit');
  if (audit.reviewed !== true) metadataError('continuityAudit.reviewed', '必须为 true');

  const disclosures = arrayAt(audit.disclosures, 'continuityAudit.disclosures');
  disclosures.forEach((value, index) => {
    const path = `continuityAudit.disclosures[${index}]`;
    const disclosure = recordAt(value, path);
    indexAt(disclosure.assertionIndex, `${path}.assertionIndex`);
    indexAt(disclosure.lineIndex, `${path}.lineIndex`);
    nonEmptyStringAt(disclosure.quote, `${path}.quote`);
    arrayAt(disclosure.listenerIds, `${path}.listenerIds`)
      .forEach((listenerId, listenerIndex) => {
        nonEmptyStringAt(listenerId, `${path}.listenerIds[${listenerIndex}]`);
      });
    arrayAt(disclosure.audienceEvidence, `${path}.audienceEvidence`)
      .forEach((span, spanIndex) => assertReviewedLineSpan(span, `${path}.audienceEvidence[${spanIndex}]`));
  });

  const beliefs = arrayAt(audit.beliefs, 'continuityAudit.beliefs');
  beliefs.forEach((value, index) => {
    const path = `continuityAudit.beliefs[${index}]`;
    const belief = recordAt(value, path);
    indexAt(belief.assertionIndex, `${path}.assertionIndex`);
    nonEmptyStringAt(belief.observerId, `${path}.observerId`);
    const status = nonEmptyStringAt(belief.status, `${path}.status`);
    if (!BELIEF_STATUSES.has(status)) metadataError(`${path}.status`, '不是允许的认知状态');
    arrayAt(belief.evidence, `${path}.evidence`)
      .forEach((span, spanIndex) => assertReviewedLineSpan(span, `${path}.evidence[${spanIndex}]`));
  });

  const commitments = arrayAt(audit.commitments, 'continuityAudit.commitments');
  commitments.forEach((value, index) => {
    const path = `continuityAudit.commitments[${index}]`;
    const commitment = recordAt(value, path);
    const operation = nonEmptyStringAt(commitment.operation, `${path}.operation`);
    if (!COMMITMENT_OPERATIONS.has(operation)) metadataError(`${path}.operation`, '不是允许的承诺操作');
    nonEmptyStringAt(commitment.actorId, `${path}.actorId`);
    nonEmptyStringAt(commitment.recipientId, `${path}.recipientId`);
    arrayAt(commitment.evidence, `${path}.evidence`)
      .forEach((span, spanIndex) => assertReviewedLineSpan(span, `${path}.evidence[${spanIndex}]`));

    for (const property of ['existingCommitmentId', 'action', 'locationId', 'dueAt'] as const) {
      if (commitment[property] !== undefined) nonEmptyStringAt(commitment[property], `${path}.${property}`);
    }
    if (operation === 'accept') {
      nonEmptyStringAt(commitment.action, `${path}.action`);
      nonEmptyStringAt(commitment.locationId, `${path}.locationId`);
      nonEmptyStringAt(commitment.dueAt, `${path}.dueAt`);
    } else {
      nonEmptyStringAt(commitment.existingCommitmentId, `${path}.existingCommitmentId`);
    }
  });
}

/** Reject incomplete critic metadata inside the structured-output retry boundary. */
function parseNarrativeFactReview(
  raw: string,
  assertionSources: ReturnType<typeof buildAssertionSources>,
  narrativeFields: Record<string, string>,
  references: AssertionReferenceTable,
): FactReview {
  const parsed = extractJson(raw);
  if (!isRecord(parsed) || typeof parsed.approved !== 'boolean'
    || !Array.isArray(parsed.violations) || parsed.violations.some(violation => (
      !isRecord(violation) || !isNonEmptyString(violation.code) || !isNonEmptyString(violation.message)
      || (violation.factId !== undefined && typeof violation.factId !== 'string')
    ))
    || !Array.isArray(parsed.corrections)
    || parsed.corrections.some(correction => typeof correction !== 'string')) {
    throw new Error('正文事实复核返回了不可解析的顶层结果。');
  }

  let assertionAudit = parsed.assertionAudit;
  if (isRecord(assertionAudit)) {
    const auditRecord = assertionAudit;
    const misplaced = ['actionAudit', 'continuityAudit'].filter(key => Object.hasOwn(auditRecord, key));
    if (misplaced.length) {
      throw new Error(misplaced.map(key => `$.assertionAudit.${key} 放错层级，必须位于 $.${key}，与 $.assertionAudit 同级；assertionAudit 仅包含 assertions，不得把其他审查塞进其中`).join('\n'));
    }
  }
  assertionAudit = resolveAssertionAuditReferences(assertionAudit, references);
  parsed.assertionAudit = assertionAudit;
  if (!isRecord(assertionAudit)
    || !Array.isArray(assertionAudit.reviewedFields)
    || assertionAudit.reviewedFields.some(field => !isNonEmptyString(field))
    || !Array.isArray(assertionAudit.assertions)
    || assertionAudit.assertions.some(assertion => {
      if (!isRecord(assertion)
        || !isNonEmptyString(assertion.field)
        || !isNonEmptyString(assertion.quote)
        || !isNonEmptyString(assertion.proposition)
        || !isNonEmptyString(assertion.status) || !ASSERTION_STATUSES.has(assertion.status)
        || !Array.isArray(assertion.citations)
        || !isNonEmptyString(assertion.reason)) return true;
      return assertion.citations.some(citation => (
        !isRecord(citation) || !isNonEmptyString(citation.sourceId) || !isNonEmptyString(citation.quote)
      ));
    })) {
    throw new Error('正文断言审查缺少有效字段、原文引文、命题、状态、引用或理由。');
  }
  const coverage = validateAssertionAudit(
    assertionAudit as unknown as AssertionAudit,
    assertionSources,
    narrativeFields,
  );
  const incompleteCoverage = coverage.violations.filter(violation => violation.code === 'incomplete-assertion-audit');
  if (incompleteCoverage.length > 0) {
    throw new Error(incompleteCoverage.map(violation => violation.message).join('\n'));
  }

  assertContinuityAuditShape(parsed.continuityAudit);

  return parsed as unknown as FactReview;
}

/** Only program-emitted, precisely located metadata errors authorize a partial report edit. */
function locateReportRepair(error: unknown, raw: string, references: AssertionReferenceTable,
  actionRequirements: ReturnType<typeof buildActionAuditRequirements>, visibleLines: readonly string[]): Error {
  const fallback = error instanceof Error ? error : new Error(String(error));
  let report: unknown;
  try { report = extractJson(raw); } catch { return fallback; }
  if (!isRecord(report) || !isRecord(report.assertionAudit)
    || Object.hasOwn(report.assertionAudit, 'reviewedFields') || !Array.isArray(report.assertionAudit.assertions)) return fallback;
  // A first shape error can hide later ones. Partial correction is reserved for a
  // complete wire envelope; malformed shapes get the single full correction.
  try { validateAdaptedSchemaValue(report, NARRATIVE_FACT_REVIEW_JSON_SCHEMA); }
  catch { return fallback; }
  const targets: NarrativeReportRepairTarget[] = [];
  if (error instanceof AssertionReferenceError) {
    if (error.requiresFullRepair) return fallback;
    // Continuity depends on the unresolved assertions. Do not authorize a patch
    // before we can check those dependent records; a full correction can fix both.
    const continuity = report.continuityAudit as Record<string, unknown[]>;
    if (['disclosures', 'beliefs', 'commitments'].some(key => continuity[key].length > 0)) return fallback;
    try {
      const action = resolveActionAuditReferences(report.actionAudit, visibleLines);
      if (!validateActionAudit(action, actionRequirements, visibleLines.join('\n'), visibleLines).metadataValid) return fallback;
    } catch { return fallback; }
    for (const index of error.assertionIndices) {
      const assertion = report.assertionAudit.assertions[index];
      const validUnit = isRecord(assertion) && references.units.some(unit => unit.unitId === assertion.unitId);
      targets.push({ kind: 'assertion', index, ...(!validUnit ? { unlockUnitId: true } : {}), issue: error.message });
    }
    targets.push(...error.missingUnitIds.map(unitId => ({ kind: 'missing-assertion' as const, unitId, issue: error.message })));
  } else {
    for (const issue of fallback.message.split('\n')) {
      // This explanatory suffix is added only after the precise continuity diagnostics below.
      if (issue.startsWith('听众修正：')) continue;
      const continuity = /^(?:continuityAudit：(disclosure|belief|commitment) (\d+) |continuityAudit\.(disclosures|beliefs|commitments)\[(\d+)\])/.exec(issue);
      if (continuity) {
        const collection = continuity[3] ?? ({ disclosure: 'disclosures', belief: 'beliefs', commitment: 'commitments' } as const)[continuity[1] as 'disclosure' | 'belief' | 'commitment'];
        targets.push({ kind: 'continuity', collection: collection as 'disclosures' | 'beliefs' | 'commitments', index: Number(continuity[2] ?? continuity[4]), allowDelete: true, issue });
        continue;
      }
      const action = /^actionAudit(?:：|\.)(originalRequest|followThrough)(?:\s|\.)/.exec(issue);
      if (action) {
        targets.push({ kind: 'action', judgment: action[1] as 'originalRequest' | 'followThrough', issue });
        continue;
      }
      const segment = /^actionAudit\.segments\[(\d+)\]/.exec(issue);
      if (segment) {
        targets.push({ kind: 'action-segment', index: Number(segment[1]), issue });
        continue;
      }
      return fallback;
    }
  }
  const unique = new Map<string, NarrativeReportRepairTarget>();
  for (const target of targets) {
    const { issue, ...identity } = target;
    const key = JSON.stringify(identity);
    const prior = unique.get(key);
    unique.set(key, prior ? { ...target, issue: `${prior.issue}\n${issue}` } : target);
  }
  return unique.size ? new NarrativeReportRepairError(fallback.message, [...unique.values()]) : fallback;
}

export interface NarrativeRepairFailure {
  draft: string;
  /** The draft is valid; retry must resume at the reviewer instead of invoking Writer. */
  reviewPending?: boolean;
  review?: FactReview;
  formatErrors?: ValidationError[];
  priorResiduals?: FactReviewViolation[];
  priorFormatResiduals?: ValidationError[];
}

/** Cache payload when a fact-repair attempt then fails protocol. Keeps both lists. */
export function snapshotFactRepairFormatFailure(options: {
  draft: string;
  errors: ValidationError[];
  priorFormatResiduals?: ValidationError[];
  review: FactReview;
  priorResiduals?: FactReviewViolation[];
}): NarrativeRepairFailure {
  return {
    draft: options.draft,
    formatErrors: options.errors,
    priorFormatResiduals: options.priorFormatResiduals ?? [],
    review: options.review,
    priorResiduals: options.priorResiduals ?? [],
  };
}

/** Cache payload when format repair throws. Keeps in-flight fact residuals if a review exists. */
export function snapshotFormatRepairCallFailure(options: {
  draft: string;
  error: unknown;
  priorFormatResiduals?: ValidationError[];
  review?: FactReview;
  priorResiduals?: FactReviewViolation[];
}): NarrativeRepairFailure {
  const errors: ValidationError[] = [{
    code: 'FORMAT_REPAIR_CALL_FAILED',
    message: options.error instanceof Error ? options.error.message : String(options.error),
  }];
  if (options.review) {
    return snapshotFactRepairFormatFailure({
      draft: options.draft,
      errors,
      priorFormatResiduals: options.priorFormatResiduals,
      review: options.review,
      priorResiduals: options.priorResiduals,
    });
  }
  return {
    draft: options.draft,
    formatErrors: errors,
    priorFormatResiduals: options.priorFormatResiduals ?? [],
  };
}

/** Cache payload when the narrative critic/style call throws. Retry resumes the failed review stage. */
export function snapshotNarrativeReviewCallFailure(options: {
  draft: string;
  error: unknown;
  priorResiduals?: FactReviewViolation[];
}): NarrativeRepairFailure {
  // Touch the error so callers can pass unknown safely while keeping transient
  // transport details out of Writer-facing repair instructions.
  void (options.error instanceof Error ? options.error.message : String(options.error));
  return {
    draft: options.draft,
    reviewPending: true,
    priorResiduals: options.priorResiduals ?? [],
  };
}

/** Player retry: fix tags first if protocol is still broken; otherwise continue fact repair in place. */
export function buildRetryPromptFromNarrativeFailure(
  packet: WriterPacket,
  failure: NarrativeRepairFailure,
): string {
  if (failure.reviewPending) {
    throw new Error('正文仍待审查，不应构造 Writer 修复提示。');
  }
  const formatErrors = failure.formatErrors;
  if (formatErrors && formatErrors.length > 0) {
    return buildNarrativeFormatRepairPrompt(
      packet,
      failure.draft,
      formatErrors,
      failure.priorFormatResiduals ?? [],
    );
  }
  if (failure.review) {
    return buildNarrativeRepairPrompt(
      packet,
      failure.draft,
      failure.review,
      failure.priorResiduals ?? [],
    );
  }
  throw new Error('失败正文缓存缺少协议错误和事实审查，无法继续修复。');
}

export function factResidualsForRetry(
  failure: Pick<NarrativeRepairFailure, 'review' | 'priorResiduals'> | null | undefined,
): FactReviewViolation[] {
  const prior = failure?.priorResiduals ?? [];
  if (!failure?.review) return prior;
  return mergeRepairResiduals(prior, failure.review.violations);
}

const STYLE_VIOLATION_CODES = new Set([
  'repeated-prose',
  'repeated-imagery',
  'style-template-repetition',
]);

export function isStyleOnlyNarrativeReview(review: FactReview): boolean {
  return review.violations.length > 0
    && review.violations.every(item => STYLE_VIOLATION_CODES.has(item.code));
}

const UNAUTHORIZED_CASE_HISTORY = /(?:文穗|穿校服的女孩|那个女孩|她)[^。！？\n]{0,100}(?:今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2}|买了|付钱|付款|离开(?:了)?|好像往|似乎往|往[^。！？\n]{1,16}(?:走了|去了))|(?:今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2})[^。！？\n]{0,80}(?:文穗|女孩|她)/;
const HISTORICAL_HABIT = /(?:以前|平时|经常|总是|每次|向来)[^。！？\n]{0,80}(?:来|一起|同行|买|照顾|打招呼|见)/;
const UNAUTHORIZED_EVIDENCE_DETAIL = /小票|收据|文件夹|监控(?:记录|录像)?|病历|短信(?:记录)?|聊天记录|通话记录|照片|票据|物证/;
const OPEN_HISTORY_QUESTION = /是否|有没有|有没|可能|吗|未必|不确定/;
const NEGATED_HISTORY_RESULT = /(?:未|没有|并未|无法|不能)(?:提供|得知|确认|获得|发现|说明)[^。！？\n]{0,30}(?:今早|今天早上|早上(?!好)|昨晚|昨天|行踪|去向)/;

export function reviewNarrativeDeterministically(
  packet: Pick<WriterPacket, 'authorizedFacts' | 'playerKnownFacts'>
    & Partial<Pick<WriterPacket,
      'authorizedBackgroundFacts'
      | 'authorizedKnowledgeEvents'
      | 'authorizedActionOutcomes'
      | 'approvedBackgroundFactProposals'>>
    & { continuityContext?: Record<string, unknown> },
  narrative: string,
): FactReviewViolation[] {
  const fields = extractNarrativeFields(narrative);
  const backgroundSourceTexts = buildAssertionSources(packet as WriterPacket, fields)
    .filter(source => source.kind === 'background')
    .map(source => source.text);
  // A question in another line must not pardon an asserted, invented answer.
  return narrative.split(/[。！？\n]/)
    .flatMap(sentence => reviewNarrativeSentence(packet, sentence, backgroundSourceTexts));
}

export function combineNarrativeReviews(reviews: FactReview[]): FactReview {
  const violations = reviews.flatMap(review => review.violations);
  const factReview = reviews.find(review => review.assertionAudit || review.actionAudit || review.continuityAudit || review.continuityEffects);
  return {
    approved: reviews.every(review => review.approved) && violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : reviews.flatMap(review => review.corrections),
    assertionAudit: factReview?.assertionAudit,
    actionAudit: factReview?.actionAudit,
    continuityAudit: factReview?.continuityAudit,
    continuityEffects: factReview?.continuityEffects,
  };
}

function reviewNarrativeSentence(
  packet: Parameters<typeof reviewNarrativeDeterministically>[0],
  narrative: string,
  backgroundSourceTexts: string[],
): FactReviewViolation[] {
  const evidenceMatch = narrative.match(UNAUTHORIZED_EVIDENCE_DETAIL);
  const publicContinuity = packet.continuityContext?.publicContinuity;
  const publicTexts = Array.isArray(publicContinuity)
    ? publicContinuity.flatMap(item => item && typeof item.text === 'string' ? [item.text] : [])
    : [];
  const authorizedText = [
    ...packet.authorizedFacts.map(fact => fact.text),
    ...packet.playerKnownFacts.map(fact => fact.text),
    ...backgroundSourceTexts,
    ...(packet.authorizedKnowledgeEvents ?? []).map(event => event.evidence),
    ...publicTexts,
  ].join('\n');
  if (evidenceMatch && !authorizedText.includes(evidenceMatch[0])) {
    return [{
      code: 'ungrounded-evidence-detail',
      message: `正文补写了未获授权的可调查物件或记录（${evidenceMatch[0]}）。完整违规句：${narrative.trim()}。请完整修复该句及其依赖内容。`,
    }];
  }
  const habitMatch = narrative.match(HISTORICAL_HABIT);
  const habitAuthorized = backgroundSourceTexts.some(sourceText => {
    const sameSubject = [
      ['文穗', '文穗'], ['女孩', '女孩'], ['她', '文穗'], ['你', '玩家'], ['玩家', '玩家'],
    ].some(([narrativeSubject, sourceSubject]) => (
      narrative.includes(narrativeSubject) && sourceText.includes(sourceSubject)
    ));
    const sameHabit = [
      [/(?:来|去|同行|一起)/, /(?:来|去|同行|一起)/],
      [/(?:买|结账)/, /(?:买|结账)/],
      [/(?:照顾|关心)/, /(?:照顾|关心)/],
      [/(?:打招呼|认识|见)/, /(?:打招呼|认识|见)/],
    ].some(([narrativePattern, sourcePattern]) => (
      narrativePattern.test(narrative) && sourcePattern.test(sourceText)
    ));
    return sameSubject && sameHabit;
  });
  if (habitMatch && !habitAuthorized) {
    return [{
      code: 'ungrounded-past-claim',
      message: `正文出现了无固定生活史或已接受软设定来源的习惯性旧经历。完整违规句：${narrative.trim()}。`,
    }];
  }
  // Exempt only the reported statement, never its adjacent conclusion. The
  // public message proves what she said, not attendance or her later actions.
  const hasMorningMessage = Array.isArray(publicContinuity) && publicContinuity.some(item =>
    item?.id === 'opening-message-0650' && typeof item.text === 'string'
    && item.text.includes('06:50') && item.text.includes('不去学校'));
  const historyToCheck = hasMorningMessage
    ? narrative.replace(/(?:她|文穗)(?:今早|今天早上)?(?:六点五十|0?6[:：]50)?(?:发(?:来)?(?:聊天)?消息说|说)(?:她)?今天不去学校/g, '')
    : narrative;
  const match = historyToCheck.match(UNAUTHORIZED_CASE_HISTORY)
    ?? (historyToCheck !== narrative
      ? historyToCheck.match(/(?:确认|确定|证实)(?:她|文穗)(?:未到校|没有去学校)/)
      : null);
  if (!match) return [];
  if (OPEN_HISTORY_QUESTION.test(narrative) || NEGATED_HISTORY_RESULT.test(narrative)) return [];
  if (/现在|此刻|眼下|当场/.test(narrative)
    && !/今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2}/.test(narrative)) return [];
  if (authorizedText.includes(match[0])) return [];
  return [{
    code: 'ungrounded-past-claim',
    message: `正文补写了未获授权的既往来访、购买或去向。完整违规句：${narrative.trim()}。匹配片段“${match[0]}”只是定位，不代表整句的其余断言已获授权。`,
  }];
}

export function removeUngroundedNarrativeLines(
  _packet: Parameters<typeof reviewNarrativeDeterministically>[0],
  narrative: string,
): string {
  // Compatibility entry point: violations belong to full-scene review/repair.
  // Deleting individual lines silently breaks questions, answers and options.
  return narrative;
}

const NARRATIVE_CONTINUITY_REVIEW = `你是《漫长的告别》的正文审查 Agent，只判断候选正文是否符合获准事实、角色权限、实际行动及公开连续性。你不改写剧情，不输出隐藏真相，不修改状态；程序会再次验证你的审查报告。不是要求每句正文都成为新的事实提案。
continuityContext.publicContinuity 是已经展示的可信开局事件；authorizedBackgroundFacts 是已授权生活史，二者均可自然重述，无须再次 proposal。clock 是当前时钟；recentHistory/memory 用于检查承接，不把玩家愿望或猜测变成事实。
若 publicContinuity 已展示今早06:50的消息，允许“她今早发消息说今天不去学校”或“她六点五十说今天不去学校”等有限转述；06:50与六点五十是同一时间，消息发送时间不必出现在引号内的消息正文中。转述只证明她这样说过，不能推成确认未到校、已请假或新的购买/去向记录。逐个局部断言比对来源，不要因句中有“她今早”就把整句判成未授权往事。
事实方面只拒绝明确新增且无授权的事实、物证、具体旧事件、时间线矛盾或人物知识/身份越界。例如擅自确认考勤、请假条、过去具体购买记录，或与已展示今早06:50消息矛盾的说法。请指出具体原句及缺失来源或冲突来源。对实际可播放正文还需按 resolvedAction.segments 检查已执行行动的过程覆盖；这不是要求复述全部事实或按字数评价。辅助清单不承担行动演出覆盖。
普通当下服务动作、当前对话、递交商品和关怀性口吻本身不构成新案件事实；不要因涉及学校、牛奶或善意关怀就拒绝。不要以未逐字复述计划或语气偏好代替事实审核。
发现违规时要求完整修复问答、旁白和依赖选项，不允许静默删除整条台词使对话断链。
严格遵守本次 NarrativeReviewOutputSchema：approved、violations、corrections、assertionAudit、continuityAudit、actionAudit 是六个同级顶层字段。assertionAudit 内仅含 assertions，通过 unitId 与 citations 的 sourceUnitId 引用本次材料；continuityAudit 与 actionAudit 不得嵌入 assertionAudit。正文断言和行动审查由程序回填引文；完整性不等于语义通过，仍须实际判断每项。辅助或无执行记录时 actionAudit 为 null。不得为了凑齐字段补造依据、违规或通过结论。`;

export function sanitizeNarrativeFactReview(
  review: FactReview,
  packet: Pick<WriterPacket, 'authorizedFacts'>,
): FactReview {
  void packet;
  const explicitlySaysNoViolation = (value: string) => (
    /不构成违规|并非违规|无需修正|(?:未发现|没有发现|不存在|无)(?:任何|潜在)?违规|故不违规|已获授权.*(?:符合|不违规)/
      .test(value)
  );
  const isFalseMandatoryLyingClaim = (value: string) => {
    const normalized = value.toLowerCase();
    return normalized.includes('lies-about')
      && (normalized.includes('未体现其主动撒谎')
        || normalized.includes('未体现主动撒谎')
        || normalized.includes('必须主动撒谎'));
  };
  const violations = review.violations.filter(violation => {
    const value = `${violation.code} ${violation.factId ?? ''} ${violation.message}`;
    return !explicitlySaysNoViolation(violation.message)
      && !isFalseMandatoryLyingClaim(value);
  });
  const corrections = violations.length === 0 ? [] : review.corrections.filter(correction => (
    !explicitlySaysNoViolation(correction)
    && !isFalseMandatoryLyingClaim(correction)
  ));
  return { approved: violations.length === 0, violations, corrections };
}

export async function reviewNarrativeAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  narrative: string;
  abortSignal?: AbortSignal;
  complete?: AgentCompletion;
  /** Exact accepted scene and program-only authority used to validate continuity effects. */
  scene?: Pick<Scene, 'lines'>;
  continuityMode?: 'playable' | 'auxiliary';
  continuityMemory?: WorldMemoryState;
  cycleCount?: number;
  possibleAudienceIds?: readonly string[];
  resolvedEndTime?: string;
  playerIdentityName?: string;
  canonicalPropositionBySourceId?: Readonly<Record<string, string>>;
  factAliases?: FactAliasTable;
}): Promise<FactReview> {
  const deterministicViolations = reviewNarrativeDeterministically(options.packet, options.narrative);
  if (deterministicViolations.length > 0) {
    return {
      approved: false,
      violations: deterministicViolations,
      corrections: [
        '根据完整违规句撤销无授权结论，并同步修复门卫等人物陈述、旁白、hint、sum和选项中依赖该结论的整条因果链；不能只替换被匹配的前缀，也不能静默删除整条台词造成断链。',
        '即使已批准的 plan 含有同类错误收束，也必须修正该错误及其依赖内容，事实授权优先于保留计划。人物没在门口看见她不能证明她未到校；她自述不去学校不能替代已核实的考勤、请假或去向。可以保留已授权公开连续性和生活史，并以尚未确认的状态承接下一步。',
      ],
    };
  }
  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  const narrativeFields = extractNarrativeFields(options.narrative);
  const assertionSources = buildAssertionSources(options.packet, narrativeFields);
  const scene = options.scene ?? maintextToScene(narrativeFields.maintext ?? options.narrative);
  const references = buildAssertionReferenceTable(narrativeFields, assertionSources, scene);
  const actionRequirements = buildActionAuditRequirements(options.packet, options.continuityMode ?? 'playable');
  const memory = options.continuityMemory ?? normalizeWorldMemory({});
  const cycleCount = options.cycleCount ?? options.packet.resolvedAction?.cycleCount ?? 1;
  const resolvedEndTime = options.resolvedEndTime ?? options.packet.resolvedAction?.endTime
    ?? '2024-09-09T08:00:00';
  const evidenceLines = scene.lines.map((line, lineIndex) => ({
    lineIndex,
    speakerId: characterIdFromSpeaker(line.speaker),
    text: line.text,
    ...(line.background ? { background: line.background } : {}),
  }));
  const possibleAudienceIds = [...new Set([
    'player',
    ...(options.possibleAudienceIds ?? []),
    ...evidenceLines.map(line => line.speakerId).filter((id): id is string => id !== null),
  ])];
  const activeCommitments = (memory.commitments ?? []).filter(commitment => (
    commitment.status === 'active' && commitment.cycleCount === cycleCount
  )).map(({ id, actorId, recipientId, action, locationId, dueAt, evidenceQuote }) => ({
    id, actorId, recipientId, action, locationId, dueAt, evidenceQuote,
  }));
  const messages = [
    { role: 'system', content: `${LOOP_PACING_CONTRACT}\n\n${NARRATIVE_CONTINUITY_REVIEW}` },
    { role: 'user', content: buildNarrativeFactCriticUserPrompt(options.packet, options.narrative, {
      mode: options.continuityMode ?? 'playable',
      lines: evidenceLines,
      possibleAudienceIds,
      activeCommitments,
      resolvedEndTime,
    }, references) },
  ] as const;
  const canonicalPropositionBySourceId = options.canonicalPropositionBySourceId
    ?? (options.factAliases ? buildCanonicalPropositionBySourceId(assertionSources, options.factAliases) : undefined);
  const parseReview = (raw: string) => {
    try {
      const value = parseNarrativeFactReview(raw, assertionSources, narrativeFields, references);
      const visibleLines = scene.lines.map(line => line.text);
      const reportErrors: string[] = [];
      if (actionRequirements) {
        try {
          value.actionAudit = resolveActionAuditReferences(value.actionAudit, visibleLines) as FactReview['actionAudit'];
        } catch (error) {
          if (error instanceof ActionAuditReferenceError) {
            value.actionAudit = error.resolvedAudit as FactReview['actionAudit'];
            reportErrors.push(...error.errors);
          } else reportErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
      const actionReview = validateActionAudit(value.actionAudit, actionRequirements, visibleLines.join('\n'), visibleLines);
      reportErrors.push(...actionReview.metadataErrors);
      const continuityEvidence = buildCharacterContinuityCandidateEvidence({
        candidateText: options.narrative,
        scene,
        assertionAudit: value.assertionAudit ?? { reviewedFields: [], assertions: [] },
        assertionSources,
        possibleAudienceIds,
        resolvedEndTime,
        canonicalPropositionBySourceId,
      });
      const continuity = validateCharacterContinuityAudit({
        audit: value.continuityAudit as CharacterContinuityAudit | undefined,
        evidence: continuityEvidence,
        memory,
        cycleCount,
        playerIdentityName: options.playerIdentityName,
      });
      if (options.continuityMode !== 'auxiliary' && !continuity.approved) {
        reportErrors.push(...continuity.violations.map(message => `continuityAudit：${message}`));
        if (continuity.violations.some(message => /listener|audience/.test(message))) {
          reportErrors.push('听众修正：逐项复查被拒绝的 disclosure 与 audienceEvidence；在场、继续询问、观察、移动不证明听见该句。找不到直接称呼、紧接回应或明确电话/消息证据时，不登记该条披露；没有合格披露可返回 disclosures: []，但保留其他有证据的记录。不得修改正文来凑出听众证据。');
        }
      }
      if (reportErrors.length) throw new Error([...new Set(reportErrors)].join('\n'));
      return { value, continuity, actionReview };
    } catch (error) {
      throw locateReportRepair(error, raw, references, actionRequirements, scene.lines.map(line => line.text));
    }
  };
  const responseFormat = actionRequirements ? ACTION_AUDITED_NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT : NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT;
  const reviewed = await completeParsedStructured(
    complete,
    `${options.api.baseUrl}|${options.api.model}`,
    [...messages],
    { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal },
    responseFormat,
    parseReview,
    buildNarrativeReportRepairStrategy({ messages: [...messages], responseFormat, parse: parseReview }),
  );
  const { value, continuity, actionReview } = reviewed;
  const auditReview = validateAssertionAudit(
    value.assertionAudit as AssertionAudit,
    assertionSources,
    narrativeFields,
  );
  const sanitized = sanitizeNarrativeFactReview(value, options.packet);
  const proposedContinuityAudit = value.continuityAudit as Partial<CharacterContinuityAudit> | undefined;
  const auxiliaryHasEffects = options.continuityMode === 'auxiliary'
    && !!proposedContinuityAudit
    && ([proposedContinuityAudit.disclosures, proposedContinuityAudit.beliefs,
      proposedContinuityAudit.commitments]
      .some(proposals => Array.isArray(proposals) && proposals.length > 0));
  const continuityViolations: FactReviewViolation[] = auxiliaryHasEffects
    ? [{ code: 'auxiliary-continuity-effect', message: '辅助清单审查不得产生角色学习、披露或承诺。' }]
    : continuity.violations.map(message => ({
        code: message.includes('explicitly review')
          ? 'incomplete-continuity-audit' as const
          : 'invalid-continuity-audit' as const,
        message,
      }));
  const violations = [...sanitized.violations, ...auditReview.violations, ...continuityViolations, ...actionReview.violations];
  return {
    approved: violations.length === 0,
    violations,
    corrections: [...sanitized.corrections, ...auditReview.corrections,
      ...continuityViolations.map(violation => violation.message), ...actionReview.corrections],
    assertionAudit: value.assertionAudit,
    actionAudit: actionRequirements ? value.actionAudit : null,
    continuityAudit: value.continuityAudit,
    ...(!auxiliaryHasEffects && violations.length === 0 && continuity.effects
      ? { continuityEffects: continuity.effects } : {}),
  };
}

export async function repairNarrativeAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  rejectedNarrative: string;
  review: FactReview;
  formatPrompt?: string;
  abortSignal?: AbortSignal;
  priorResiduals?: FactReviewViolation[];
  /** The caller allows at most one local attempt inside its existing repair budget. */
  allowLocalizedRepair?: boolean;
  complete?: AgentCompletion;
}): Promise<string> {
  const systemPrompt = buildWriterSystemPrompt(options.formatPrompt);
  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  const task = options.allowLocalizedRepair !== false
    ? buildNarrativePatchTask(options.rejectedNarrative, options.review) : undefined;
  if (task) {
    try {
      const response = await completeStructured(complete, `${options.api.baseUrl}|${options.api.model}`, [
        { role: 'system', content: `${systemPrompt}\n\n[本次局部修复输出约定]\n本次调用只输出局部修复 JSON，不输出场景标签全文。保留所有事实与角色权限；程序负责把替换文本合入原场景并重新审查。` },
        { role: 'user', content: buildNarrativePatchPrompt(task, options.packet, options.review, options.priorResiduals ?? []) },
      ], { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal }, narrativePatchResponseFormat(task));
      return applyNarrativePatch(task, response, options.rejectedNarrative);
    } catch (error) {
      // Schema dialect validation is a malformed patch, not a network failure.
      // No hidden correction call here: the outer loop owns the entire repair budget.
      if (error instanceof AdaptedSchemaResponseError) throw new InvalidNarrativePatchError(error.message);
      throw error;
    }
  }
  return complete([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildNarrativeRepairPrompt(
        options.packet,
        options.rejectedNarrative,
        options.review,
        options.priorResiduals ?? [],
      ),
    },
  ], { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal });
}

export async function repairNarrativeFormatAgainstWriterPacket(options: {
  api: ApiConfig;
  preset: ChatPreset | null;
  packet: WriterPacket;
  rejectedNarrative: string;
  errors: ValidationError[];
  formatPrompt?: string;
  abortSignal?: AbortSignal;
  priorResiduals?: ValidationError[];
  complete?: AgentCompletion;
}): Promise<string> {
  const systemPrompt = buildWriterSystemPrompt(options.formatPrompt);
  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  return complete([
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: buildNarrativeFormatRepairPrompt(
        options.packet,
        options.rejectedNarrative,
        options.errors,
        options.priorResiduals ?? [],
      ),
    },
  ], { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal });
}
