// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseOpeningStoryline } from '../../engine/opening-storyline';
import type { Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { CharacterSprite } from './CharacterSprite';

vi.mock('./CharacterAnimationPlayer', () => ({
  CharacterAnimationPlayer: ({ fallbackSrc }: { fallbackSrc: string }) => (
    <div data-testid="character-animation" data-fallback-src={fallbackSrc} />
  ),
}));

describe('CharacterSprite dialogue continuity', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('keeps and dims a recent speaker only when they speak again within the next three lines', () => {
    const nearbyReturn: Scene = {
      id: 'nearby-return',
      lines: [
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '先说一句。' },
        { speaker: '旁白', text: '你看了她一眼。' },
        { speaker: '旁白', text: '雨还在下。' },
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '再说一句。' },
      ],
    };
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: nearbyReturn,
        currentLineIndex: 1,
        currentState: { ...state.game.currentState, character: null },
      },
    }));

    const view = render(<CharacterSprite />);
    const retained = view.container.querySelector('.character-sprite');
    expect(retained?.getAttribute('data-speaking')).toBe('false');
    const dimmedPortrait = retained?.querySelector<HTMLElement>('[data-character-dim-overlay]');
    expect(dimmedPortrait).not.toBeNull();
    expect(dimmedPortrait?.style.filter).toBe('brightness(45%)');
    expect(dimmedPortrait?.classList.contains('bg-black/45')).toBe(false);

    useGameStore.setState(state => ({
      game: { ...state.game, currentLineIndex: 3 },
    }));
    view.rerender(<CharacterSprite />);
    const speakingAgain = view.container.querySelector('.character-sprite');
    expect(speakingAgain?.getAttribute('data-speaking')).toBe('true');
    expect(speakingAgain?.querySelector('[data-character-dim-overlay]')).toBeNull();

    const distantReturn: Scene = {
      ...nearbyReturn,
      id: 'distant-return',
      lines: [
        nearbyReturn.lines[0],
        { speaker: '旁白', text: '第一行。' },
        { speaker: '旁白', text: '第二行。' },
        { speaker: '旁白', text: '第三行。' },
        nearbyReturn.lines[3],
      ],
    };
    useGameStore.setState(state => ({
      game: { ...state.game, currentScene: distantReturn, currentLineIndex: 1 },
    }));
    view.rerender(<CharacterSprite />);

    expect(view.container.querySelector('.character-sprite')).toBeNull();
  });

  it('keeps Touko dimmed across the two narrator lines in the real opening scene', () => {
    const opening = parseOpeningStoryline();
    const lunchboxLineIndex = opening.lines.findIndex(line => line.text.startsWith('你接过袋子'));
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: opening,
        currentLineIndex: lunchboxLineIndex,
        currentState: { ...state.game.currentState, character: null },
      },
    }));

    const { container } = render(<CharacterSprite />);

    const portrait = container.querySelector('.character-sprite');
    expect(portrait?.getAttribute('data-speaking')).toBe('false');
    expect(portrait?.querySelector<HTMLElement>('[data-character-dim-overlay]')?.style.filter)
      .toBe('brightness(45%)');
    expect(portrait?.querySelector('[data-testid="character-animation"]')?.getAttribute('data-fallback-src'))
      .toContain('/assets/characters/touko-normal.png');
  });

  it('does not mistake an unmapped NPC speaker for player narration', () => {
    const scene: Scene = {
      id: 'unmapped-npc-interrupts',
      lines: [
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '先说一句。' },
        { speaker: '门卫老张', text: '这里不能进去。' },
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '知道了。' },
      ],
    };
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        currentLineIndex: 1,
        currentState: { ...state.game.currentState, character: null },
      },
    }));

    const { container } = render(<CharacterSprite />);

    expect(container.querySelector('.character-sprite')).toBeNull();
  });

  it('lets a mapped NPC take over as the only fully lit portrait', () => {
    const scene: Scene = {
      id: 'mapped-npc-takes-over',
      lines: [
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '先说一句。' },
        { speaker: '文穗', character: 'fumi-normal.png', emotion: 'calm', text: '轮到我了。' },
        { speaker: '灯织', character: 'touko-normal.png', emotion: 'calm', text: '再说一句。' },
      ],
    };
    useGameStore.setState(state => ({
      game: {
        ...state.game,
        currentScene: scene,
        currentLineIndex: 1,
        currentState: { ...state.game.currentState, character: 'fumi-normal.png' },
      },
    }));

    const { container } = render(<CharacterSprite />);
    const portraits = container.querySelectorAll('.character-sprite');

    expect(portraits).toHaveLength(1);
    expect(portraits[0]?.getAttribute('data-speaking')).toBe('true');
    expect(portraits[0]?.querySelector('[data-character-dim-overlay]')).toBeNull();
    expect(portraits[0]?.querySelector('[data-testid="character-animation"]')?.getAttribute('data-fallback-src'))
      .toContain('/assets/characters/fumi-normal.png');
  });
});
