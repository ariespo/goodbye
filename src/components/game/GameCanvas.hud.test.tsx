// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { within, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('GameCanvas HUD containment', () => {
  it('mounts the first-batch overlays inside the virtual HUD canvas', () => {
    const { container } = render(<GameCanvas />);
    const hud = container.querySelector('.hud-design-canvas');

    expect(hud).not.toBeNull();
    expect(within(hud as HTMLElement).getByTestId('action-panel-mock')).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByTestId('clue-modal-mock')).toBeInTheDocument();
    expect(within(hud as HTMLElement).getByTestId('map-modal-mock')).toBeInTheDocument();
  });
});
