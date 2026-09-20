// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { DialogueBox } from './DialogueBox';
vi.mock('../../utils/sfx', () => ({ playSfx: vi.fn() }));

describe('dialogue reading controls', () => {
  const initial = useGameStore.getState();
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(),
    } });
    useGameStore.setState({
      ...initial,
      game: { ...initial.game, currentScene: { id: 'navigation', lines: [
        { speaker: '旁白', text: '第一句已经看过。', background: 'home', effect: 'old-effect', item: 'note' },
        { speaker: '旁白', text: '第二句刚刚出现。', background: 'street', effect: 'live-effect', item: 'phone' },
        { speaker: '旁白', text: '最后一句尚未看到。' },
      ] }, currentLineIndex: 0, sceneComplete: false, autoMode: false },
      ui: { ...initial.ui, showTitle: false },
      tavern: { ...initial.tavern, settings: { ...initial.tavern.settings!, typingSpeed: 1, autoIntervalMs: 100, playerIdentityConfirmed: true } },
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); useGameStore.setState(initial, true); });
  const finishTyping = () => act(() => vi.advanceTimersByTime(80));

  it('reviews an earlier sentence without rewinding live progress or resource state', () => {
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    finishTyping();
    const resources = useGameStore.getState().game.gameStatus;
    const liveVisualState = useGameStore.getState().game.currentState;
    fireEvent.click(screen.getByRole('button', { name: '上一句' }));
    expect(screen.getByText('第一句已经看过。')).toBeTruthy();
    expect(useGameStore.getState().game.currentLineIndex).toBe(1);
    expect(useGameStore.getState().game.gameStatus).toBe(resources);
    expect(useGameStore.getState().game.currentState).toBe(liveVisualState);
    fireEvent.click(screen.getByRole('button', { name: '返回当前' }));
    finishTyping();
    expect(screen.getByText('第二句刚刚出现。')).toBeTruthy();
    expect(useGameStore.getState().game.currentState).toBe(liveVisualState);
  });

  it('does not complete an unread final line and keeps completion after replay', () => {
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    expect(useGameStore.getState().game.sceneComplete).toBe(false);
    finishTyping();
    expect(useGameStore.getState().game.sceneComplete).toBe(true);
    const finalVisualState = useGameStore.getState().game.currentState;
    fireEvent.click(screen.getByRole('button', { name: '重头回看' }));
    expect(useGameStore.getState().game.sceneComplete).toBe(true);
    expect(useGameStore.getState().game.currentLineIndex).toBe(2);
    expect(useGameStore.getState().game.currentState).toBe(finalVisualState);
  });

  it('pauses automatic, stage and keyboard advancement while any dialog is open', async () => {
    useGameStore.setState(state => ({ game: { ...state.game, autoMode: true } }));
    const result = render(<><DialogueBox /><div role="dialog" aria-label="物件详情" /></>);
    await act(async () => { await Promise.resolve(); });
    finishTyping();
    act(() => vi.advanceTimersByTime(400));
    act(() => window.dispatchEvent(new CustomEvent('farewell:advance-dialogue')));
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(useGameStore.getState().game.currentLineIndex).toBe(0);
    expect(useGameStore.getState().game.dialogueProgress).toBeNull();
    result.rerender(<DialogueBox />);
    await act(async () => { await Promise.resolve(); });
    finishTyping();
    act(() => vi.advanceTimersByTime(150));
    expect(useGameStore.getState().game.currentLineIndex).toBe(1);
  });

  it('starts a new scene from its first page instead of inheriting the previous page number', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(50);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return (this.textContent?.length ?? 0) * 10; });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
    useGameStore.getState().actions.setCurrentScene({ id: 'old-pages', lines: [{ speaker: '旁白', text: '甲乙丙丁戊己庚辛壬癸' }] });
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    finishTyping();
    expect(screen.getByText('己庚辛壬癸')).toBeTruthy();
    act(() => useGameStore.getState().actions.setCurrentScene({ id: 'new-pages', lines: [{ speaker: '旁白', text: '新开场句。后续文字。' }] }));
    finishTyping();
    expect(screen.getByText('新开场句。')).toBeTruthy();
    expect(useGameStore.getState().game.dialogueProgress?.text).toBe('新开场句。');
    expect(useGameStore.getState().game.sceneComplete).toBe(false);
  });

  it('reflows to the first page without revealing a newly skipped prefix', () => {
    let height = 50;
    const resizeCallbacks: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return (this.textContent?.length ?? 0) * 10; });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
    useGameStore.getState().actions.setCurrentScene({ id: 'resize-pages', lines: [{ speaker: '旁白', text: '甲乙丙丁戊己庚辛壬癸' }] });
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    height = 80;
    act(() => resizeCallbacks.forEach(callback => callback()));
    expect(useGameStore.getState().game.dialogueProgress?.text).toBe('甲乙丙丁戊');
    finishTyping();
    expect(screen.getByText('甲乙丙丁戊己庚辛')).toBeTruthy();
    expect(useGameStore.getState().game.sceneComplete).toBe(false);
  });

  it('returns to the current sentence safely after resizing during a previous-page review', () => {
    let height = 50;
    const resizeCallbacks: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resizeCallbacks.push(callback); }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return (this.textContent?.length ?? 0) * 10; });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', getPropertyValue: () => '' } as unknown as CSSStyleDeclaration);
    useGameStore.getState().actions.setCurrentScene({ id: 'review-resize', lines: [{ speaker: '旁白', text: '甲乙丙丁戊己庚辛壬癸' }] });
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    height = 80;
    act(() => resizeCallbacks.forEach(callback => callback()));
    fireEvent.click(screen.getByRole('button', { name: '返回当前' }));
    expect(useGameStore.getState().game.dialogueProgress?.text).toBe('甲乙丙丁戊');
    finishTyping();
    expect(screen.getByText('甲乙丙丁戊己庚辛')).toBeTruthy();
    expect(useGameStore.getState().game.sceneComplete).toBe(false);
  });

  it('does not carry review or typed text into another save that reuses the opening scene id', () => {
    render(<DialogueBox />);
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '下一句' }));
    finishTyping();
    fireEvent.click(screen.getByRole('button', { name: '上一句' }));
    expect(screen.getByText('回看 · 已读对话')).toBeTruthy();
    act(() => useGameStore.setState(state => ({
      tavern: { ...state.tavern, activeChatId: 'another-save' },
      game: { ...state.game, currentScene: { ...state.game.currentScene!, sourceMessageId: 'new-opening' },
        currentLineIndex: 0, sceneComplete: false, dialogueProgress: null },
    })));
    expect(screen.queryByText('回看 · 已读对话')).toBeNull();
    expect(screen.getByRole('button', { name: '显示全文' })).toBeTruthy();
    expect(useGameStore.getState().game.dialogueProgress).toBeNull();
    expect(useGameStore.getState().game.sceneComplete).toBe(false);
  });
});
