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
    messages[0]?.content.includes('事实复核') || messages[0]?.content.includes('节奏与玩家能动性')
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
    expect(result.pacingReview).toBeNull();
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
      .mockResolvedValueOnce(approvedFactReview)
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

  it('keeps repairing a recoverable director plan instead of stopping after one failed repair', async () => {
    const safePlan = { ...validPlan, revelations: [] };
    const invalid = { ...safePlan, revelations: [
      { factId: 'invented-morning-detail', level: 'atmosphere', delivery: 'dialogue' },
    ] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(invalid))
      .mockResolvedValueOnce(JSON.stringify(invalid))
      .mockResolvedValueOnce(JSON.stringify(safePlan));

    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });

    expect(result.directorAttempts).toBe(3);
    expect(result.hardReview.approved).toBe(true);
  });

  it('runs semantic review in strict mode', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(approvedFactReview)
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
    expect(complete).toHaveBeenCalledTimes(3);
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
      .mockResolvedValueOnce(approvedFactReview)
      .mockResolvedValueOnce(approvedFactReview);
    await prepareMysteryTurn({
      mode: 'strict',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    const directorOptions = complete.mock.calls[0]?.[1];
    expect(directorOptions?.responseFormat?.type).toBe('json_schema');
    expect(directorOptions?.responseFormat?.json_schema?.name).toBe('director_plan');
    const criticOptions = complete.mock.calls[1]?.[1];
    expect(criticOptions?.responseFormat?.json_schema?.name).toBe('fact_review');
  });

  it('falls back from json_schema to json_object and caches the working mode', async () => {
    const complete = vi.fn(async (_messages, callOptions) => {
      if (callOptions?.responseFormat?.type === 'json_schema') {
        throw new Error('API error 400: response_format is not supported');
      }
      return _messages[0]?.content.includes('事实复核') || _messages[0]?.content.includes('节奏与玩家能动性')
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
    expect(complete.mock.calls[1]?.[1]?.responseFormat).toEqual({ type: 'json_object' });

    // 同一服务端的后续调用直接使用 json_object，不再重复撞 json_schema。
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
    expect(complete.mock.calls[0]?.[1]?.responseFormat).toEqual({ type: 'json_object' });
  });

  it('falls back to plain text only when both structured modes are unavailable', async () => {
    const complete = vi.fn(async (_messages, callOptions) => {
      if (callOptions?.responseFormat) {
        throw new Error('API error 400: This response_format type is unavailable now');
      }
      return _messages[0]?.content.includes('事实复核') ? approvedFactReview : JSON.stringify(validPlan);
    });
    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'no-structured' }, preset: null,
      truthContext, turnContext: {}, presentationContext: {}, complete,
    });
    expect(result.hardReview.approved).toBe(true);
    expect(complete.mock.calls.map(call => call[1]?.responseFormat?.type ?? 'text'))
      .toEqual(['json_schema', 'json_object', 'text', 'text']);
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

  it('repairs a semantically rejected plan and re-runs every safety gate', async () => {
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const repaired = { ...validPlan, beats: [{ id: 'safe', purpose: '观察', description: '只观察衣柜' }] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(repaired))
      .mockResolvedValueOnce(approvedFactReview);

    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    });

    expect(result.directorAttempts).toBe(2);
    expect(result.directorPlan.beats[0]?.id).toBe('safe');
    expect(result.hardReview.approved).toBe(true);
    expect(result.semanticReview?.approved).toBe(true);
    expect(result.pacingReview).toBeNull();
    expect(complete).toHaveBeenCalledTimes(4);
  });

  it('repairs a later-stage failure in place without resampling the original director prompt', async () => {
    clearOrchestrationLog();
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const repaired = { ...validPlan, beats: [{ id: 'safe', purpose: '观察', description: '只观察衣柜' }] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(repaired))
      .mockResolvedValueOnce(approvedFactReview);

    await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    });

    const userContents = complete.mock.calls.map(call => String(call[0]?.[1]?.content ?? ''));
    expect(userContents[0]).toContain('请为当前回合制定导演计划');
    const repairContent = userContents.find(content => content.includes('[RejectedPlan]'));
    expect(repairContent).toBeDefined();
    expect(repairContent).not.toContain('请为当前回合制定导演计划');
    expect(repairContent).toContain('npc-knowledge-violation');
    expect(repairContent).toContain('NPC 越权透露事实');
    expect(repairContent).toContain('查看衣柜');
    expect(repairContent).toContain('不得再次出现下列违规');
    expect(userContents.filter(content => content.includes('请为当前回合制定导演计划'))).toHaveLength(1);

    const stages = getOrchestrationLog()[0]!.stages.map(stage => stage.stage);
    const semanticIndex = stages.indexOf('semantic-review');
    const repairIndex = stages.indexOf('semantic-repair');
    expect(semanticIndex).toBeGreaterThanOrEqual(0);
    expect(repairIndex).toBeGreaterThan(semanticIndex);
    expect(stages.slice(semanticIndex, repairIndex)).not.toContain('hard-review');
    expect(stages.slice(semanticIndex, repairIndex)).not.toContain('hard-review-retry');
  });

  it('builds the next repair task from the same violation plus a do-not-repeat residual', async () => {
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const repaired = { ...validPlan, beats: [{ id: 'safe', purpose: '观察', description: '只观察衣柜' }] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(repaired))
      .mockResolvedValueOnce(approvedFactReview);

    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    });

    expect(result.hardReview.approved).toBe(true);
    const repairContents = complete.mock.calls
      .map(call => String(call[0]?.[1]?.content ?? ''))
      .filter(content => content.includes('[RejectedPlan]'));
    expect(repairContents).toHaveLength(2);
    expect(repairContents[0]).toContain('npc-knowledge-violation: NPC 越权透露事实');
    expect(repairContents[1]).toContain('npc-knowledge-violation: NPC 越权透露事实');
    expect(repairContents[1]).toContain('先前失败残留也不得再次出现');
    expect(repairContents[1]).not.toMatch(/只重新输出一个完整、合法、无 Markdown 的 JSON 对象；不得省略、截断或添加解释/);
    expect(repairContents.every(content => !content.includes('请为当前回合制定导演计划'))).toBe(true);
  });

  it('uses the remaining critic attempt to repair a semantic-repair plan that failed hard-review in place', async () => {
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const hardReviewInvalid: DirectorPlan = {
      ...validPlan,
      revelations: [{ factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' }],
    };
    const repaired = { ...validPlan, beats: [{ id: 'safe', purpose: '观察', description: '只观察衣柜' }] };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(hardReviewInvalid))
      .mockResolvedValueOnce(JSON.stringify(repaired))
      .mockResolvedValueOnce(approvedFactReview);

    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    });

    expect(result.hardReview.approved).toBe(true);
    expect(result.directorPlan.beats[0]?.id).toBe('safe');
    expect(result.semanticReview?.approved).toBe(true);
    const userContents = complete.mock.calls.map(call => String(call[0]?.[1]?.content ?? ''));
    expect(userContents.filter(content => content.includes('请为当前回合制定导演计划'))).toHaveLength(1);
    const repairContents = userContents.filter(content => content.includes('[RejectedPlan]'));
    expect(repairContents).toHaveLength(2);
    expect(repairContents[1]).toContain('c-player-killed-fumi');
    expect(repairContents[1]).toContain('unknown-fact');
    expect(repairContents[1]).toContain('先前失败残留也不得再次出现');
    expect(repairContents[1]).toContain('未通过硬审查');
    expect(repairContents.every(content => !content.includes('请为当前回合制定导演计划'))).toBe(true);
  });

  it('blocks after the remaining critic attempt still fails hard-review and does not resample the director prompt', async () => {
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const hardReviewInvalid: DirectorPlan = {
      ...validPlan,
      revelations: [{ factId: 'c-player-killed-fumi', level: 'confirmation', delivery: 'narration' }],
    };
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(semanticRejected)
      .mockResolvedValueOnce(JSON.stringify(hardReviewInvalid))
      .mockResolvedValueOnce(JSON.stringify(hardReviewInvalid));

    await expect(prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    })).rejects.toMatchObject({
      name: 'MysteryPipelineBlockedError',
      message: expect.stringContaining('最终语义修复后的导演计划未通过硬审查'),
    });

    const userContents = complete.mock.calls.map(call => String(call[0]?.[1]?.content ?? ''));
    expect(userContents.filter(content => content.includes('请为当前回合制定导演计划'))).toHaveLength(1);
    expect(userContents.filter(content => content.includes('[RejectedPlan]'))).toHaveLength(2);
  });

  it('blocks after exhausting the existing semantic repair budget and does not ship the rejected plan', async () => {
    const semanticRejected = JSON.stringify({
      approved: false,
      violations: [{ code: 'npc-knowledge-violation', message: 'NPC 越权透露事实' }],
      corrections: ['删除越权台词'],
    });
    const complete = vi.fn(async (messages: Array<{ content: string }>) => (
      messages[0]?.content.includes('事实复核') || messages[0]?.content.includes('节奏与玩家能动性')
        ? semanticRejected
        : JSON.stringify(validPlan)
    ));

    await expect(prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: { playerInput: '观察' },
      presentationContext: {},
      complete,
    })).rejects.toMatchObject({
      name: 'MysteryPipelineBlockedError',
      message: expect.stringContaining('语义事实复核修复后仍发现潜在泄密'),
    });
  });

  it('ignores critic claims that case revelations require player knowledge events', async () => {
    const falsePositive = JSON.stringify({
      approved: false,
      violations: [{
        code: 'knowledge_event_missing',
        factId: 'F001',
        message: 'F001 revelation 未申请 knowledgeEvent，且不在 allowedDiscoveries。',
      }],
      corrections: ['为 F001 revelation 新增 knowledgeEvent。'],
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(falsePositive)
      .mockResolvedValueOnce(approvedFactReview);

    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, preset: null,
      truthContext,
      turnContext: { playerInput: '检查房间', cycleCount: 1 },
      presentationContext: { location: 'home' },
      complete,
    });

    expect(result.semanticReview?.approved).toBe(true);
    expect(result.directorAttempts).toBe(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('treats lies-about as permission rather than mandatory active lying', async () => {
    const falsePositive = JSON.stringify({
      approved: false,
      violations: [{
        code: 'npc-knowledge-boundary',
        factId: 'F007',
        message: 'old-man stance 为 lies-about，但未体现其主动撒谎。',
      }],
      corrections: [],
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(falsePositive)
      .mockResolvedValueOnce(approvedFactReview);

    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, preset: null,
      truthContext, turnContext: { playerInput: '质问', cycleCount: 2 },
      presentationContext: { location: 'home' }, complete,
    });

    expect(result.semanticReview?.approved).toBe(true);
    expect(result.directorAttempts).toBe(1);
  });

  it('ignores critic entries that explicitly say they are not violations', async () => {
    const falsePositive = JSON.stringify({
      approved: false,
      violations: [{ code: 'red_herring_misuse', factId: 'F006', message: '计划未使用 F006，不构成违规。' }],
      corrections: [],
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(falsePositive)
      .mockResolvedValueOnce(approvedFactReview);
    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, preset: null,
      truthContext, turnContext: { playerInput: '检查', cycleCount: 2 },
      presentationContext: { location: 'home' }, complete,
    });
    expect(result.semanticReview?.approved).toBe(true);
    expect(result.directorAttempts).toBe(1);
  });

  it('drops a DeepSeek critic violation that concludes evidence is valid and no violation exists', async () => {
    const falsePositive = JSON.stringify({
      approved: false,
      violations: [{
        code: 'knowledge_event_evidence_mismatch',
        factId: 'meet:chen-huihui',
        message: '但旁白确实概括了紧张与不自然笑容，符合 evidenceStandard；计划中的 evidence 与 beats 一致，未发现违规。',
      }],
      corrections: ['删除一段无关的文穗行踪台词。'],
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(falsePositive);
    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'deepseek-v4-flash' }, preset: null,
      truthContext, turnContext: { playerInput: '检查' }, presentationContext: {}, complete,
    });
    expect(result.semanticReview).toEqual({ approved: true, violations: [], corrections: [] });
    expect(result.directorAttempts).toBe(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('does not require optional insane performance after confirmation', async () => {
    const falsePositive = JSON.stringify({
      approved: false,
      violations: [{
        code: 'character_performance_violation', factId: 'F009',
        message: '计划已 confirmation，但未体现confirmation后的空洞专注。',
      }],
      corrections: [],
    });
    const complete = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(falsePositive)
      .mockResolvedValueOnce(approvedFactReview);
    const result = await prepareMysteryTurn({
      mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'test' }, preset: null,
      truthContext, turnContext: { playerInput: '确认', cycleCount: 5 },
      presentationContext: { location: 'home' }, complete,
    });
    expect(result.semanticReview?.approved).toBe(true);
    expect(result.directorAttempts).toBe(1);
  });

  it('falls back when a proxy wraps response_format rejection as successful text', async () => {
    const proxyError = 'Proxy error (HTTP 400): This response_format type is unavailable now';
    const complete = vi.fn()
      .mockResolvedValueOnce(proxyError)
      .mockResolvedValueOnce(JSON.stringify(validPlan))
      .mockResolvedValueOnce(approvedFactReview)
      .mockResolvedValueOnce(approvedFactReview);
    const result = await prepareMysteryTurn({
      mode: 'standard',
      api: { baseUrl: 'wrapped-proxy', apiKey: 'test', model: 'test' },
      preset: null,
      truthContext,
      turnContext: {},
      presentationContext: {},
      complete,
    });
    expect(result.hardReview.approved).toBe(true);
    expect(complete).toHaveBeenCalledTimes(3);
    expect(complete.mock.calls[1]?.[1]?.responseFormat).toEqual({ type: 'json_object' });
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
    expect(entry.stages.map(s => s.stage)).toEqual(expect.arrayContaining(['director', 'hard-review', 'semantic-review']));
    expect(entry.stages.map(s => s.stage)).not.toContain('pacing-review');
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
    expect(entry.directorAttempts).toBe(3);
    expect(entry.error).toContain('事实审查');
    expect(entry.stages.map(s => s.stage)).toEqual([
      'director', 'hard-review',
      'director-repair', 'hard-review-retry',
      'director-repair', 'hard-review-retry',
    ]);
  });

  it('exposes json schemas with required top-level fields', () => {
    expect(DIRECTOR_PLAN_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining(['turnGoal', 'tone', 'beats', 'revelations', 'optionIntents', 'assetRequests']),
    );
    expect(FACT_REVIEW_JSON_SCHEMA.required).toEqual(
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
