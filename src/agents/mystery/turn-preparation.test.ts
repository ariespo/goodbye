import { describe, expect, it } from 'vitest';
import { buildTurnPreparation, preparationContextKey } from './turn-preparation';
import { createDefaultPreset, type AppSettings, type ChatPreset } from '../../sillytavern/types';
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
    history: [], pendingNarrativeContext: null, hasPendingAction: false,
  };
}

describe('shared foreground and speculative preparation', () => {
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
