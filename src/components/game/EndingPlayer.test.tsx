// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { EndingPlayer } from './EndingPlayer';
import { DialogueBox } from './DialogueBox';

vi.mock('../../utils/sfx', () => ({ playSfx: vi.fn() }));
const baseline = useGameStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '你留在记忆里，屋里仍然安静。' }));
});
afterEach(() => {
  cleanup();
  useGameStore.setState(baseline, true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ending narrative context', () => {
  it.each(['STAY', 'N-2', 'X-2', 'P-2', 'LOOP'])('does not announce a broken loop before %s', endingId => {
    useGameStore.setState(state => ({ game: { ...state.game, sceneComplete: true,
      endingPanel: { visible: false, pendingEndingId: endingId, activeEndingId: null, isPreview: false, isAnimating: false } } }));
    render(<EndingPlayer />);
    expect(screen.queryByText('这一次，时间没有继续倒退。')).not.toBeInTheDocument();
  });

  it('frames a collection replay before its text without marking another ending seen', async () => {
    useGameStore.setState(state => ({ game: { ...state.game, sceneComplete: true, endingsSeen: ['A-1'],
      endingPanel: { visible: false, pendingEndingId: 'STAY', activeEndingId: null, isPreview: true, isAnimating: false } } }));
    render(<EndingPlayer />);
    expect(screen.getByText('记忆中的陪伴')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    const state = useGameStore.getState();
    expect(state.game.currentScene?.lines[0].text).toContain('记忆中的陪伴');
    expect(state.game.currentScene?.lines[0].background).toBe('black');
    expect(state.game.endingsSeen).toEqual(['A-1']);
  });

  it.each(['manual', 'auto'])('plays the ending through real dialogue controls and blocks the outro/menu (%s)', async mode => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '眼前的雨还在下。\n\n你记得的声音已经停了。' }));
    useGameStore.setState(state => ({
      ui: { ...state.ui, showTitle: false },
      tavern: { ...state.tavern, settings: { ...state.tavern.settings!, typingSpeed: 1, autoIntervalMs: 50, playerIdentityConfirmed: true } },
      game: { ...state.game, currentScene: null, sceneComplete: true,
        endingPanel: { visible: false, pendingEndingId: 'N-2', activeEndingId: null, isPreview: false, isAnimating: false } },
    }));
    render(<><DialogueBox /><EndingPlayer /></>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(useGameStore.getState().game.endingPanel.visible).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(useGameStore.getState().game.dialogueProgress?.text).toContain('现实与回忆');
    if (mode === 'manual') {
      act(() => window.dispatchEvent(new CustomEvent('farewell:advance-dialogue')));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(useGameStore.getState().game.currentLineIndex).toBe(1);
      fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    } else {
      fireEvent.click(screen.getByRole('button', { name: '手动' }));
      for (let step = 0; step < 4; step++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      }
    }
    expect(useGameStore.getState().game.currentLineIndex).toBe(2);
    expect(useGameStore.getState().game.sceneComplete).toBe(true);
    const finishedScene = useGameStore.getState().game.currentScene;
    act(() => window.dispatchEvent(new CustomEvent('farewell:advance-dialogue')));
    await act(async () => { await vi.advanceTimersByTimeAsync(2200); });
    expect(screen.getByRole('button', { name: /回到轮回清晨/ })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', code: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: '重头回看' }));
    expect(screen.queryByText('回看 · 已读对话')).not.toBeInTheDocument();
    expect(useGameStore.getState().game.currentScene).toBe(finishedScene);
  });
});
