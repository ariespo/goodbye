import { getMaxOutputTokens } from '../../sillytavern/token-budget';
import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { completeParsedStructured, extractJson, type AgentCompletion } from './structured';
import {
  buildNarrativeFactCriticUserPrompt,
  buildNarrativeFormatRepairPrompt,
  buildNarrativeRepairPrompt,
  FACT_CRITIC_SYSTEM_PROMPT,
  buildWriterSystemPrompt,
} from './prompts';
import { NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
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
  const factReview = reviews.find(review => review.assertionAudit || review.continuityAudit || review.continuityEffects);
  return {
    approved: reviews.every(review => review.approved) && violations.length === 0,
    violations,
    corrections: violations.length === 0 ? [] : reviews.flatMap(review => review.corrections),
    assertionAudit: factReview?.assertionAudit,
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

const NARRATIVE_CONTINUITY_REVIEW = `你正在审核实际正文与已知公开连续性，而不是要求每句正文都成为新的事实提案。
continuityContext.publicContinuity 是已经展示的可信开局事件；authorizedBackgroundFacts 是已授权生活史，二者均可自然重述，无须再次 proposal。clock 是当前时钟；recentHistory/memory 用于检查承接，不把玩家愿望或猜测变成事实。
若 publicContinuity 已展示今早06:50的消息，允许“她今早发消息说今天不去学校”或“她六点五十说今天不去学校”等有限转述；06:50与六点五十是同一时间，消息发送时间不必出现在引号内的消息正文中。转述只证明她这样说过，不能推成确认未到校、已请假或新的购买/去向记录。逐个局部断言比对来源，不要因句中有“她今早”就把整句判成未授权往事。
只拒绝明确新增且无授权的事实、物证、具体旧事件、时间线矛盾或人物知识/身份越界。例如擅自确认考勤、请假条、过去具体购买记录，或与已展示今早06:50消息矛盾的说法。请指出具体原句及缺失来源或冲突来源。
普通当下服务动作、当前对话、递交商品和关怀性口吻本身不构成新案件事实；不要因涉及学校、牛奶或善意关怀就拒绝。不要以未逐字复述计划或语气偏好代替事实审核。
发现违规时要求完整修复问答、旁白和依赖选项，不允许静默删除整条台词使对话断链。`;

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
    { role: 'system', content: `${FACT_CRITIC_SYSTEM_PROMPT}\n\n${NARRATIVE_CONTINUITY_REVIEW}` },
    { role: 'user', content: buildNarrativeFactCriticUserPrompt(options.packet, options.narrative, {
      mode: options.continuityMode ?? 'playable',
      lines: evidenceLines,
      possibleAudienceIds,
      activeCommitments,
      resolvedEndTime,
    }) },
  ] as const;
  const value = await completeParsedStructured(
    complete,
    `${options.api.baseUrl}|${options.api.model}`,
    [...messages],
    { temperature: 0, maxTokens: getMaxOutputTokens(options.preset), abortSignal: options.abortSignal },
    NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT,
    raw => {
      const parsed = extractJson(raw) as Partial<FactReview> | null;
      if (!parsed || typeof parsed.approved !== 'boolean'
        || !Array.isArray(parsed.violations) || !Array.isArray(parsed.corrections)) {
        throw new Error('正文事实复核返回了不可解析的结果。');
      }
      return parsed as FactReview;
    },
  );
  const auditReview = validateAssertionAudit(
    value.assertionAudit as AssertionAudit,
    assertionSources,
    narrativeFields,
  );
  const continuityEvidence = buildCharacterContinuityCandidateEvidence({
    candidateText: options.narrative,
    scene,
    assertionAudit: value.assertionAudit ?? { reviewedFields: [], assertions: [] },
    assertionSources,
    possibleAudienceIds,
    resolvedEndTime,
    canonicalPropositionBySourceId: options.canonicalPropositionBySourceId
      ?? (options.factAliases ? buildCanonicalPropositionBySourceId(assertionSources, options.factAliases) : undefined),
  });
  const continuity = validateCharacterContinuityAudit({
    audit: value.continuityAudit as CharacterContinuityAudit | undefined,
    evidence: continuityEvidence,
    memory,
    cycleCount,
    playerIdentityName: options.playerIdentityName,
  });
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
  const violations = [...sanitized.violations, ...auditReview.violations, ...continuityViolations];
  return {
    approved: violations.length === 0,
    violations,
    corrections: [...sanitized.corrections, ...auditReview.corrections,
      ...continuityViolations.map(violation => violation.message)],
    assertionAudit: value.assertionAudit,
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
  complete?: AgentCompletion;
}): Promise<string> {
  const systemPrompt = buildWriterSystemPrompt(options.formatPrompt);
  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
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
