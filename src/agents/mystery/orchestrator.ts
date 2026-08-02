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
import { buildWriterPacket, reviewDirectorPlan } from './review';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';
import type { DirectorPlan, FactReview, MysteryBrief, TruthContext, WriterPacket } from './types';
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

function repairPrompt(brief: MysteryBrief, plan: DirectorPlan, review: FactReview): string {
  return `上一版导演计划未通过硬审查。只修正违规项并重新输出完整 JSON。\n\n[MysteryBrief]\n${JSON.stringify(brief, null, 2)}\n\n[RejectedPlan]\n${JSON.stringify(plan, null, 2)}\n\n[Violations]\n${JSON.stringify(review.violations, null, 2)}`;
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
  let directorPlan = parseDirectorPlan(await timeStage('director', () => completeStructured(
    complete, supportKey, directorMessages,
    { temperature: 0.2, maxTokens: 4000 },
    DIRECTOR_PLAN_RESPONSE_FORMAT,
  )));
  observe.setDirectorPlan(directorPlan);
  let hardReview = await timeStage('hard-review', () => reviewDirectorPlan(directorPlan, brief));
  observe.setHardReview(hardReview);
  if (!hardReview.approved) {
    directorAttempts += 1;
    observe.setDirectorAttempts(directorAttempts);
    const rejectedPlan = directorPlan;
    const rejectedReview = hardReview;
    directorPlan = parseDirectorPlan(await timeStage('director-repair', () => completeStructured(complete, supportKey, [
      { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
      { role: 'user', content: repairPrompt(brief, rejectedPlan, rejectedReview) },
    ], { temperature: 0.1, maxTokens: 4000 }, DIRECTOR_PLAN_RESPONSE_FORMAT)));
    observe.setDirectorPlan(directorPlan);
    hardReview = await timeStage('hard-review-retry', () => reviewDirectorPlan(directorPlan, brief));
    observe.setHardReview(hardReview);
  }
  if (!hardReview.approved) {
    throw new MysteryPipelineBlockedError('导演计划连续两次未通过事实审查，本回合已停止。');
  }

  let semanticReview: FactReview | null = null;
  let pacingReview: FactReview | null = null;
  if (options.mode === 'strict' || options.mode === 'standard') {
    const semanticPromise = timeStage('semantic-review', () => completeStructured(complete, supportKey, [
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
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT));
    const pacingPromise = timeStage('pacing-review', () => completeStructured(complete, supportKey, [
      { role: 'system', content: PACING_CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: buildPacingCriticUserPrompt(brief, directorPlan, options.turnContext) },
    ], { temperature: 0, maxTokens: 2500 }, FACT_REVIEW_RESPONSE_FORMAT));
    const [semanticText, pacingText] = await Promise.all([semanticPromise, pacingPromise]);
    semanticReview = parseFactReview(semanticText);
    pacingReview = parseFactReview(pacingText);
    observe.setSemanticReview(semanticReview);
    observe.setPacingReview(pacingReview);
    if (!semanticReview.approved) {
      throw new MysteryPipelineBlockedError('语义事实复核发现潜在泄密，本回合已停止。');
    }
    if (!pacingReview.approved) {
      throw new MysteryPipelineBlockedError('节奏或玩家能动性复核未通过，本回合已停止。');
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
