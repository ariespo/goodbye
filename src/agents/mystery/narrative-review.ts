import { callSecondaryApi, type ApiConfig } from '../../sillytavern/api-router';
import type { ChatPreset } from '../../sillytavern/types';
import { completeParsedStructured, extractJson, type AgentCompletion } from './structured';
import {
  buildNarrativeFactCriticUserPrompt,
  buildNarrativeFormatRepairPrompt,
  buildNarrativeRepairPrompt,
  FACT_CRITIC_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from './prompts';
import { FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import { mergeRepairResiduals } from './repair-task';
import type { FactReview, FactReviewViolation, WriterPacket } from './types';
import type { ValidationError } from '../../sillytavern/output-protocol';

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
    & Partial<Pick<WriterPacket, 'authorizedBackgroundFacts' | 'authorizedKnowledgeEvents'>>,
  narrative: string,
): FactReviewViolation[] {
  const evidenceMatch = narrative.match(UNAUTHORIZED_EVIDENCE_DETAIL);
  const authorizedText = [
    ...packet.authorizedFacts.map(fact => fact.text),
    ...packet.playerKnownFacts.map(fact => fact.text),
    ...(packet.authorizedKnowledgeEvents ?? []).map(event => event.evidence),
  ].join('\n');
  if (evidenceMatch && !authorizedText.includes(evidenceMatch[0])) {
    return [{
      code: 'ungrounded-evidence-detail',
      message: `正文补写了未获授权的可调查物件或记录：“${evidenceMatch[0]}”。请删除该信息，只保留当下普通互动。`,
    }];
  }
  const habitMatch = narrative.match(HISTORICAL_HABIT);
  if (habitMatch && (packet.authorizedBackgroundFacts?.length ?? 0) === 0) {
    return [{
      code: 'ungrounded-past-claim',
      message: `正文出现了无固定生活史或已接受软设定来源的习惯性旧经历：“${habitMatch[0]}”。`,
    }];
  }
  const match = narrative.match(UNAUTHORIZED_CASE_HISTORY);
  if (!match) return [];
  if (OPEN_HISTORY_QUESTION.test(narrative) || NEGATED_HISTORY_RESULT.test(narrative)) return [];
  const caseAuthorization = [...packet.authorizedFacts, ...packet.playerKnownFacts]
    .some(fact => /今早|今天早上|早上(?!好)|昨晚|昨天|\d{1,2}\s*[:：]\s*\d{2}|买|付款|离开|去往|行踪/.test(fact.text));
  if (caseAuthorization) return [];
  return [{
    code: 'ungrounded-past-claim',
    message: `正文补写了未获授权的既往来访、购买或去向：“${match[0]}”。请删除该信息，只保留当下普通互动。`,
  }];
}

export function removeUngroundedNarrativeLines(
  packet: Parameters<typeof reviewNarrativeDeterministically>[0],
  narrative: string,
): string {
  return narrative
    .split(/\r?\n/)
    .filter(line => reviewNarrativeDeterministically(packet, line).length === 0)
    .join('\n');
}

export function sanitizeNarrativeFactReview(
  review: FactReview,
  packet: Pick<WriterPacket, 'authorizedFacts'>,
): FactReview {
  const hasAuthorizedConfirmation = packet.authorizedFacts.some(fact => fact.level === 'confirmation');
  const authorizedIds = new Set(packet.authorizedFacts.map(fact => fact.id));
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
  const falselyRejectsAuthorizedConfirmation = (value: string) => (
    hasAuthorizedConfirmation
    && /player[_-]?agency(?:[_-]?override|[_-]?violation)?|premature[_-]?confirmation|player[_-]?assertion[_-]?as[_-]?fact|玩家.*直接转化为世界事实|把已授权.?confirmation|已授权.*confirmation.*(?:越权|违规)|confirmation.*(?:未授权|越权)/i
      .test(value)
  );
  const falselyDemandsNewEvidenceForAuthorizedConfirmation = (
    violation: FactReview['violations'][number],
    value: string,
  ) => (
    hasAuthorizedConfirmation
    && (!violation.factId || authorizedIds.has(violation.factId))
    && /未提供任何?新增证据|未提供新的可呈现证据|推迟至后续回合|no[_-]?new[_-]?evidence|既有线索与新增 confirmation/i
      .test(value)
  );
  const violations = review.violations.filter(violation => {
    const value = `${violation.code} ${violation.factId ?? ''} ${violation.message}`;
    return !explicitlySaysNoViolation(violation.message)
      && !isFalseMandatoryLyingClaim(value)
      && !falselyRejectsAuthorizedConfirmation(value)
      && !falselyDemandsNewEvidenceForAuthorizedConfirmation(violation, value);
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
}): Promise<FactReview> {
  const deterministicViolations = reviewNarrativeDeterministically(options.packet, options.narrative);
  if (deterministicViolations.length > 0) {
    return {
      approved: false,
      violations: deterministicViolations,
      corrections: ['删除所有关于文穗此前来过、买过、付过钱、离开或去向的补写，改为当下服务互动。'],
    };
  }
  const complete = options.complete
    ?? ((messages, callOptions) => callSecondaryApi(options.api, messages, options.preset, callOptions));
  const messages = [
    { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
    { role: 'user', content: buildNarrativeFactCriticUserPrompt(options.packet, options.narrative) },
  ] as const;
  const value = await completeParsedStructured(
    complete,
    `${options.api.baseUrl}|${options.api.model}`,
    [...messages],
    { temperature: 0, maxTokens: 2500, abortSignal: options.abortSignal },
    FACT_REVIEW_RESPONSE_FORMAT,
    raw => {
      const parsed = extractJson(raw) as Partial<FactReview> | null;
      if (!parsed || typeof parsed.approved !== 'boolean'
        || !Array.isArray(parsed.violations) || !Array.isArray(parsed.corrections)) {
        throw new Error('正文事实复核返回了不可解析的结果。');
      }
      return parsed as FactReview;
    },
  );
  return sanitizeNarrativeFactReview(value, options.packet);
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
  const systemPrompt = options.formatPrompt
    ? `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${options.formatPrompt}`
    : WRITER_SYSTEM_PROMPT;
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
  ], { temperature: 0, maxTokens: 4000, abortSignal: options.abortSignal });
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
  const systemPrompt = options.formatPrompt
    ? `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${options.formatPrompt}`
    : WRITER_SYSTEM_PROMPT;
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
  ], { temperature: 0, maxTokens: 4000, abortSignal: options.abortSignal });
}
