// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { DialogueBox } from './DialogueBox';

const keyboardScene: Scene = {
  id: 'dialogue-keyboard-test',
  lines: [
    { speaker: '旁白', text: '第一句' },
    { speaker: '旁白', text: '第二句' },
  ],
};

function dispatchAdvanceKey(target: EventTarget, code: 'Enter' | 'Space') {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key: code === 'Space' ? ' ' : 'Enter',
  });
  target.dispatchEvent(event);
  return event;
}

describe('DialogueBox global keyboard advance', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: keyboardScene,
        currentLineIndex: 0,
        autoMode: false,
        sceneComplete: false,
        isWaitingForAI: false,
      },
      tavern: {
        ...state.tavern,
        settings: {
          ...state.tavern.settings,
          typingSpeed: 1,
          playerIdentityConfirmed: true,
          playerGender: 'male',
        },
      },
      ui: {
        ...state.ui,
        showSettings: false,
        showLorebook: false,
        showPreset: false,
        showHistory: false,
        showMap: false,
        showClues: false,
        showCharacters: false,
        showConclusion: false,
        showEndingEditor: false,
        showApiGuide: false,
        showTitle: false,
        showPromptInspector: false,
        showOrchestrationLog: false,
      },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    useGameStore.setState(initialState, true);
  });

  function renderKeyboardFixture() {
    render(
      <>
        <DialogueBox />
        <button type="button"><span data-testid="button-child">按钮</span></button>
        <a href="#test"><span data-testid="anchor-child">链接</span></a>
        <input aria-label="输入" />
        <textarea aria-label="多行输入" />
        <select aria-label="选择"><option>选项</option></select>
        <div contentEditable suppressContentEditableWarning><span data-testid="editable-child">编辑</span></div>
        <div role="button" tabIndex={0}><span data-testid="role-button-child">角色按钮</span></div>
      </>,
    );
    act(() => vi.advanceTimersByTime(100));
  }

  it('leaves Enter to native or ARIA interactive controls without cancelling or advancing dialogue', () => {
    renderKeyboardFixture();
    const targets = [
      screen.getByTestId('button-child'),
      screen.getByTestId('anchor-child'),
      screen.getByRole('textbox', { name: '输入' }),
      screen.getByRole('textbox', { name: '多行输入' }),
      screen.getByRole('combobox', { name: '选择' }),
      screen.getByTestId('editable-child'),
      screen.getByTestId('role-button-child'),
    ];

    for (const target of targets) {
      const event = dispatchAdvanceKey(target, 'Enter');
      expect(event.defaultPrevented, target.outerHTML).toBe(false);
      expect(useGameStore.getState().game.currentLineIndex, target.outerHTML).toBe(0);
    }
  });

  it.each(['Enter', 'Space'] as const)('still consumes %s on the stage and advances ordinary dialogue', code => {
    renderKeyboardFixture();

    const event = dispatchAdvanceKey(document.body, code);

    expect(event.defaultPrevented).toBe(true);
    expect(useGameStore.getState().game.currentLineIndex).toBe(1);
  });
});
