// Opt-in provider smoke: synthetic scenes only; never writes a player save.
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSceneCraftGuidance } from '../src/agents/mystery/scene-craft';
import { buildWriterSystemPrompt, buildWriterUserPrompt } from '../src/agents/mystery/prompts';
import { repairNarrativeAgainstWriterPacket } from '../src/agents/mystery/narrative-review';
import { resolveAction } from '../src/engine/action-resolution';
import { maintextToScene } from '../src/engine/scene-parser';
import { callSecondaryApi } from '../src/sillytavern/api-router';
import type { ApiRequestEvent } from '../src/sillytavern/api-telemetry';
import { createDefaultPreset } from '../src/sillytavern/types';
import { createParseState, parseChunk } from '../src/sillytavern/stream-parser';
import type { DirectorPlan, WriterPacket } from '../src/agents/mystery/types';

describe.skipIf(process.env.LIVE_SCENE_CRAFT !== '1')('live scene guidance and local repair smoke', () => {
  it('generates a guided quiet scene and patches one rejected line with the real provider', async () => {
    const { DAY_API_KEY: apiKey, DAY_API_BASE_URL: baseUrl, DAY_MODEL: model } = process.env;
    if (!apiKey || !baseUrl || !model) throw new Error('Explicit provider environment required');
    const requests: ApiRequestEvent[] = [];
    const api = { apiKey, baseUrl, model, telemetry: { onRequest: (event: ApiRequestEvent) => requests.push(event) } };
    const base = createDefaultPreset();
    const preset = { ...base, settings: { ...base.settings, openai_max_tokens: 2048 } };
    const resolution = resolveAction({ id: 'smoke-rest', cycleCount: 1, startTime: '2024-09-09T08:00:00',
      currentLocationId: 'home', stamina: 60, sanity: 70,
      steps: [{ id: 'rest', kind: 'rest', scope: 'short', locationId: 'home', requestedMinutes: 10, completionSourceIds: [] }] });
    const plan: DirectorPlan = { turnGoal: '在家中休息十分钟', tone: '平静', revelations: [],
      beats: [{ id: 'rest', purpose: '短暂休息', description: '玩家在家中停下来休息，随后回到眼前的事情。', speakerIds: [] }],
      actionSteps: [{ id: 'rest', kind: 'rest', scope: 'short', locationId: 'home' }],
      optionIntents: [{ id: 'wait', intent: '再等一会儿', tone: '平静', expectedPressure: 'low' },
        { id: 'look', intent: '看看房间', tone: '平静', expectedPressure: 'low' }], assetRequests: [] };
    const packet: WriterPacket = { plan, sceneCraft: buildSceneCraftGuidance(plan, [], resolution),
      authorizedFacts: [], playerKnownFacts: [], authorizedKnowledgeEvents: [], authorizedBackgroundFacts: [],
      approvedBackgroundFactProposals: [], forbiddenInstructions: [], characterPerformances: [],
      playerPresentation: { locations: [], entities: [], namingRules: [], allowedDiscoveries: [] }, resolvedAction: resolution,
      continuityContext: { clock: { localTime: '08:00', cycleCount: 1 } } };
    const outcomes: Array<{ stage: string; passed: boolean; elapsedMs: number; errorKind?: string }> = [];
    let generated = '';
    let patched = '';
    const quote = '雨水把灯光揉成一片迟迟散不开的金色。';
    const original = `<maintext>场景|home\n对话|旁白|calm|${quote}</maintext><option>留下\n离开</option><hint>想好再行动。</hint><sum>停在窗前。</sum><vars>{}</vars>`;
    const patchOnly = process.env.SCENE_CRAFT_PHASE === 'patch';
    for (const stage of patchOnly ? ['patch'] : ['writer', 'patch']) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 40_000);
      const started = performance.now();
      try {
        if (stage === 'writer') {
          generated = await callSecondaryApi(api, [
            { role: 'system', content: buildWriterSystemPrompt() },
            { role: 'user', content: buildWriterUserPrompt(packet, { input: '休息十分钟', recentHistory: [],
              instruction: '简短场景，maintext二至四行，背景保持home，不使用其他资源。' }) },
          ], preset, { temperature: 0.5, maxTokens: 2048, abortSignal: controller.signal });
          const parsed = parseChunk(createParseState(), generated).parsed;
          expect(maintextToScene(parsed.maintext ?? '').lines.length).toBeGreaterThan(0);
          expect(parsed.options.length).toBeGreaterThanOrEqual(2);
          expect(generated).not.toContain('【');
        } else {
          patched = await repairNarrativeAgainstWriterPacket({ api, preset, packet, rejectedNarrative: original,
            review: { approved: false, violations: [{ code: 'repeated-prose', candidateQuote: quote, message: '这句在上一回合已出现。' }],
              corrections: ['改写此处表达，仍停在窗边；不创造新事实。'] }, abortSignal: controller.signal });
          expect(patched).not.toContain(quote);
          expect(patched.slice(0, patched.indexOf('对话|旁白|calm|'))).toBe(original.slice(0, original.indexOf('对话|旁白|calm|')));
          expect(patched.slice(patched.indexOf('</maintext>'))).toBe(original.slice(original.indexOf('</maintext>')));
        }
        outcomes.push({ stage, passed: true, elapsedMs: Math.round(performance.now() - started) });
      } catch (error) {
        outcomes.push({ stage, passed: false, elapsedMs: Math.round(performance.now() - started),
          errorKind: error && typeof error === 'object' && 'kind' in error ? String(error.kind) : error instanceof Error ? error.name : 'unknown' });
      } finally { clearTimeout(timer); }
    }
    mkdirSync('.codex-test-tmp', { recursive: true });
    writeFileSync(`.codex-test-tmp/scene-craft-live${patchOnly ? '-patch' : ''}.json`, JSON.stringify({ testedAt: new Date().toISOString(), model,
      outcomes, requests, generated, patched, limitations: 'Two isolated synthetic calls; no full game turn, no saved game mutation, no blind literary comparison.' }, null, 2));
    expect(outcomes.every(outcome => outcome.passed)).toBe(true);
  }, 90_000);
});
