// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ActionBar } from './ActionBar';

const loopMocks = vi.hoisted(() => ({ performAction: vi.fn(), sendMessage: vi.fn() }));

vi.mock('../../hooks/useGameLoop', () => ({
  useGameLoop: () => loopMocks,
}));

const playableScene: Scene = {
  id: 'wheel-test',
  lines: [{ speaker: '旁白', text: '测试场景' }],
  observe: '窗边有异常痕迹。',
  investigateItems: [{
    desc: '检查窗台', suspect: '未知', style: '现实', time: '10分钟', stamina: 1, sanity: 0,
  }],
  actionItems: [{
    desc: '推开窗户', style: '现实', time: '5分钟', stamina: 1, sanity: 0,
  }],
};

describe('ActionBar PC operation wheel', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    loopMocks.performAction.mockClear();
    loopMocks.sendMessage.mockClear();
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
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    useGameStore.setState(initialState, true);
  });

  it('keeps the operation button hidden until the final dialogue text has completed', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: playableScene,
        sceneComplete: false,
        isWaitingForAI: false,
      },
    }));

    render(<ActionBar />);
    expect(screen.queryByRole('button', { name: '操作' })).toBeNull();

    act(() => {
      useGameStore.setState(state => ({
        game: { ...state.game, sceneComplete: true },
      }));
    });

    expect(screen.getByRole('button', { name: '操作' })).not.toBeNull();
  });

  it('expands six actions from the persistent operation button', () => {
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: playableScene,
        sceneComplete: true,
        isWaitingForAI: false,
      },
    }));

    render(<ActionBar />);

    const trigger = screen.getByRole('button', { name: '操作' });
    const hubFrame = trigger.querySelector('[data-operation-hub-frame]');
    expect(hubFrame?.tagName.toLowerCase()).toBe('svg');
    expect(hubFrame?.querySelectorAll('path[data-operation-hub-rail]')).toHaveLength(2);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu', { name: '操作轮盘' })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const wheel = screen.getByRole('menu', { name: '操作轮盘' });
    expect(wheel).not.toBeNull();
    expect(wheel.tagName.toLowerCase()).toBe('svg');
    const sectorPaths = Array.from(wheel.querySelectorAll('path[data-wheel-sector]'));
    expect(sectorPaths).toHaveLength(6);
    expect(wheel.querySelectorAll('path[data-wheel-outline]')).toHaveLength(6);
    expect(wheel.querySelectorAll('path[data-wheel-selection]')).toHaveLength(0);
    expect(document.querySelectorAll('.operation-wheel__overlay-content')).toHaveLength(6);
    expect(new Set(sectorPaths.map(path => path.getAttribute('data-inner-radius')))).toEqual(new Set(['78']));
    expect(new Set(sectorPaths.map(path => path.getAttribute('data-outer-radius')))).toEqual(new Set(['245']));
    for (const label of ['观察', '调查', '行动', '线索', '地图', '自由']) {
      const sector = screen.getByRole('menuitem', { name: label });
      expect(sector.tagName.toLowerCase()).toBe('g');
      expect(sector.querySelector('path[data-wheel-sector]')).not.toBeNull();
    }
  });

  it('opens free input from the wheel and confirms the trimmed player action', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, currentScene: playableScene, sceneComplete: true, isWaitingForAI: false },
    }));

    render(<ActionBar />);
    fireEvent.click(screen.getByRole('button', { name: '操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '自由' }));

    const input = screen.getByRole('textbox', { name: '自由行动' });
    fireEvent.change(input, { target: { value: '  检查床底  ' } });
    fireEvent.click(screen.getByRole('button', { name: '确认自由行动' }));

    expect(loopMocks.sendMessage).toHaveBeenCalledWith('检查床底');
    expect(screen.queryByRole('dialog', { name: '自由行动' })).toBeNull();
  });

  it('submits free input with Enter and closes it with Escape', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, currentScene: playableScene, sceneComplete: true, isWaitingForAI: false },
    }));

    render(<ActionBar />);
    fireEvent.click(screen.getByRole('button', { name: '操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '自由' }));
    const input = screen.getByRole('textbox', { name: '自由行动' });
    fireEvent.change(input, { target: { value: '查看窗外' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(loopMocks.sendMessage).toHaveBeenCalledWith('查看窗外');
    expect(screen.queryByRole('dialog', { name: '自由行动' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '自由' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '自由行动' })).toBeNull();
    expect(loopMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the wheel mounted while the closing animation finishes', () => {
    vi.useFakeTimers();
    useGameStore.setState(state => ({
      game: { ...state.game, currentScene: playableScene, sceneComplete: true },
    }));

    render(<ActionBar />);
    const trigger = screen.getByRole('button', { name: '操作' });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('menu', { name: '操作轮盘' }).closest('.operation-dock')?.classList.contains('is-closing')).toBe(true);

    act(() => vi.advanceTimersByTime(360));
    expect(screen.queryByRole('menu', { name: '操作轮盘' })).toBeNull();
    vi.useRealTimers();
  });

  it('opens the real clue modal state and collapses after choosing clues', () => {
    vi.useFakeTimers();
    useGameStore.setState(state => ({
      game: { ...state.game, currentScene: playableScene, sceneComplete: true },
      ui: { ...state.ui, showClues: false },
    }));

    render(<ActionBar />);
    fireEvent.click(screen.getByRole('button', { name: '操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '线索' }));

    expect(useGameStore.getState().ui.showClues).toBe(true);
    expect(screen.getByRole('button', { name: '操作' }).getAttribute('aria-expanded')).toBe('false');
    act(() => vi.advanceTimersByTime(360));
    expect(screen.queryByRole('menu', { name: '操作轮盘' })).toBeNull();
    vi.useRealTimers();
  });
});
