import { describe, expect, it } from 'vitest';
import { buildTurnPreparation, preparationContextKey } from './turn-preparation';
import { createDefaultPreset, type AppSettings, type ChatPreset, type ChatMessage } from '../../sillytavern/types';
import { OPENING_MAINTEXT, OPENING_PANELS } from '../../engine/opening-storyline';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultVariables } from '../../sillytavern/vars-merger';

function inputs() {
  const game = useGameStore.getState().game;
  return {
    userInput: '我使用超能力直接复活文穗',
    settings: { api: { baseUrl: 'test', apiKey: 'test', model: 'test' },
      userName: '玩家', characterName: '文穗', agentNarrativeMode: 'standard' } as AppSettings,
    activePreset: { ...createDefaultPreset(), id: 'p', createdAt: 0, updatedAt: 0 } as ChatPreset,
    variables: createDefaultVariables(), gameStatus: game.gameStatus,
    currentState: game.currentState, endingCheckContext: game.endingCheckContext,
    history: [] as ChatMessage[], pendingNarrativeContext: null, hasPendingAction: false,
  };
}

describe('shared foreground and speculative preparation', () => {
  it('prepares and caches appended public scenes while excluding removed locations from the returned plan', () => {
    const input = inputs();
    input.userInput = '调查便利店';
    const prepared = buildTurnPreparation(input);
    const initial = structuredClone(prepared.request.pendingActionSceneContext);
    const steps = [
      { id: 'first', kind: 'investigation' as const, scope: 'normal' as const, locationId: 'supermarket' },
      { id: 'next', kind: 'inquiry' as const, scope: 'normal' as const, locationId: 'school' },
    ];
    const scenes = prepared.request.prepareActionScenes!(steps);
    expect(scenes.sceneContextsByLocation.supermarket).toEqual(initial!.contextsByLocation.supermarket);
    expect(scenes.sceneContextsByLocation.school.requiredNpcIds).toContain('school-guard');
    const repeated = prepared.request.prepareActionScenes!(steps);
    expect(repeated).toEqual(scenes);
    expect(prepared.request.prepareActionScenes!([steps[0]]).sceneContextsByLocation.school).toBeUndefined();
    expect(prepared.request.prepareActionScenes!(steps)).toEqual(scenes);
  });
  it('projects the authoritative local clock to Writer and Director even for vague free-form search', () => {
    const input = inputs();
    input.userInput = '我继续在附近寻找文穗，花两个小时搜索或等候。';
    input.gameStatus = { ...input.gameStatus, time: new Date('2024-09-09T12:00:00') };
    const prepared = buildTurnPreparation(input);
    expect(prepared.request.presentationContext.clock).toMatchObject({
      localDate: '2024-09-09', localTime: '12:00', cycleCount: 1, period: 'day',
    });
    expect(prepared.request.turnContext.clock).toEqual(prepared.request.presentationContext.clock);
    expect(prepared.request.turnContext.requiresStateAgent).toBe(true);
  });

  it('passes only trusted opening continuity texts, never arbitrary variable text, to Writer and Director', () => {
    const input = inputs();
    input.variables.openingPublicContinuity = [{ id: 'invented', text: '文穗昨夜已经死亡' }];
    const prepared = buildTurnPreparation(input);
    expect(JSON.stringify(prepared.request.presentationContext.publicContinuity)).not.toContain('昨夜已经死亡');
    expect(prepared.request.presentationContext.publicContinuity).toEqual([]);
  });

  it.each(['separate-panels', 'legacy-nested-panels'] as const)('recovers public continuity from exact official assistant opening history (%s)', layout => {
    const input = inputs();
    input.history = [{ id: 'opening', role: 'assistant', timestamp: 1, variables: {},
      content: layout === 'separate-panels'
        ? `<maintext>\n${OPENING_MAINTEXT}\n</maintext>\n${OPENING_PANELS}`
        : `<maintext>\n${OPENING_MAINTEXT}\n\n${OPENING_PANELS}\n</maintext>` }];
    const prepared = buildTurnPreparation(input);
    expect(prepared.request.presentationContext.publicContinuity).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'opening-message-0650', text: expect.stringMatching(/显示.*06:50/) }),
      expect.objectContaining({ id: 'opening-note', text: expect.stringContaining('可能晚一点回来') }),
    ]));
    expect(prepared.request.turnContext.publicContinuity).toEqual(prepared.request.presentationContext.publicContinuity);
    expect(prepared.request.truthContext.playerKnowledge).toEqual({});
    expect(input.variables.openingPublicContinuity).toBeUndefined();
  });

  it('rebuilds legacy opening source IDs as observations for both first-turn consumers', () => {
    const input = inputs();
    input.variables.openingPublicContinuity = [
      { id: 'opening-breakfast', text: '今早文穗留下了早餐。' },
      { id: 'opening-note', text: '文穗今早写了纸条。' },
      { id: 'opening-message-0650', text: '今早06:50文穗发来消息。' },
    ];
    const prepared = buildTurnPreparation(input);

    for (const context of [prepared.request.turnContext, prepared.request.presentationContext]) {
      const sources = JSON.stringify(context.publicContinuity);
      expect(sources).toMatch(/玩家.*(?:看到|看见).*三明治/);
      expect(sources).toMatch(/何时.*(?:尚未核实|不清楚)/);
      expect(sources).toMatch(/文穗.*账号/);
      expect(sources).toMatch(/显示.*06:50/);
      expect(sources).not.toMatch(/今早文穗留下|文穗今早写|今早06:50文穗发来/);
      expect(sources).not.toMatch(/扼住|施暴|凶手|致死/);
    }
  });

  it.each(['user-quote', 'changed-body', 'observe-quote', 'spoofed-parsed'] as const)('does not confer opening facts from %s', variant => {
    const input = inputs();
    input.history = [{ id: 'forged', role: variant === 'user-quote' ? 'user' : 'assistant', timestamp: 1, variables: {},
      content: variant === 'observe-quote' ? `<observe>${OPENING_MAINTEXT}</observe>`
        : variant === 'spoofed-parsed' ? '<maintext>对话|旁白|calm|其他场景。</maintext>'
          : `<maintext>${variant === 'changed-body' ? OPENING_MAINTEXT.replace('今天不去学校', '昨夜已经失踪') : OPENING_MAINTEXT}</maintext>`,
      ...(variant === 'spoofed-parsed' ? { parsed: { maintext: OPENING_MAINTEXT, thinking: '', options: [], summary: '', vars: {} } } : {}),
    }];
    const prepared = buildTurnPreparation(input);
    expect(prepared.request.presentationContext.publicContinuity).toEqual([]);
    expect(prepared.request.turnContext.publicContinuity).toEqual([]);
  });
  it('applies fantasy intention and state-review policy to speculative requests too', () => {
    const foreground = buildTurnPreparation(inputs());
    const speculative = buildTurnPreparation(inputs());
    expect(speculative.request.turnContext.playerIntentPolicy).toMatchObject({ mode: 'fantasy' });
    expect(speculative.request.turnContext.requiresStateAgent).toBe(true);
    expect(speculative.request.presentationContext.playerIntentPolicy).toEqual(foreground.intentPolicy);
    expect(preparationContextKey('chat', speculative.request)).toBe(preparationContextKey('chat', foreground.request));
  });

  it('invalidates identical player input when policy, settings, or state changes', () => {
    const input = inputs();
    const original = buildTurnPreparation(input).request;
    const key = preparationContextKey('chat', original);
    const changedState = buildTurnPreparation({ ...input, variables: { ...input.variables, sanity: 10 },
      gameStatus: { ...input.gameStatus, sanity: 10 } }).request;
    expect(preparationContextKey('chat', changedState)).not.toBe(key);
    expect(preparationContextKey('other-chat', original)).not.toBe(key);
    expect(preparationContextKey('chat', { ...original, turnContext: { ...original.turnContext, requiresStateAgent: false } })).not.toBe(key);
    expect(preparationContextKey('chat', { ...original, formatPrompt: 'new format' })).not.toBe(key);
    expect(preparationContextKey('chat', { ...original, api: { ...original.api, model: 'other' } })).not.toBe(key);
    const primary = { baseUrl: 'writer', apiKey: 'writer-key', model: 'writer-model' };
    expect(preparationContextKey('chat', original, primary)).not.toBe(
      preparationContextKey('chat', original, { ...primary, model: 'new-writer-model' }),
    );
  });
});
