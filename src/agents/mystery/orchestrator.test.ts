import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MysteryPipelineBlockedError, prepareMysteryTurn, resetResponseFormatSupportCache } from './orchestrator';
import { DIRECTOR_PLAN_JSON_SCHEMA, FACT_REVIEW_JSON_SCHEMA } from './schemas';
import { clearOrchestrationLog, getOrchestrationLog } from './orchestration-log';
import type { DirectorPlan, TruthContext } from './types';
import { createFactAliasTable } from './fact-aliases';
import { MYSTERY_TRUTH_GRAPH } from './truth-graph';

const truthContext: TruthContext = {
  cycleCount: 2,
  currentLocation: 'home',
  lockedRoute: null,
  unlockedClueIds: [],
  playerKnowledge: {},
  suspicion: {},
  activeNpcIds: [],
};

const factAliases = createFactAliasTable(MYSTERY_TRUTH_GRAPH);
const apronFactAlias = factAliases.factIdToAlias['shared-apron-missing'];
const approvedFactReview = JSON.stringify({ approved: true, violations: [], corrections: [] });

const validPlan: DirectorPlan = {
  turnGoal: '检查衣柜里的异常',
  tone: '克制',
  beats: [{ id: 'beat-1', purpose: '发现缺失物', description: '查看衣柜' }],
  revelations: [{ factId: apronFactAlias, level: 'hint', delivery: 'object' }],
  optionIntents: [{ id: 'option-1', intent: '继续调查', tone: '谨慎', expectedPressure: 'low' }],
  assetRequests: ['bedroom-apron'],
};

function completeApproved(plan: DirectorPlan = validPlan) {
  return vi.fn(async (messages: Array<{ content: string }>) => (
    messages[0]?.content.includes('事实复核')
      ? approvedFactReview
      : JSON.stringify(plan)
  ));
}

describe('mystery orchestrator', () => {
  beforeEach(() => {
    resetResponseFormatSupportCache();
  });

  it('prepares isolated writer messages after deterministic review', async () => {
    const complete = completeApproved();
    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { input: '查看衣柜' },
      presentationContext: { location: 'home' },
      complete,
    });
    expect(result.hardReview.approved).toBe(true);
    expect(result.semanticReview?.approved).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result.writerMessages)).not.toContain('c-player-killed-fumi');
    expect(JSON.stringify(result.writerMessages)).not.toContain('shared-apron-missing');
    expect(JSON.stringify(result.writerMessages)).toContain(apronFactAlias);
    expect(result.factAliases.aliasToFactId[apronFactAlias]).toBe('shared-apron-missing');
  });

  it('repairs one invalid director plan', async () => {
    const invalid = { ...validPlan, revelations: [
      { factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' },
    ] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(invalid))
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(approvedFactReview);
    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    expect(result.directorAttempts).toBe(2);
    expect(result.hardReview.approved).toBe(true);
  });

  it('runs semantic review in strict mode', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(approvedFactReview);
    const result = await prepareMysteryTurn({
      mode: 'strict',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    expect(result.semanticReview?.approved).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0]?.[1]?.content).toContain('canonicalTruth');
  });

  it('blocks instead of allowing fallback after repeated fact violations', async () => {
    const invalid = { ...validPlan, revelations: [
      { factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' },
    ] };
    const complete = vi.fn().mockResolvedValue(JSON.stringify(invalid));
    await expect(prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    })).rejects.toBeInstanceOf(MysteryPipelineBlockedError);
  });

  it('requests structured output via response_format json_schema', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(approvedFactReview);
    await prepareMysteryTurn({
      mode: 'strict',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete: complete.mockResolvedValueOnce(JSON.stringify(validPlan))
        .mockResolvedValueOnce(JSON.stringify({ approved: true, violations: [], corrections: [] })),
    });
    const directorOptions = complete.mock.calls[0]?.[1];
    expect(directorOptions?.responseFormat?.type).toBe('json_schema');
    expect(directorOptions?.responseFormat?.json_schema?.name).toBe('director_plan');
    const criticOptions = complete.mock.calls[1]?.[1];
    expect(criticOptions?.responseFormat?.json_schema?.name).toBe('fact_review');
  });

  it('falls back to plain text parsing when server rejects response_format', async () => {
    const complete = vi.fn(async (_messages, callOptions) => {
      if (callOptions?.responseFormat) {
        throw new Error('API error 400: response_format is not supported');
      }
      return _messages[0]?.content.includes('事实复核')
        ? approvedFactReview
        : JSON.stringify(validPlan);
    });
    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'fallback-model' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    expect(result.hardReview.approved).toBe(true);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(complete.mock.calls[1]?.[1]?.responseFormat).toBeUndefined();

    // 同一服务端的后续调用直接跳过 response_format，不再重复撞错
    complete.mockClear();
    await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'fallback-model' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[1]?.responseFormat).toBeUndefined();
  });

  it('does not swallow unrelated errors as fallback', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('API error 500: internal'));
    await expect(prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    })).rejects.toThrow('API error 500');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('records an orchestration log entry with stage timings on success', async () => {
    clearOrchestrationLog();
    const complete = completeApproved();
    await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'log-model' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '查看衣柜' },
      presentationContext: {},
      complete,
    });
    const log = getOrchestrationLog();
    expect(log).toHaveLength(1);
    const entry = log[0]!;
    expect(entry.outcome).toBe('success');
    expect(entry.model).toBe('log-model');
    expect(entry.playerInput).toBe('查看衣柜');
    expect(entry.directorAttempts).toBe(1);
    expect(entry.directorPlan?.turnGoal).toBe(validPlan.turnGoal);
    expect(entry.hardReview?.approved).toBe(true);
    expect(entry.stages.map(s => s.stage)).toEqual(['director', 'hard-review', 'semantic-review']);
    expect(entry.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('records blocked outcome when the pipeline is stopped', async () => {
    clearOrchestrationLog();
    const invalid = { ...validPlan, revelations: [
      { factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' },
    ] };
    const complete = vi.fn().mockResolvedValue(JSON.stringify(invalid));
    await expect(prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    })).rejects.toBeInstanceOf(MysteryPipelineBlockedError);
    const entry = getOrchestrationLog()[0]!;
    expect(entry.outcome).toBe('blocked');
    expect(entry.directorAttempts).toBe(2);
    expect(entry.error).toContain('事实审查');
    expect(entry.stages.map(s => s.stage)).toEqual(['director', 'hard-review', 'director-repair', 'hard-review-retry']);
  });

  it('exposes json schemas with required top-level fields', () => {
    expect((DIRECTOR_PLAN_JSON_SCHEMA as any).required).toEqual(
      expect.arrayContaining(['turnGoal', 'tone', 'beats', 'revelations', 'optionIntents', 'assetRequests']),
    );
    expect((FACT_REVIEW_JSON_SCHEMA as any).required).toEqual(
      expect.arrayContaining(['approved', 'violations', 'corrections']),
    );
  });

  it('透传导演计划中的可选字段 timeCostMinutes', async () => {
    // 验证 timeCostMinutes 可选字段从导演 JSON 解析后原样保留到 writerPacket.plan
    const planWithTime = { ...validPlan, timeCostMinutes: 25 };
    const complete = completeApproved(planWithTime);
    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { input: '搜查房间' },
      presentationContext: { location: 'home' },
      complete,
    });
    expect(result.writerPacket.plan.timeCostMinutes).toBe(25);
  });
});
