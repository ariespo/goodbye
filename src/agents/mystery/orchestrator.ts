import type { ChatPreset } from '../../sillytavern/types';
import type { ApiConfig, ChatCompletionMessage } from '../../sillytavern/api-router';
import { callSecondaryApi } from '../../sillytavern/api-router';
import { DIRECTOR_PLAN_RESPONSE_FORMAT, FACT_REVIEW_RESPONSE_FORMAT } from './schemas';
import { recordOrchestrationEntry } from './orchestration-log';
import type { OrchestrationOutcome, OrchestrationStageTiming } from './orchestration-log';
import { buildMysteryBrief } from './brief';
import {
  buildAliasedMysteryBrief,
  createFactAliasTable,
  type FactAliasTable,
} from './fact-aliases';
import {
  buildDirectorUserPrompt,
  buildFactCriticUserPrompt,
  buildPacingCriticUserPrompt,
  buildWriterUserPrompt,
  DIRECTOR_SYSTEM_PROMPT,
  FACT_CRITIC_SYSTEM_PROMPT,
  PACING_CRITIC_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from './prompts';
import {
  buildWriterPacket,
  enforceNarrativeSceneContract,
  ensureSaturationPivotOrder,
  removeConfessionBySilence,
  reviewDirectorPlan,
} from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, FactReview, MysteryBrief, TruthContext, WriterPacket } from './types';
import { selectSaturationPivot } from './saturation-pivot';
import { completeStructured, extractJson, getResponseFormatSupport } from './structured';
import type { AgentCompletion } from './structured';

export type AgentNarrativeMode = 'legacy' | 'standard' | 'strict';

export { resetResponseFormatSupportCache } from './structured';
export type { AgentCompletion } from './structured';

export interface PrepareMysteryTurnOptions {
  mode: Exclude<AgentNarrativeMode, 'legacy'>;
  api: ApiConfig;
  preset: ChatPreset | null;
  truthContext: TruthContext;
  turnContext: Record<string, unknown>;
  presentationContext: Record<string, unknown>;
  formatPrompt?: string;
  complete?: AgentCompletion;
  abortSignal?: AbortSignal;
  /** 后台预规划调用时标记为 true，仅影响编排日志展示。 */
  speculative?: boolean;
}

export interface PreparedMysteryTurn {
  brief: MysteryBrief;
  directorPlan: DirectorPlan;
  hardReview: FactReview;
  semanticReview: FactReview | null;
  pacingReview: FactReview | null;
  writerPacket: WriterPacket;
  writerMessages: ChatCompletionMessage[];
  directorAttempts: number;
  /** 仅供程序提交玩家知识；不得序列化到 Director 或 Writer 消息。 */
  factAliases: FactAliasTable;
}

/** 表示事实安全闸已触发；调用方不得回退到未受控生成。 */
export class MysteryPipelineBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MysteryPipelineBlockedError';
  }
}

function parseDirectorPlan(text: string): DirectorPlan {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') throw new Error('导演计划不是对象。');
  const plan = value as Partial<DirectorPlan>;
  if (typeof plan.turnGoal !== 'string' || typeof plan.tone !== 'string') {
    throw new Error('导演计划缺少 turnGoal 或 tone。');
  }
  if (!Array.isArray(plan.beats) || !Array.isArray(plan.revelations)
    || !Array.isArray(plan.optionIntents) || !Array.isArray(plan.assetRequests)) {
    throw new Error('导演计划数组字段不完整。');
  }
  return plan as DirectorPlan;
}

function parseFactReview(text: string): FactReview {
  const value = extractJson(text);
  if (!value || typeof value !== 'object') throw new Error('事实复核结果不是对象。');
  const review = value as Partial<FactReview>;
  if (typeof review.approved !== 'boolean' || !Array.isArray(review.violations) || !Array.isArray(review.corrections)) {
    throw new Error('事实复核结果字段不完整。');
  }
  return review as FactReview;
}

async function completeParsed<T>(
  complete: AgentCompletion,
  supportKey: string,
  messages: ChatCompletionMessage[],
  callOptions: { temperature?: number; maxTokens?: number; abortSignal?: AbortSignal },
  responseFormat: typeof DIRECTOR_PLAN_RESPONSE_FORMAT | typeof FACT_REVIEW_RESPONSE_FORMAT,
  parse: (text: string) => T,
): Promise<T> {
  const first = await completeStructured(complete, supportKey, messages, callOptions, responseFormat);
  try {
    return parse(first);
  } catch (error) {
    const retryMessages: ChatCompletionMessage[] = [
      ...messages,
      { role: 'assistant', content: first },
      { role: 'user', content: `上一响应不是可解析的严格 JSON：${error instanceof Error ? error.message : String(error)}。只重新输出一个完整、合法、无 Markdown 的 JSON 对象；不得省略、截断或添加解释。` },
    ];
    const retry = await completeStructured(
      complete,
      supportKey,
      retryMessages,
      { ...callOptions, temperature: 0 },
      responseFormat,
    );
    return parse(retry);
  }
}

function sanitizeFactReview(
  review: FactReview,
  plan?: DirectorPlan,
  brief?: MysteryBrief,
  turnContext?: Record<string, unknown>,
): FactReview {
  const isFalseKnowledgeEventCoupling = (value: string) => {
    const normalized = value.toLowerCase();
    const mentionsCaseFact = /\bf\d{3}\b/.test(normalized) || normalized.includes('案件事实') || normalized.includes('revelation');
    const requiresKnowledgeEvent = normalized.includes('knowledgeevent')
      || normalized.includes('knowledge event')
      || normalized.includes('认知事件');
    const treatsDiscoveriesAsFactGate = normalized.includes('alloweddiscoveries')
      || normalized.includes('allowed discoveries');
    return mentionsCaseFact && (requiresKnowledgeEvent || treatsDiscoveriesAsFactGate);
  };
  const isFalseMandatoryLyingClaim = (value: string) => {
    const normalized = value.toLowerCase();
    return normalized.includes('lies-about')
      && (normalized.includes('未体现其主动撒谎') || normalized.includes('未体现主动撒谎'));
  };
  const explicitlySaysNoViolation = (value: string) => value.includes('不构成违规');
  const selfContradictoryApproval = (value: string) => (
    /故不违规|故不构成违规|不违规|无违规|未发现违规|未泄露|符合(?:。|$)|符合.*(?:规则|预算|限制|授权)|授权成立/.test(value)
    && !/(?:但|然而|不过|仍).*(?:违规|违反|不符合|超出)/.test(value)
  );
  const falselyCountsFollowupIntentsAsReveals = (value: string) => (
    /重复揭示|压力累积|单回合预算精神/.test(value)
    && /investigateIntents|后续.*调查/.test(value)
  );
  const flagsUnusedRedHerring = (value: string) => (
    /red[_-]?herring/i.test(value) || /红鲱鱼|误导线索/.test(value)
  ) && /计划未使用|未保留|未引入|排除在玩家体验之外/.test(value);
  const falselyRequiresOptionalPerformance = (value: string) => (
    value.includes('未体现confirmation后的空洞专注')
    || value.includes('未体现 confirmation 后的空洞专注')
    || value.includes('未出现确认后的insane')
  );
  const falselyPredictsUnplannedInsane = (value: string) => {
    const planText = JSON.stringify(plan ?? {});
    return /可能触发.*insane|may trigger.*insane/i.test(value)
      && !/insane|疯狂|疯癫|癫狂|狂笑/.test(planText);
  };
  const falselyRequiresNpcForNonDialogue = (violation: FactReview['violations'][number], value: string) => {
    if (!/npc[_-]?knowledge/i.test(value)) return false;
    const revelation = violation.factId ? plan?.revelations.find(item => item.factId === violation.factId) : undefined;
    return !!revelation && revelation.delivery !== 'dialogue';
  };
  const falselyRejectsAuthorizedConfirmation = (value: string) => {
    if (!brief?.revealBudget.allowConfirmation || brief.routeMode === 'exploratory') return false;
    return /player[_-]?agency(?:[_-]?override|[_-]?violation)?|premature[_-]?confirmation|player[_-]?assertion[_-]?as[_-]?fact|玩家.*直接转化为世界事实/i.test(value)
      && !!plan?.revelations.some(item => item.level === 'confirmation');
  };
  const falselyClaimsMissingAuthorizedRevealText = (violation: FactReview['violations'][number], value: string) => (
    !!violation.factId
    && /(?:文本缺失|并未提供|缺少对应的正典文本)/.test(value)
    && !!brief?.usableFacts.find(fact => fact.id === violation.factId)?.revealOptions
      .some(option => option.level === plan?.revelations.find(item => item.factId === violation.factId)?.level)
  );
  const falselyDemandsNewEvidenceForAuthorizedConfirmation = (violation: FactReview['violations'][number], value: string) => (
    !!violation.factId
    && brief?.revealBudget.allowConfirmation === true
    && /既有线索与新增 confirmation|未提供任何?新增证据|未提供新的可呈现证据|推迟至后续回合|no[_-]?new[_-]?evidence/i.test(value)
    && plan?.revelations.some(item => item.factId === violation.factId && item.level === 'confirmation') === true
  );
  const falselyFlagsUnusedHypotheticalRedHerring = (value: string) => (
    /计划未涉及/.test(value) && /若.*可能|需确保/.test(value) && /red.?herring|红鲱鱼|误导/i.test(value)
  );
  const falselyTreatsKnownFactAsLocationLocked = (violation: FactReview['violations'][number], value: string) => {
    if (!violation.factId || !/forbidden[_-]?reveal|当前地点无法取得|location/i.test(value)) return false;
    return !!brief?.playerKnownFacts.some(fact => fact.id === violation.factId);
  };
  const falselyRequiresKnowledgeEventForCaseFact = (value: string) => {
    if (!brief?.revealBudget.allowConfirmation || brief.routeMode === 'exploratory') return false;
    return /knowledgeevent|knowledge event|具体观察|支撑该结论/i.test(value)
      && !!plan?.revelations.some(item => item.level === 'confirmation');
  };
  const falselyRejectsLayerJump = (value: string) => (
    /单回合.*(?:atmosphere|hint).*confirmation|层级递进|revelation_level_exceeds_budget/i.test(value)
    && !!brief?.revealBudget.allowConfirmation
  );
  const falselyRejectsOrderedAuthorizedConfirmations = (violation: FactReview['violations'][number], value: string) => {
    if (!violation.factId || !brief?.revealBudget.allowConfirmation) return false;
    const index = plan?.revelations.findIndex(item => item.factId === violation.factId) ?? -1;
    return index > 0 && /依赖|尚未.*建立|跳跃式揭示|违反揭示层级/.test(value)
      && (plan?.revelations.slice(0, index).some(item => item.level === 'confirmation') ?? false);
  };
  const duplicatesDeterministicPivotReview = (value: string) => /saturation[_-]?pivot/i.test(value);
  const rejudgesAuthorizedPivot = (violation: FactReview['violations'][number], value: string) => (
    !!brief?.saturationPivot
    && violation.factId === brief.saturationPivot.factId
    && /reveal[_-]?level|npc[_-]?knowledge|层级|授权/.test(value)
  );
  const falselyRequiresInsightForAllowedPerformance = (value: string) => (
    /character[_-]?performance/i.test(value)
    && /未申请.*insight|不能作为行为证据|可能暗示未授权性格/.test(value)
  );
  const falselyAppliesDiscoveryEvidenceStandardToFact = (violation: FactReview['violations'][number], value: string) => (
    !!violation.factId
    && /evidence[_-]?standard|具体呈现|证据标准/.test(value)
    && !!plan?.revelations.some(item => item.factId === violation.factId)
  );
  const falselyQuestionsCycleAfterRouteLock = (value: string) => (
    /cycle[_-]?count|前三个重复日|小于 4/.test(value)
    && brief?.routeMode !== 'exploratory'
    && !!brief?.revealBudget.allowConfirmation
  );
  const falselyTreatsDailyRoleAsHiddenKnowledge = (value: string) => (
    /character[_-]?performance/i.test(value)
    && /npcKnowledge|普通护士|病历记录已经核对完毕/.test(value)
    && !(plan?.revelations ?? []).some(item => item.delivery === 'dialogue')
  );
  const falselyDemandsMissingPivot = (value: string) => {
    const policy = turnContext?.playerIntentPolicy as { mode?: string } | undefined;
    return /missing[_-]?saturation[_-]?pivot|saturation.?pivot.*(?:missing|未提供|缺少)/i.test(value)
      && (!brief?.saturationPivot || policy?.mode !== 'divert');
  };
  const violations = review.violations.filter(violation => {
    const value = `${violation.code} ${violation.factId ?? ''} ${violation.message}`;
    return !isFalseKnowledgeEventCoupling(value)
      && !isFalseMandatoryLyingClaim(value)
      && !explicitlySaysNoViolation(value)
      && !selfContradictoryApproval(value)
      && !falselyCountsFollowupIntentsAsReveals(value)
      && !flagsUnusedRedHerring(value)
      && !falselyRequiresOptionalPerformance(value)
      && !falselyPredictsUnplannedInsane(value)
      && !falselyRequiresNpcForNonDialogue(violation, value)
      && !falselyRejectsAuthorizedConfirmation(value)
      && !falselyClaimsMissingAuthorizedRevealText(violation, value)
      && !falselyDemandsNewEvidenceForAuthorizedConfirmation(violation, value)
      && !falselyFlagsUnusedHypotheticalRedHerring(value)
      && !falselyTreatsKnownFactAsLocationLocked(violation, value)
      && !falselyRequiresKnowledgeEventForCaseFact(value)
      && !falselyRejectsLayerJump(value)
      && !falselyRejectsOrderedAuthorizedConfirmations(violation, value)
      && !duplicatesDeterministicPivotReview(value)
      && !rejudgesAuthorizedPivot(violation, value)
      && !falselyRequiresInsightForAllowedPerformance(value)
      && !falselyAppliesDiscoveryEvidenceStandardToFact(violation, value)
      && !falselyQuestionsCycleAfterRouteLock(value)
      && !falselyTreatsDailyRoleAsHiddenKnowledge(value)
      && !falselyDemandsMissingPivot(value);
  });
  const corrections = review.corrections.filter(correction => !isFalseKnowledgeEventCoupling(correction));
  return { approved: violations.length === 0, violations, corrections };
}

function repairPrompt(brief: MysteryBrief, plan: DirectorPlan, review: FactReview): string {
  return `上一版导演计划未通过审查。只修正违规项并重新输出完整 JSON。
修复时必须遵守：
- knowledgeEvents 只能列出本回合确定会触发、且正文会展示充分 evidence 的事件；不要列出“不触发”“暂不触发”或仅作候选的事件。
- revelations 与 knowledgeEvents 完全独立。F001/F002 等案件事实只属于 revelations，不能为它新增、猜测或捏造 knowledgeEvent；若 allowedDiscoveries 为空，knowledgeEvents 必须为空。
- red-herring 只能保持为明确的猜测，不得改写成 NPC 亲眼见闻、环境事实或可靠证据。
- red-herring 若没有 deliveryNpcIds，必须从所有 NPC 台词、回忆和目击 beat 中彻底删除；不得以“好像”“不敢说准”等降调措辞保留。
- dialogue revelation 只有在该事实 deliveryNpcIds 明列对应 speakerId 时才允许。若玩家已持有某事实、但在场 NPC 无讲述权，只能通过玩家出示的物证、记录或 narration/object/environment 重述；绝不能让 NPC 代替证据宣布结论。
- speakerId 必须逐字复制 npcKnowledge[].npcId，不得使用简称、显示名或同义 ID。
- saturationPivot 存在时不可删除或软化：先完整响应 blockedActorId 的原调查，再由 interveningNpcId 在后续独立 beat 自然介入并以 dialogue 揭示 factId。正文只写获准事实，不得直说 redirectedActorId 内部 ID 或补写因果；状态归属由程序处理，不得继续增加 blockedActorId 的嫌疑。
- beat/台词中的结论层级不得高于 revelations。若玩家明确提出凶手、手法等 confirmation 结论，且 brief 允许 confirmation，就必须把对应事实登记为 confirmation；否则必须删掉或降级该结论台词，不能保留指控再只申请 hint。
- stance=lies-about 的 confirmation 不得被修成“证据压力下被迫承认”。用 narration/object/environment 让证据链独立确认，NPC 可平静否认。若确认会解锁 insane，必须先有一个明确的外部证据确认 beat，再在后续独立 beat 安排；否则删除 insane。
- confirmation beat 必须写出 revealOptions.confirmation 已授权的因果。对 playerKnownFacts 已有的 clue，直接写“复核该已知 clue 并与其他已知 clue 合并”即可；不得为了具体化而补造 revealOptions/playerKnownFacts 未定义的脚印、杯痕、录像、证人、检验结果或第三方痕迹。
- 对 lies-about 角色，即使外部证据已经 confirmation，也不要替角色编写含蓄自白或邪恶格言。禁止“你什么都不知道”“她去了该去的地方”“别管闲事”等暗示性台词，以及沉默后默认承认。只能明确否认、声称证据解释错误、普通拒答，或完全不安排该角色发言。
- routeMode 已锁定、allowConfirmation=true 且玩家明确要求用既有 clue 确认真相时，必须使用 usableFacts 允许的 confirmation 收束；禁止降回 hint/clue，禁止新增“巧合、他人布置、缺少未知物证”等替代解释来人为续悬念。
- 当 NPC stance 为 lies-about 时，只能让其平静否认、给出获准的替代说法或拒答；不得用沉默、僵硬、视线转移、笑容消失、异常平直的语气、保留证物等动作暗示其知道事实。除非该 solution 已获 confirmation，否则宁可删除反应 beat。
- corrections 中只有与 MysteryBrief 一致的要求才可执行；MysteryBrief 与硬规则优先。删除违规 beat/台词优先于换一种措辞保留同一泄密。
\n[MysteryBrief]\n${JSON.stringify(brief, null, 2)}\n\n[RejectedPlan]\n${JSON.stringify(plan, null, 2)}\n\n[Violations]\n${JSON.stringify(review.violations, null, 2)}\n\n[Corrections]\n${JSON.stringify(review.corrections, null, 2)}`;
}

function removeUnauthorizedKnowledgeEvents(plan: DirectorPlan, brief: MysteryBrief): DirectorPlan {
  const allowed = new Set<string>(brief.playerPresentation.allowedDiscoveries.map(item => item.eventId));
  return { ...plan, knowledgeEvents: (plan.knowledgeEvents ?? []).filter(item => allowed.has(item.eventId)) };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function prepareMysteryTurn(options: PrepareMysteryTurnOptions): Promise<PreparedMysteryTurn> {
  const startedAt = now();
  const stages: OrchestrationStageTiming[] = [];
  const timeStage = async <T>(stage: OrchestrationStageTiming['stage'], fn: () => Promise<T> | T): Promise<T> => {
    const stageStart = now();
    try {
      return await fn();
    } finally {
      stages.push({ stage, durationMs: Math.round(now() - stageStart) });
    }
  };

  let directorPlan: DirectorPlan | null = null;
  let hardReview: FactReview | null = null;
  let semanticReview: FactReview | null = null;
  let pacingReview: FactReview | null = null;
  let directorAttempts = 0;

  const record = (outcome: OrchestrationOutcome, error: string | null) => {
    recordOrchestrationEntry({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      timestamp: Date.now(),
      mode: options.mode,
      model: options.api.model,
      baseUrl: options.api.baseUrl,
      playerInput: typeof options.turnContext.playerInput === 'string' ? options.turnContext.playerInput : null,
      directorPlan,
      hardReview,
      semanticReview,
      pacingReview,
      directorAttempts,
      stages,
      totalDurationMs: Math.round(now() - startedAt),
      structuredOutput: getResponseFormatSupport(`${options.api.baseUrl}|${options.api.model}`) !== false,
      speculative: options.speculative ?? false,
      outcome,
      error,
    });
  };

  try {
    const result = await runMysteryPipeline(options, {
      timeStage,
      setDirectorPlan: plan => { directorPlan = plan; },
      setHardReview: review => { hardReview = review; },
      setSemanticReview: review => { semanticReview = review; },
      setPacingReview: review => { pacingReview = review; },
      setDirectorAttempts: attempts => { directorAttempts = attempts; },
    });
    record('success', null);
    return result;
  } catch (error) {
    record(
      error instanceof MysteryPipelineBlockedError ? 'blocked' : 'error',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

interface PipelineObservers {
  timeStage: <T>(stage: OrchestrationStageTiming['stage'], fn: () => Promise<T> | T) => Promise<T>;
  setDirectorPlan: (plan: DirectorPlan) => void;
  setHardReview: (review: FactReview) => void;
  setSemanticReview: (review: FactReview) => void;
  setPacingReview: (review: FactReview) => void;
  setDirectorAttempts: (attempts: number) => void;
}

async function runMysteryPipeline(
  options: PrepareMysteryTurnOptions,
  observe: PipelineObservers,
): Promise<PreparedMysteryTurn> {
  const { timeStage } = observe;
  const internalBrief = buildMysteryBrief(MYSTERY_TRUTH_GRAPH, options.truthContext);
  const intentPolicy = options.turnContext.playerIntentPolicy as {
    mode?: string;
    targetedActorId?: string | null;
  } | undefined;
  if (intentPolicy?.mode === 'divert' && intentPolicy.targetedActorId) {
    internalBrief.saturationPivot = selectSaturationPivot(
      MYSTERY_TRUTH_GRAPH,
      internalBrief,
      options.truthContext,
      intentPolicy.targetedActorId,
    );
    if (!internalBrief.saturationPivot) {
      throw new MysteryPipelineBlockedError('当前地点没有经过事实门授权的异角色线索，无法安全完成调查饱和转场。');
    }
  }
  const factAliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
  const brief = buildAliasedMysteryBrief(internalBrief, factAliases);
  const complete = options.complete ?? ((messages, callOptions) => callSecondaryApi(
    options.api,
    messages,
    options.preset,
    { ...callOptions, abortSignal: options.abortSignal },
  ));
  const directorMessages: ChatCompletionMessage[] = [
    { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
    { role: 'user', content: buildDirectorUserPrompt(brief, options.turnContext) },
  ];

  const supportKey = `${options.api.baseUrl}|${options.api.model}`;

  let directorAttempts = 1;
  observe.setDirectorAttempts(directorAttempts);
  let directorPlan = await timeStage('director', () => completeParsed(
    complete, supportKey, directorMessages,
    { temperature: 0.2, maxTokens: 4000 },
    DIRECTOR_PLAN_RESPONSE_FORMAT,
    parseDirectorPlan,
  ));
  directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
  observe.setDirectorPlan(directorPlan);
  let hardReview = await timeStage('hard-review', () => reviewDirectorPlan(directorPlan, brief));
  observe.setHardReview(hardReview);
  if (!hardReview.approved) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    const rejectedPlan = directorPlan;
    const rejectedReview = hardReview;
    directorPlan = await timeStage('director-repair', () => completeParsed(complete, supportKey, [
      { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
      { role: 'user', content: repairPrompt(brief, rejectedPlan, rejectedReview) },
    ], { temperature: 0.1, maxTokens: 4000 }, DIRECTOR_PLAN_RESPONSE_FORMAT, parseDirectorPlan));
    directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-retry', () => reviewDirectorPlan(directorPlan, brief));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'saturation-pivot-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => ensureSaturationPivotOrder(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'character-performance-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => removeConfessionBySilence(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'scene-contract-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => enforceNarrativeSceneContract(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved) {
    throw new MysteryPipelineBlockedError(`导演计划连续${directorAttempts}次未通过事实审查，本回合已停止。`);
  }

  let semanticReview: FactReview | null = null;
  let pacingReview: FactReview | null = null;
  if (options.mode === 'strict' || options.mode === 'standard') {
    const semanticPromise = timeStage('semantic-review', () => completeParsed(complete, supportKey, [
      { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildFactCriticUserPrompt(
          brief,
          directorPlan,
          MYSTERY_TRUTH_GRAPH.facts.map(fact => ({
            id: factAliases.factIdToAlias[fact.id],
            route: fact.route,
            canonicalTruth: fact.canonicalTruth,
            revelations: fact.revelations,
          })),
        ),
      },
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview));
    const pacingPromise = timeStage('pacing-review', () => completeParsed(complete, supportKey, [
      { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview));
    const [semanticParsed, pacingParsed] = await Promise.all([semanticPromise, pacingPromise]);
    semanticReview = sanitizeFactReview(semanticParsed, directorPlan, brief, options.turnContext);
    pacingReview = sanitizeFactReview(pacingParsed, directorPlan, brief, options.turnContext);
    observe.setSemanticReview(semanticReview);
    observe.setPacingReview(pacingReview);
    if (!semanticReview.approved || !pacingReview.approved) {
      directorAttempts += 1;
      observe.setDirectorAttempts(directorAttempts);
      const combinedReview: FactReview = {
        approved: false,
        violations: [...semanticReview.violations, ...pacingReview.violations],
        corrections: [...semanticReview.corrections, ...pacingReview.corrections],
      };
      directorPlan = await timeStage('semantic-repair', () => completeParsed(complete, supportKey, [
        { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
        { role: 'user', content: repairPrompt(brief, directorPlan, combinedReview) },
      ], { temperature: 0.05, maxTokens: 4000 }, DIRECTOR_PLAN_RESPONSE_FORMAT, parseDirectorPlan));
      directorPlan = removeUnauthorizedKnowledgeEvents(directorPlan, brief);
      directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
      observe.setDirectorPlan(directorPlan);
      hardReview = await timeStage('hard-review-after-semantic-repair', () => reviewDirectorPlan(directorPlan, brief));
      observe.setHardReview(hardReview);
      if (!hardReview.approved) {
        throw new MysteryPipelineBlockedError('语义修复后的导演计划未通过硬审查，本回合已停止。');
      }
      const [semanticRetryText, pacingRetryText] = await Promise.all([
        timeStage('semantic-review-retry', () => completeParsed(complete, supportKey, [
          { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
          { role: 'user', content: buildFactCriticUserPrompt(brief, directorPlan, MYSTERY_TRUTH_GRAPH.facts.map(fact => ({
            id: factAliases.factIdToAlias[fact.id], route: fact.route,
            canonicalTruth: fact.canonicalTruth, revelations: fact.revelations,
          }))) },
        ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)),
        timeStage('pacing-review-retry', () => completeParsed(complete, supportKey, [
          { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
          { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
        ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)),
      ]);
      semanticReview = sanitizeFactReview(semanticRetryText, directorPlan, brief, options.turnContext);
      pacingReview = sanitizeFactReview(pacingRetryText, directorPlan, brief, options.turnContext);
      observe.setSemanticReview(semanticReview);
      observe.setPacingReview(pacingReview);
      if (!semanticReview.approved || !pacingReview.approved) {
        directorAttempts += 1;
        observe.setDirectorAttempts(directorAttempts);
        const finalCombinedReview: FactReview = {
          approved: false,
          violations: [...semanticReview.violations, ...pacingReview.violations],
          corrections: [...semanticReview.corrections, ...pacingReview.corrections],
        };
        directorPlan = await timeStage('semantic-repair-final', () => completeParsed(complete, supportKey, [
          { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
          { role: 'user', content: repairPrompt(brief, directorPlan, finalCombinedReview) },
        ], { temperature: 0, maxTokens: 4000 }, DIRECTOR_PLAN_RESPONSE_FORMAT, parseDirectorPlan));
        directorPlan = removeUnauthorizedKnowledgeEvents(directorPlan, brief);
        directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
        observe.setDirectorPlan(directorPlan);
        hardReview = await timeStage('hard-review-after-semantic-final', () => reviewDirectorPlan(directorPlan, brief));
        observe.setHardReview(hardReview);
        if (!hardReview.approved) {
          throw new MysteryPipelineBlockedError('最终语义修复后的导演计划未通过硬审查，本回合已停止。');
        }
        const [semanticFinalText, pacingFinalText] = await Promise.all([
          timeStage('semantic-review-final', () => completeParsed(complete, supportKey, [
            { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
            { role: 'user', content: buildFactCriticUserPrompt(brief, directorPlan, MYSTERY_TRUTH_GRAPH.facts.map(fact => ({
              id: factAliases.factIdToAlias[fact.id], route: fact.route,
              canonicalTruth: fact.canonicalTruth, revelations: fact.revelations,
            }))) },
          ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)),
          timeStage('pacing-review-final', () => completeParsed(complete, supportKey, [
            { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
            { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
          ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)),
        ]);
        semanticReview = sanitizeFactReview(semanticFinalText, directorPlan, brief, options.turnContext);
        pacingReview = sanitizeFactReview(pacingFinalText, directorPlan, brief, options.turnContext);
        observe.setSemanticReview(semanticReview);
        observe.setPacingReview(pacingReview);
      }
      if (!semanticReview.approved) {
        throw new MysteryPipelineBlockedError('语义事实复核修复后仍发现潜在泄密，本回合已停止。');
      }
      if (!pacingReview.approved) {
        throw new MysteryPipelineBlockedError('节奏或玩家能动性复核修复后仍未通过，本回合已停止。');
      }
    }
  }

  const writerPacket = buildWriterPacket(directorPlan, brief);
  const writerSystem = options.formatPrompt
    ? `${WRITER_SYSTEM_PROMPT}\n\n[项目输出格式补充]\n${options.formatPrompt}`
    : WRITER_SYSTEM_PROMPT;
  const writerMessages: ChatCompletionMessage[] = [
    { role: 'system', content: writerSystem },
    { role: 'user', content: buildWriterUserPrompt(writerPacket, options.presentationContext) },
  ];

  return {
    brief,
    directorPlan,
    hardReview,
    semanticReview,
    pacingReview,
    writerPacket,
    writerMessages,
    directorAttempts,
    factAliases,
  };
}
