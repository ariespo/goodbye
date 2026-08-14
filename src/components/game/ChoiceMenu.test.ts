import { describe, expect, it } from 'vitest';
import { shouldShowChoiceMenu } from './choiceMenuVisibility';

describe('shouldShowChoiceMenu', () => {
  const readyState = {
    endingVisible: false,
    isStreaming: false,
    sceneComplete: true,
    hasOptions: true,
  };

  it('keeps choices hidden while a newly returned scene is still playing', () => {
    expect(shouldShowChoiceMenu({ ...readyState, sceneComplete: false })).toBe(false);
  });

  it('shows choices after the current scene has completely played', () => {
    expect(shouldShowChoiceMenu(readyState)).toBe(true);
  });

  it('keeps choices hidden while streaming, during endings, or without options', () => {
    expect(shouldShowChoiceMenu({ ...readyState, isStreaming: true })).toBe(false);
    expect(shouldShowChoiceMenu({ ...readyState, endingVisible: true })).toBe(false);
    expect(shouldShowChoiceMenu({ ...readyState, hasOptions: false })).toBe(false);
  });
});
