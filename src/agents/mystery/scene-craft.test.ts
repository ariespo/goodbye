import { describe, expect, it, vi } from 'vitest';
import { buildSceneCraftGuidance, parseSceneCraftIntent } from './scene-craft';
import { buildWriterPacket, reviewDirectorPlan } from './review';
import { projectExecutedPlan } from './action-authority';
import { buildAssertionSources } from './fact-assertion-review';
import { resolveAction } from '../../engine/action-resolution';
import { projectCharacterPerformances } from '../../data/characterPerformance';
import { DIRECTOR_PLAN_JSON_SCHEMA } from './schemas';
import { schemaWithoutAdditionalProperties, validateAdaptedSchemaValue } from './schema-compatibility';
import { prepareMysteryTurn } from './orchestrator';
import { DIRECTOR_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT } from './prompts';
import type { DirectorPlan, MysteryBrief } from './types';

const plan: DirectorPlan = { turnGoal: '回应玩家当前问题', tone: '平静',
  beats: [{ id: 'response', purpose: '回应', description: '学姐回应玩家。', speakerIds: ['touko'] }],
  revelations: [], optionIntents: [], assetRequests: [] };
const presentation = { locations: [], entities: [], namingRules: [], allowedDiscoveries: [] };
const profiles = projectCharacterPerformances(presentation, ['touko']);
const brief: MysteryBrief = { graphVersion: 'test', routeMode: 'exploratory', playerKnownFacts: [], usableFacts: [],
  hiddenFacts: [], allowedRedHerrings: [], npcKnowledge: [{ npcId: 'touko', facts: [] }], forbiddenReveals: [],
  revealBudget: { maxNewFacts: 0, maxRevealLevel: 'atmosphere', allowConfirmation: false, reason: 'test' },
  continuityWarnings: [], playerPresentation: presentation, characterPerformances: profiles };

describe('bounded scene craft', () => {
  it('gives old plans a contextual fallback without new calls or facts', () => {
    expect(parseSceneCraftIntent(undefined, plan.beats)).toBeUndefined();
    const craft = buildSceneCraftGuidance(plan, profiles);
    expect(craft).toMatchObject({ focus: 'dialogue-response', beatIds: ['response'], characterIds: ['touko'] });
    expect(craft.goal).toContain('回应');
    expect(craft.examples).toHaveLength(2);
    const packet = buildWriterPacket(plan, brief);
    expect(packet.sceneCraft).toEqual(craft);
    expect(packet.authorizedFacts).toEqual([]);
    expect(buildAssertionSources(packet)).toEqual(buildAssertionSources({ ...packet, sceneCraft: undefined }));
  });

  it.each([
    { focus: 'dialogue-response', beatIds: ['missing'] },
    { focus: 'confession', beatIds: ['response'] },
    { focus: 'dialogue-response', beatIds: [] },
    { focus: 'dialogue-response', beatIds: ['response', 'response'] },
    { focus: 'dialogue-response', beatIds: ['response'], goal: '他承认罪行' },
    { focus: 'dialogue-response', beatIds: ['response'], examples: ['昨天已经调查过'] },
    { focus: 'dialogue-response', beatIds: ['response'], readerEffect: '让她因为昨天的事内疚' },
  ])('rejects invalid references and model-written craft payloads: %j', craft => {
    expect(() => parseSceneCraftIntent(craft, plan.beats)).toThrow(/sceneCraft/);
    expect(reviewDirectorPlan({ ...plan, sceneCraft: craft } as DirectorPlan, brief).approved).toBe(false);
  });

  it('selects evidence writing only for an approved evidence-bearing plan', () => {
    const evidence: DirectorPlan = { ...plan, sceneCraft: { focus: 'evidence-focus', beatIds: ['response'] },
      revelations: [{ factId: 'F001', level: 'hint', delivery: 'object' }] };
    expect(buildSceneCraftGuidance(evidence, profiles).focus).toBe('evidence-focus');
    expect(buildSceneCraftGuidance({ ...evidence, revelations: [] }, profiles).focus).toBe('dialogue-response');
    expect(buildSceneCraftGuidance({ ...plan, beats: [{ ...plan.beats[0], speakerIds: [] }] }, profiles).characterIds).toEqual([]);
  });

  it('matches reader movement to approved cast and pressure without inventing psychology', () => {
    const caring = buildSceneCraftGuidance(plan, profiles);
    expect(caring.readerEffect).toBe('care-with-boundary');
    expect(caring.goal).toContain('关照');
    const pressured: DirectorPlan = { ...plan, tone: '克制的紧张',
      sceneCraft: { focus: 'dialogue-response', beatIds: ['response'], readerEffect: 'restrained-friction' },
      optionIntents: [{ id: 'press', intent: '问清刚才的问题', tone: '克制', expectedPressure: 'high' }] };
    const friction = buildSceneCraftGuidance(pressured, profiles);
    expect(friction.readerEffect).toBe('restrained-friction');
    expect(friction.goal).not.toEqual(caring.goal);
    expect(friction.examples).not.toEqual(caring.examples);
    expect(JSON.stringify(friction)).not.toMatch(/她其实|隐藏动机|昨天|默认承认/);
  });

  it('does not manufacture interpersonal care without a compatible present performance profile', () => {
    const requested: DirectorPlan = { ...plan, sceneCraft: { focus: 'dialogue-response', beatIds: ['response'], readerEffect: 'care-with-boundary' } };
    expect(buildSceneCraftGuidance({ ...requested, beats: [{ ...plan.beats[0], speakerIds: [] }] }, profiles).readerEffect).not.toBe('care-with-boundary');
    const forbidsCare = profiles.map(profile => ({ ...profile, forbiddenPortrayals: [...profile.forbiddenPortrayals, '不得主动关心玩家。'] }));
    const guide = buildSceneCraftGuidance(requested, forbidsCare);
    expect(guide.readerEffect).not.toBe('care-with-boundary');
    expect(guide.characterIds).toEqual(['touko']);
  });

  it('does not manufacture friction from a neutral answer or reopen an approved confirmation', () => {
    const requested: DirectorPlan = { ...plan, sceneCraft: { focus: 'dialogue-response', beatIds: ['response'], readerEffect: 'restrained-friction' } };
    expect(buildSceneCraftGuidance(requested, profiles).readerEffect).not.toBe('restrained-friction');
    const confirmed: DirectorPlan = { ...plan, sceneCraft: { focus: 'evidence-focus', beatIds: ['response'], readerEffect: 'open-question' },
      revelations: [{ factId: 'F001', level: 'confirmation', delivery: 'object' }] };
    expect(buildSceneCraftGuidance(confirmed, profiles).readerEffect).toBe('uncertainty-to-focus');
  });

  it.each([5, 20])('rebuilds guidance after a %i minute travel/work interruption without unreached goals', minutes => {
    const requested: DirectorPlan = { ...plan, turnGoal: '取得未获准的记录',
      beats: [{ ...plan.beats[0], id: 'unreached-result', locationId: 'supermarket', speakerIds: ['chen-huihui'] }],
      sceneCraft: { focus: 'evidence-focus', beatIds: ['unreached-result'], readerEffect: 'care-with-boundary' },
      revelations: [{ factId: 'F001', level: 'clue', delivery: 'object' }] };
    const resolution = resolveAction({ id: 'limited', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70, explicitBudgetMinutes: minutes,
      steps: [{ id: 'work', kind: 'investigation', scope: 'normal', locationId: 'supermarket', completionSourceIds: ['fact:F001:clue'] }] });
    const projected = projectExecutedPlan(requested, resolution, ['chen-huihui']);
    expect(projected.sceneCraft).toBeUndefined();
    const craft = buildSceneCraftGuidance(projected, projectCharacterPerformances(presentation, ['chen-huihui']), resolution);
    expect(craft.focus).toBe(minutes === 5 ? 'scene-transition' : 'action-process');
    expect(craft.readerEffect).toBe(minutes === 5 ? 'breathing-space' : 'open-question');
    expect(JSON.stringify(craft)).not.toMatch(/unreached-result|F001|未获准的记录/);
    if (minutes === 5) {
      expect(craft.characterIds).toEqual([]);
      expect(craft.goal).toContain('仍停在途中');
      expect(craft.examples.join('')).not.toContain('抵达写法');
    }
    expect(requested.sceneCraft?.beatIds).toEqual(['unreached-result']);
  });

  it('uses current executed minutes instead of replaying a completed earlier travel segment', () => {
    const resolution = resolveAction({ id: 'work-only', cycleCount: 1, startTime: '2024-09-09T09:00:00',
      currentLocationId: 'home', stamina: 100, sanity: 70,
      steps: [{ id: 'work', kind: 'search', scope: 'normal', locationId: 'home', completionSourceIds: [] }] });
    resolution.segments.unshift({ step: { id: 'old-road', kind: 'travel', scope: 'normal', locationId: 'home', completionSourceIds: [] },
      plannedMinutes: 0, executedMinutes: 0, cumulativeExecutedMinutes: 15, completed: true, staminaDelta: 0 });
    const craft = buildSceneCraftGuidance({ ...plan, beats: [{ ...plan.beats[0], speakerIds: [] }] }, [], resolution);
    expect(craft.focus).toBe('action-process');
  });

  it('keeps the optional field bounded even after a provider drops additionalProperties', () => {
    expect(schemaWithoutAdditionalProperties(DIRECTOR_PLAN_JSON_SCHEMA)).toBeDefined();
    const valid = { ...plan, sceneCraft: { focus: 'dialogue-response', beatIds: ['response'], readerEffect: 'care-with-boundary' } };
    expect(() => validateAdaptedSchemaValue(valid, DIRECTOR_PLAN_JSON_SCHEMA)).not.toThrow();
    expect(() => validateAdaptedSchemaValue({ ...valid, sceneCraft: { ...valid.sceneCraft, hiddenMotive: '秘密' } }, DIRECTOR_PLAN_JSON_SCHEMA))
      .toThrow();
    expect(() => validateAdaptedSchemaValue({ ...valid, sceneCraft: { ...valid.sceneCraft, readerEffect: 'hidden-guilt' } }, DIRECTOR_PLAN_JSON_SCHEMA))
      .toThrow();
    expect(() => validateAdaptedSchemaValue(plan, DIRECTOR_PLAN_JSON_SCHEMA)).not.toThrow();
  });

  it('leads with positive craft while preserving performance and fact authority', () => {
    expect(DIRECTOR_SYSTEM_PROMPT.indexOf('场景创作目标')).toBeLessThan(DIRECTOR_SYSTEM_PROMPT.indexOf('权力边界'));
    expect(WRITER_SYSTEM_PROMPT.indexOf('先把这一场写好')).toBeLessThan(WRITER_SYSTEM_PROMPT.indexOf('事实边界'));
    expect(WRITER_SYSTEM_PROMPT).toContain('不是事实来源');
    expect(WRITER_SYSTEM_PROMPT).toContain('resolvedAction 和角色表演规则始终优先');
    expect(WRITER_SYSTEM_PROMPT).toContain('程序提供局部修复目标时只改目标');
  });

  it('preserves the one-call ordinary preparation path with a valid creative focus', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ ...plan,
      sceneCraft: { focus: 'dialogue-response', beatIds: ['response'] } }));
    const result = await prepareMysteryTurn({ mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'craft-no-extra-call' }, preset: null,
      truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: ['touko'] },
      turnContext: { currentLocation: 'home' }, presentationContext: {}, complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.reviewPolicy.semantic).toBe(false);
    expect(result.writerPacket.sceneCraft?.focus).toBe('dialogue-response');
    expect(result.writerPacket.plan).not.toHaveProperty('sceneCraft');
  });

  it('adds no semantic review call for enum-only craft and repairs an unsupported payload before Writer', async () => {
    const invalid = { ...plan, sceneCraft: { focus: 'dialogue-response', beatIds: ['response'], secretGoal: '隐藏心理' } };
    const valid = { ...plan, sceneCraft: { focus: 'dialogue-response', beatIds: ['response'] } };
    const complete = vi.fn().mockResolvedValueOnce(JSON.stringify(invalid)).mockResolvedValueOnce(JSON.stringify(valid));
    const result = await prepareMysteryTurn({ mode: 'standard', api: { baseUrl: 'test', apiKey: 'test', model: 'scene-craft' }, preset: null,
      truthContext: { cycleCount: 1, currentLocation: 'home', lockedRoute: null, unlockedClueIds: [], playerKnowledge: {}, suspicion: {}, activeNpcIds: ['touko'] },
      turnContext: { currentLocation: 'home' }, presentationContext: {}, complete });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.reviewPolicy.semantic).toBe(false);
    expect(result.writerPacket.sceneCraft?.focus).toBe('dialogue-response');
    expect(JSON.stringify(result.writerMessages)).not.toContain('隐藏心理');
    expect(JSON.stringify(result.writerMessages)).not.toContain('secretGoal');
  });
});
