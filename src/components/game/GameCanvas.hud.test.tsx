// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, within, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameCanvas } from './GameCanvas';

const storeMocks = vi.hoisted(() => ({
  setCurrentScene: vi.fn(),
}));

vi.mock('../../stores/gameStore', () => ({
  useGameStore: (selector: (state: unknown) => unknown) => selector({
    game: { currentState: { mood: 'calm' }, currentScene: {}, },
    tavern: { chats: [], activeChatId: null },
    actions: { setCurrentScene: storeMocks.setCurrentScene },
    ui: { showEndingEditor: false },
  }),
}));

vi.mock('./BackgroundLayer', () => ({ BackgroundLayer: () => null }));
vi.mock('./RainOverlay', () => ({ RainOverlay: () => null }));
vi.mock('./MoodOverlay', () => ({ MoodOverlay: () => null }));
vi.mock('./EffectOverlay', () => ({ EffectOverlay: () => null }));
vi.mock('./ItemCallout', () => ({ ItemCallout: () => null }));
vi.mock('./InvestigationHotspots', () => ({ InvestigationHotspots: () => null }));
vi.mock('./CharacterSprite', () => ({ CharacterSprite: () => null }));
vi.mock('./ChoiceMenu', () => ({ ChoiceMenu: () => null }));
vi.mock('./DialogueBox', () => ({ DialogueBox: () => null }));
vi.mock('./StatusPanel', () => ({ StatusPanel: () => null }));
vi.mock('./ActionBar', () => ({ ActionBar: () => null }));
vi.mock('./ActionPanel', () => ({ ActionPanel: () => <div data-testid="action-panel-mock" /> }));
vi.mock('./ClueModal', () => ({ ClueModal: () => <div data-testid="clue-modal-mock" /> }));
vi.mock('./MapModal', () => ({ MapModal: () => <div data-testid="map-modal-mock" /> }));
vi.mock('./CharacterProfileModal', () => ({ CharacterProfileModal: () => null }));
vi.mock('./ConclusionModal', () => ({ ConclusionModal: () => null }));
vi.mock('./EndingPlayer', () => ({ EndingPlayer: () => null }));
vi.mock('./CycleResetWatcher', () => ({ CycleResetWatcher: () => null }));
vi.mock('./ClueDiscoveryOverlay', () => ({ ClueDiscoveryOverlay: () => null }));
vi.mock('./KnowledgeUpdateOverlay', () => ({ KnowledgeUpdateOverlay: () => null }));
vi.mock('./GameplayGuide', () => ({ GameplayGuide: () => null }));
vi.mock('./ApiGuideCard', () => ({ ApiGuideCard: () => null }));
vi.mock('../system/LoadingOverlay', () => ({ LoadingOverlay: () => null }));

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const originalMatchMedia = window.matchMedia;
  const query = {
    matches: initialMatches,
    media: '(max-width: 800px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => query) });

  return {
    change(matches: boolean) {
      (query as { matches: boolean }).matches = matches;
      act(() => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent)));
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    },
  };
}

describe('GameCanvas HUD containment', () => {
  let media: ReturnType<typeof mockMatchMedia> | null = null;

  afterEach(() => {
    media?.restore();
    media = null;
  });

  it('mounts the first-batch overlays inside the virtual HUD canvas on desktop', () => {
    media = mockMatchMedia(false);
    const { container } = render(<GameCanvas />);
    const hud = container.querySelector('.hud-design-canvas');

    expect(hud).not.toBeNull();
    expect(within(hud as HTMLElement).getByTestId('action-panel-mock')).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByTestId('clue-modal-mock')).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByTestId('map-modal-mock')).toBeInTheDocument();
  });

  it('mounts the map outside the scaled HUD canvas on mobile without duplicating it', () => {
    media = mockMatchMedia(true);
    const { container } = render(<GameCanvas />);
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
    const map = within(container).getByTestId('map-modal-mock');

    expect(hud).not.toContainElement(map);
    expect(container.querySelectorAll('[data-testid="map-modal-mock"]')).toHaveLength(1);
  });

  it('moves the single map modal when the narrow-screen media query changes', () => {
    media = mockMatchMedia(false);
    const { container } = render(<GameCanvas />);
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;

    expect(within(hud).getByTestId('map-modal-mock')).toBeInTheDocument();

    media.change(true);
    const map = within(container).getByTestId('map-modal-mock');
    expect(hud).not.toContainElement(map);
    expect(container.querySelectorAll('[data-testid="map-modal-mock"]')).toHaveLength(1);
  });
});
