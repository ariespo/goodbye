import type { AgentNarrativeModeSetting, ChatPreset } from '../../sillytavern/types';
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
import { buildDirectorRepairTask, mergeRepairResiduals } from './repair-task';
import type { RepairFailedStage } from './repair-task';

export type AgentNarrativeMode = AgentNarrativeModeSetting;

export { resetResponseFormatSupportCache } from './structured';
export type { AgentCompletion } from './structured';

export interface PrepareMysteryTurnOptions {
  mode: AgentNarrativeMode;
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
  reviewPolicy: {
    semantic: boolean;
    pacing: boolean;
    narrative: boolean;
    style: boolean;
    state: boolean;
  };
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
  const explicitlySaysNoViolation = (value: string) => (
    /不构成违规|并非违规|无需修正|(?:未发现|没有发现|不存在|无)(?:任何|潜在)?违规/.test(value)
  );
  const selfContradictoryApproval = (value: string) => (
    /故不违规|未泄露|符合(?:。|$)|符合.*(?:规则|预算|限制|授权|evidenceStandard)|授权成立/.test(value)
    && !/(?:但|然而|不过|仍)[^。！？]*(?:确属|构成|存在|仍有|违反|不符合|超出)/.test(value)
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
  const corrections = violations.length === 0 ? [] : review.corrections.filter(correction => (
    !isFalseKnowledgeEventCoupling(correction)
    && !explicitlySaysNoViolation(correction)
  ));
  return { approved: violations.length === 0, violations, corrections };
}

function directorRepairMessages(
  rejectedPlan: DirectorPlan,
  review: FactReview,
  priorResiduals: FactReview['violations'],
  failedStage: RepairFailedStage,
): ChatCompletionMessage[] {
  return [
    { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildDirectorRepairTask({
        rejectedPlan,
        review,
        priorResiduals,
        failedStage,
      }),
    },
  ];
}

function criticStageFor(review: { semantic: FactReview; pacing: FactReview }): RepairFailedStage {
  if (!review.semantic.approved && !review.pacing.approved) return 'semantic-pacing-review';
  if (!review.pacing.approved) return 'pacing-review';
  return 'semantic-review';
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
  let hardReview = await timeStage('hard-review', () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
  observe.setHardReview(hardReview);
  let hardReviewResiduals: FactReview['violations'] = [];
  for (let repairAttempt = 0; !hardReview.approved && repairAttempt < 2; repairAttempt += 1) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    const rejectedPlan = directorPlan;
    const rejectedReview = hardReview;
    directorPlan = await timeStage('director-repair', () => completeParsed(
      complete,
      supportKey,
      directorRepairMessages(rejectedPlan, rejectedReview, hardReviewResiduals, 'hard-review'),
      { temperature: 0.1, maxTokens: 4000 },
      DIRECTOR_PLAN_RESPONSE_FORMAT,
      parseDirectorPlan,
    ));
    hardReviewResiduals = mergeRepairResiduals(hardReviewResiduals, rejectedReview.violations);
    directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-retry', () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'saturation-pivot-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => ensureSaturationPivotOrder(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'character-performance-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => removeConfessionBySilence(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved && hardReview.violations.every(item => item.code === 'scene-contract-violation')) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    directorPlan = await timeStage('director-repair-final', () => enforceNarrativeSceneContract(directorPlan, brief));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-final', () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved) {
    throw new MysteryPipelineBlockedError(`导演计划连续${directorAttempts}次未通过事实审查，本回合已停止。`);
  }

  const intentMode = typeof intentPolicy?.mode === 'string' ? intentPolicy.mode : 'normal';
  const requiredKnowledgeEventIds = new Set(
    brief.sceneContract?.requiredKnowledgeEvents.map(item => item.eventId) ?? [],
  );
  const plannedKnowledgeEvents = directorPlan.knowledgeEvents ?? [];
  const deterministicSceneKnowledgeOnly = directorPlan.revelations.length === 0
    && plannedKnowledgeEvents.length > 0
    && requiredKnowledgeEventIds.size === plannedKnowledgeEvents.length
    && plannedKnowledgeEvents.every(item => requiredKnowledgeEventIds.has(item.eventId));
  const reviewPolicy = {
    semantic: options.mode === 'strict'
      || directorPlan.revelations.length > 0
      || (directorPlan.backgroundFactProposals?.length ?? 0) > 0
      || (plannedKnowledgeEvents.length > 0 && !deterministicSceneKnowledgeOnly),
    pacing: options.mode === 'strict'
      || options.truthContext.cycleCount >= 3
      || options.truthContext.lockedRoute !== null
      || !!brief.saturationPivot
      || intentMode === 'divert',
    narrative: options.mode === 'strict'
      || directorPlan.revelations.length > 0
      || (directorPlan.backgroundFactProposals?.length ?? 0) > 0
      || directorPlan.beats.some(beat => (beat.sourceBackgroundFactIds?.length ?? 0) > 0)
      || (directorPlan.knowledgeEvents?.length ?? 0) > 0
      || (brief.sceneContract?.requiredKnowledgeEvents.length ?? 0) > 0,
    style: true,
    state: options.mode === 'strict'
      || !!brief.saturationPivot
      || options.turnContext.requiresStateAgent === true,
  };
  const approvedReview: FactReview = { approved: true, violations: [], corrections: [] };
  const memoryContext = options.turnContext.memoryContext && typeof options.turnContext.memoryContext === 'object'
    ? options.turnContext.memoryContext as { backgroundFacts?: unknown }
    : {};
  const semanticCanon = {
    caseFacts: MYSTERY_TRUTH_GRAPH.facts.map(fact => ({
      id: factAliases.factIdToAlias[fact.id],
      route: fact.route,
      canonicalTruth: fact.canonicalTruth,
      revelations: fact.revelations,
    })),
    backgroundFacts: Array.isArray(memoryContext.backgroundFacts) ? memoryContext.backgroundFacts : [],
  };
  let semanticReview: FactReview | null = null;
  let pacingReview: FactReview | null = null;
  if (reviewPolicy.semantic || reviewPolicy.pacing) {
    const semanticPromise = reviewPolicy.semantic ? timeStage('semantic-review', () => completeParsed(complete, supportKey, [
      { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildFactCriticUserPrompt(
          brief,
          directorPlan,
          semanticCanon,
        ),
      },
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)) : Promise.resolve(approvedReview);
    const pacingPromise = reviewPolicy.pacing ? timeStage('pacing-review', () => completeParsed(complete, supportKey, [
      { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview)) : Promise.resolve(approvedReview);
    const [semanticParsed, pacingParsed] = await Promise.all([semanticPromise, pacingPromise]);
    semanticReview = sanitizeFactReview(semanticParsed, directorPlan, brief, options.turnContext);
    pacingReview = sanitizeFactReview(pacingParsed, directorPlan, brief, options.turnContext);
    observe.setSemanticReview(semanticReview);
    observe.setPacingReview(pacingReview);
    if (!semanticReview.approved || !pacingReview.approved) {
      let criticResiduals: FactReview['violations'] = [];
      let pendingHardReviewRepair = false;
      const runCriticRepair = async (
        stageName: 'semantic-repair' | 'semantic-repair-final',
        hardReviewStage: 'hard-review-after-semantic-repair' | 'hard-review-after-semantic-final',
        semanticRetryStage: 'semantic-review-retry' | 'semantic-review-final',
        pacingRetryStage: 'pacing-review-retry' | 'pacing-review-final',
      ) => {
        directorAttempts += 1;
        observe.setDirectorAttempts(directorAttempts);
        const combinedReview: FactReview = {
          approved: false,
          violations: [...semanticReview!.violations, ...pacingReview!.violations],
          corrections: [...semanticReview!.corrections, ...pacingReview!.corrections],
        };
        const failedStage = pendingHardReviewRepair
          ? 'hard-review'
          : criticStageFor({ semantic: semanticReview!, pacing: pacingReview! });
        const rejectedPlan = directorPlan;
        directorPlan = await timeStage(stageName, () => completeParsed(
          complete,
          supportKey,
          directorRepairMessages(rejectedPlan, combinedReview, criticResiduals, failedStage),
          { temperature: stageName === 'semantic-repair' ? 0.05 : 0, maxTokens: 4000 },
          DIRECTOR_PLAN_RESPONSE_FORMAT,
          parseDirectorPlan,
        ));
        criticResiduals = mergeRepairResiduals(criticResiduals, combinedReview.violations);
        directorPlan = removeUnauthorizedKnowledgeEvents(directorPlan, brief);
        directorPlan = enforceNarrativeSceneContract(directorPlan, brief);
        observe.setDirectorPlan(directorPlan);
        hardReview = await timeStage(hardReviewStage, () => reviewDirectorPlan(directorPlan, brief, options.turnContext));
        observe.setHardReview(hardReview);
        if (!hardReview.approved) {
          criticResiduals = mergeRepairResiduals(criticResiduals, hardReview.violations);
          if (stageName === 'semantic-repair') {
            pendingHardReviewRepair = true;
            semanticReview = {
              approved: false,
              violations: mergeRepairResiduals(semanticReview!.violations, hardReview.violations),
              corrections: [...semanticReview!.corrections, ...hardReview.corrections],
            };
            observe.setSemanticReview(semanticReview);
            return;
          }
          throw new MysteryPipelineBlockedError('最终语义修复后的导演计划未通过硬审查，本回合已停止。');
        }
        pendingHardReviewRepair = false;
        const semanticFailed = !semanticReview!.approved;
        const pacingFailed = !pacingReview!.approved;
        const [semanticRetryText, pacingRetryText] = await Promise.all([
          reviewPolicy.semantic && (semanticFailed || pacingFailed)
            ? timeStage(semanticRetryStage, () => completeParsed(complete, supportKey, [
              { role: 'system', content: FACT_CRITIC_SYSTEM_PROMPT },
              { role: 'user', content: buildFactCriticUserPrompt(brief, directorPlan, semanticCanon) },
            ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview))
            : Promise.resolve(semanticReview ?? approvedReview),
          reviewPolicy.pacing && (pacingFailed || semanticFailed)
            ? timeStage(pacingRetryStage, () => completeParsed(complete, supportKey, [
              { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
              { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
            ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT, parseFactReview))
            : Promise.resolve(pacingReview ?? approvedReview),
        ]);
        if (reviewPolicy.semantic && (semanticFailed || pacingFailed)) {
          semanticReview = sanitizeFactReview(semanticRetryText, directorPlan, brief, options.turnContext);
          observe.setSemanticReview(semanticReview);
        }
        if (reviewPolicy.pacing && (pacingFailed || semanticFailed)) {
          pacingReview = sanitizeFactReview(pacingRetryText, directorPlan, brief, options.turnContext);
          observe.setPacingReview(pacingReview);
        }
      };

      await runCriticRepair(
        'semantic-repair',
        'hard-review-after-semantic-repair',
        'semantic-review-retry',
        'pacing-review-retry',
      );
      if (!semanticReview.approved || !pacingReview.approved) {
        await runCriticRepair(
          'semantic-repair-final',
          'hard-review-after-semantic-final',
          'semantic-review-final',
          'pacing-review-final',
        );
      }
      if (!semanticReview.approved) {
        throw new MysteryPipelineBlockedError('语义事实复核修复后仍发现潜在泄密，本回合已停止。');
      }
      if (!pacingReview.approved) {
        throw new MysteryPipelineBlockedError('节奏或玩家能动性复核修复后仍未通过，本回合已停止。');
      }
    }
  }

  const writerPacket = buildWriterPacket(directorPlan, brief, options.turnContext);
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
    semanticReview: reviewPolicy.semantic ? semanticReview : null,
    pacingReview: reviewPolicy.pacing ? pacingReview : null,
    writerPacket,
    writerMessages,
    directorAttempts,
    factAliases,
    reviewPolicy,
  };
}
