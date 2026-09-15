// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { ItemCallout } from './ItemCallout';

describe('ItemCallout dismissal', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    useGameStore.getState().actions.setCurrentState({ item: 'opening-mug' });
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('provides a touch-accessible close button without advancing the scene', () => {
    const advance = vi.fn();
    render(<div onClick={advance}><ItemCallout /></div>);

    const close = screen.getByRole('button', { name: '关闭物品详情' });
    fireEvent.pointerDown(close, { pointerType: 'touch' });
    fireEvent.click(close);

    expect(screen.queryByText('星月夜马克杯')).toBeNull();
    expect(advance).not.toHaveBeenCalled();
  });

  it('dismisses on an outside touch while allowing the intended dialogue click', () => {
    const advance = vi.fn();
    render(<><ItemCallout /><button onClick={advance}>继续剧情</button></>);

    const dialogue = screen.getByRole('button', { name: '继续剧情' });
    fireEvent.pointerDown(dialogue, { pointerType: 'touch' });
    fireEvent.click(dialogue);

    expect(screen.queryByText('星月夜马克杯')).toBeNull();
    expect(advance).toHaveBeenCalledTimes(1);
  });

  it('keeps the item open when touching its description without advancing dialogue', () => {
    const advance = vi.fn();
    render(<div onClick={advance}><ItemCallout /></div>);

    const description = screen.getByText('黑白像素风马克杯，杯身有两个小人手拉手。');
    fireEvent.pointerDown(description, { pointerType: 'touch' });
    fireEvent.click(description);

    expect(screen.queryByText('星月夜马克杯')).not.toBeNull();
    expect(advance).not.toHaveBeenCalled();
  });

  it('does not dismiss a new item introduced by the same outside dialogue click', () => {
    render(
      <>
        <ItemCallout />
        <button onClick={() => useGameStore.getState().actions.setCurrentState({ item: 'opening-note' })}>
          下一句
        </button>
      </>,
    );

    const nextLine = screen.getByRole('button', { name: '下一句' });
    fireEvent.pointerDown(nextLine, { pointerType: 'touch' });
    fireEvent.click(nextLine);

    expect(screen.queryByText('星月夜马克杯')).toBeNull();
    expect(screen.queryByText('文穗的纸条')).not.toBeNull();
  });

  it('closes with Escape and still shows later scene item cues', () => {
    render(<ItemCallout />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('星月夜马克杯')).toBeNull();

    act(() => useGameStore.getState().actions.setCurrentState({ item: 'opening-note' }));
    expect(screen.queryByText('文穗的纸条')).not.toBeNull();

    act(() => useGameStore.getState().actions.setCurrentState({ item: null }));
    expect(screen.queryByText('文穗的纸条')).toBeNull();
  });
});
