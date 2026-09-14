// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { HudViewport } from './HudViewport';
import { MapModal } from './MapModal';
import { rebuildSceneFromChat } from '../../utils/sceneFromChat';

const databaseMocks = vi.hoisted(() => ({ saveChat: vi.fn() }));

vi.mock('../../sillytavern/database', () => ({ saveChat: databaseMocks.saveChat }));

function mockMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const originalMatchMedia = window.matchMedia;
  const query = {
    matches: initialMatches,
    media: '(max-width: 700px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => query) });

  return {
    query,
    change(matches: boolean) {
      (query as { matches: boolean }).matches = matches;
      act(() => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent)));
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
    },
  };
}

function renderMapInGameCanvas() {
  return render(
    <div className="game-canvas">
      <HudViewport><MapModal /></HudViewport>
    </div>,
  );
}

describe('MapModal', () => {
  const initialState = useGameStore.getState();
  let media: ReturnType<typeof mockMatchMedia> | null = null;

  afterEach(() => {
    cleanup();
    media?.restore();
    media = null;
    databaseMocks.saveChat.mockReset();
    databaseMocks.saveChat.mockResolvedValue(undefined);
    useGameStore.setState(initialState, true);
  });

  it('uses the shared map dialog shell and explains that the current location cannot be traveled to', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    expect(screen.getByRole('dialog', { name: '地图' })).toHaveClass('pixel-modal-shell');
    expect(screen.getByText(/当前位置：/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已经抵达' })).toBeDisabled();
  });

  it('keeps the travel button tied to the existing travel availability predicates with explanatory labels', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    const travelButton = screen.getByRole('button', { name: '前往此处' });
    expect(travelButton).toBeEnabled();

    act(() => useGameStore.getState().actions.setIsWaitingForAI(true));
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsWaitingForAI(false);
      useGameStore.getState().actions.setIsTyping(true);
    });
    expect(screen.getByRole('button', { name: '当前演出尚未结束' })).toBeDisabled();

    act(() => {
      useGameStore.getState().actions.setIsTyping(false);
      useGameStore.getState().actions.setGameStatus({ stamina: 0 });
    });
    expect(screen.getByRole('button', { name: '体力不足' })).toBeDisabled();
  });

  it('explains when a rumored location still needs confirmation', () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      tavern: {
        ...state.tavern,
        variables: {
          ...state.tavern.variables,
          knowledgeEvents: [...(state.tavern.variables.knowledgeEvents as string[]), 'find:water-tower-fragment'],
        },
      },
    }));

    render(<MapModal />);

    fireEvent.click(screen.getByRole('button', { name: '山中的旧设施？' }));
    expect(screen.getByRole('button', { name: '需要确认位置' })).toBeDisabled();
  });

  it('keeps map controls reachable inside the HUD canvas', () => {
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    render(<HudViewport><MapModal /></HudViewport>);

    fireEvent.click(screen.getByRole('button', { name: '关闭地图' }));
    expect(useGameStore.getState().ui.showMap).toBe(false);
  });

  it('portals the single map dialog outside the scaled HUD canvas at the narrow breakpoint', () => {
    media = mockMatchMedia(true);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { container } = renderMapInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: '地图' });

    expect(dialog.parentElement).toHaveClass('game-canvas');
    expect(hud).not.toContainElement(dialog);
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);
  });

  it('moves the same selected destination across narrow and desktop portal transitions', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { container } = renderMapInGameCanvas();
    const hud = container.querySelector('.hud-design-canvas') as HTMLElement;

    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(within(hud).getByRole('dialog', { name: '地图' })).toBeInTheDocument();

    media.change(true);
    expect(hud).not.toContainElement(screen.getByRole('dialog', { name: '地图' }));
    expect(screen.getByRole('dialog', { name: '地图' }).parentElement).toHaveClass('game-canvas');
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);

    media.change(false);
    expect(within(hud).getByRole('dialog', { name: '地图' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往此处' })).toBeEnabled();
    expect(screen.getAllByRole('dialog', { name: '地图' })).toHaveLength(1);
  });

  it('removes its media-query listener when unmounted', () => {
    media = mockMatchMedia(false);
    useGameStore.setState(state => ({ ui: { ...state.ui, showMap: true } }));

    const { unmount } = renderMapInGameCanvas();

    expect(media.query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('anchors the desktop board to the approved map geometry', () => {
    const styles = readFileSync(resolve(__dirname, '../../styles/globals.css'), 'utf8');

    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s*>\s*\.pixel-modal-frame\s*\{[^}]*top:\s*122px;[^}]*left:\s*90px;[^}]*width:\s*1460px;[^}]*height:\s*738px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.map-modal-map\s*\{[^}]*width:\s*1354px;[^}]*height:\s*385px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\.pixel-modal-shell\s*\{[^}]*pointer-events:\s*auto;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-header\s*\{[^}]*gap:\s*20px;[^}]*padding:\s*28px 56px 28px 50px;/);
    expect(styles).toMatch(/\.hud-design-canvas\s+\.map-modal-shell\s+\.pixel-modal-close\s*\{[^}]*top:\s*43px;[^}]*right:\s*56px;[^}]*width:\s*44px;[^}]*height:\s*44px;/);
  });

  it('stops partial travel at the next event without granting arrival or a visit', async () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: {
        ...state.game,
        gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T15:55:00'), stamina: 100, sanity: 70 },
        history: [],
      },
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-map-partial',
        chats: [{
          id: 'chat-map-partial', name: 'map partial', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
        }],
        variables: {
          ...state.tavern.variables,
          cycleCount: 1, location: 'home', time: '2024-09-09T15:55:00', deathNews: undefined,
          knowledgeEvents: [],
        },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '前往此处' }));

    await waitFor(() => expect(useGameStore.getState().game.gameStatus.time).toEqual(new Date('2024-09-09T16:00:00')));
    const state = useGameStore.getState();
    expect(state.tavern.variables.location).toBe('home');
    expect(state.tavern.variables.knowledgeEvents).not.toContain('visit:school');
    expect(state.tavern.variables.actionContinuity?.continuation?.actionId).toMatch(/^map-travel:/);
    expect(state.game.currentScene?.lines[0].text).toContain('路程尚未完成');
    expect(state.game.currentScene?.lines[0].text).not.toContain('抵达文穗的中学');
    const accepted = state.tavern.chats[0].messages.at(-1);
    expect(accepted?.localAction).toBe('map-travel');
    expect(accepted?.acceptedActionOutcome).toEqual(state.api.parsedContent.actionOutcome);
    const rebuilt = rebuildSceneFromChat(state.tavern.chats[0]);
    expect(rebuilt?.lines[0]).toMatchObject({ background: 'street', speaker: '旁白' });
    expect(rebuilt?.character).toBeUndefined();
    expect(rebuilt?.observe).toBeUndefined();
    expect(rebuilt?.actionOutcome?.remaining?.totalMinutes).toBe(5);
    expect(state.api.parsedContent.options).toEqual(['处理眼前的事情']);
    expect(state.api.parsedContent.optionBindings).toBeUndefined();
  });

  it('persists the resolved travel before making it visible in the store', async () => {
    let releaseSave: (() => void) | undefined;
    databaseMocks.saveChat.mockImplementation(() => new Promise<void>(resolveSave => { releaseSave = resolveSave; }));
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T08:00:00'), stamina: 100, sanity: 70 } },
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-map',
        chats: [{
          id: 'chat-map', name: 'map', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
        }],
        variables: { ...state.tavern.variables, cycleCount: 1, location: 'home', time: '2024-09-09T08:00:00' },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '前往此处' }));

    await waitFor(() => expect(databaseMocks.saveChat).toHaveBeenCalledOnce());
    const savedChat = databaseMocks.saveChat.mock.calls[0][0];
    expect(savedChat.messages.at(-2)?.localAction).toBe('map-travel');
    expect(savedChat.messages.at(-1)).toMatchObject({
      role: 'assistant',
      localAction: 'map-travel',
      acceptedActionOutcome: {
        executedMinutes: 10,
        executedTravelMinutes: 10,
        executedWorkMinutes: 0,
      },
    });
    expect(rebuildSceneFromChat(savedChat)?.observe).toBe(savedChat.messages.at(-1)?.parsed?.observe);
    expect(useGameStore.getState().tavern.variables.location).toBe('home');
    expect(useGameStore.getState().game.gameStatus.time).toEqual(new Date('2024-09-09T08:00:00'));

    releaseSave?.();
    await waitFor(() => expect(useGameStore.getState().tavern.variables.location).toBe('school'));
    expect(useGameStore.getState().game.gameStatus.time).toEqual(new Date('2024-09-09T08:10:00'));
    expect(useGameStore.getState().tavern.variables.knowledgeEvents).toContain('visit:school');
    expect(useGameStore.getState().api.parsedContent).toMatchObject({
      options: [],
      optionBindings: undefined,
      actionOutcome: { executedMinutes: 10, executedTravelMinutes: 10, executedWorkMinutes: 0 },
    });
  });

  it('does not create repeated zero-minute travel when an event is already due', async () => {
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: {
        ...state.game,
        gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T16:00:00'), stamina: 100, sanity: 70 },
        history: [],
      },
      tavern: {
        ...state.tavern,
        variables: { ...state.tavern.variables, cycleCount: 1, location: 'home', time: '2024-09-09T16:00:00', deathNews: 'pending' },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '前往此处' }));

    await waitFor(() => expect(useGameStore.getState().ui.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/既定事件需要先处理/) }),
    ])));
    expect(useGameStore.getState().tavern.variables.location).toBe('home');
    expect(useGameStore.getState().game.history).toEqual([]);
  });

  it('keeps state and history unchanged when map persistence fails', async () => {
    databaseMocks.saveChat.mockRejectedValueOnce(new Error('disk unavailable'));
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: {
        ...state.game,
        gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T08:00:00'), stamina: 100, sanity: 70 },
        history: [],
      },
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-map',
        chats: [{
          id: 'chat-map', name: 'map', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
        }],
        variables: { ...state.tavern.variables, cycleCount: 1, location: 'home', time: '2024-09-09T08:00:00' },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '前往此处' }));

    await waitFor(() => expect(useGameStore.getState().ui.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/disk unavailable/) }),
    ])));
    expect(useGameStore.getState().tavern.variables.location).toBe('home');
    expect(useGameStore.getState().game.gameStatus.time).toEqual(new Date('2024-09-09T08:00:00'));
    expect(useGameStore.getState().game.history).toEqual([]);
  });

  it('settles a rapid double click only once', async () => {
    let releaseSave: (() => void) | undefined;
    databaseMocks.saveChat.mockImplementation(() => new Promise<void>(resolveSave => { releaseSave = resolveSave; }));
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T08:00:00'), stamina: 100, sanity: 70 } },
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-map',
        chats: [{
          id: 'chat-map', name: 'map', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
        }],
        variables: { ...state.tavern.variables, cycleCount: 1, location: 'home', time: '2024-09-09T08:00:00' },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    const button = screen.getByRole('button', { name: '前往此处' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(databaseMocks.saveChat).toHaveBeenCalledOnce());

    releaseSave?.();
    await waitFor(() => expect(useGameStore.getState().tavern.variables.location).toBe('school'));
    expect(useGameStore.getState().tavern.variables.actionContinuity?.settledResolutionIds).toHaveLength(1);
  });

  it('does not commit a saved result after the active chat changes', async () => {
    let releaseSave: (() => void) | undefined;
    databaseMocks.saveChat.mockImplementation(() => new Promise<void>(resolveSave => { releaseSave = resolveSave; }));
    useGameStore.setState(state => ({
      ui: { ...state.ui, showMap: true },
      game: { ...state.game, gameStatus: { ...state.game.gameStatus, time: new Date('2024-09-09T08:00:00'), stamina: 100, sanity: 70 } },
      tavern: {
        ...state.tavern,
        activeChatId: 'chat-map',
        chats: [{
          id: 'chat-map', name: 'map', messages: [], characterName: '文穗', userName: '玩家',
          presetId: null, lorebookIds: [], variables: state.tavern.variables, createdAt: 1, updatedAt: 1,
        }],
        variables: { ...state.tavern.variables, cycleCount: 1, location: 'home', time: '2024-09-09T08:00:00' },
      },
    }));

    render(<MapModal />);
    fireEvent.click(screen.getByRole('button', { name: '文穗的中学' }));
    fireEvent.click(screen.getByRole('button', { name: '前往此处' }));
    await waitFor(() => expect(databaseMocks.saveChat).toHaveBeenCalledOnce());
    act(() => useGameStore.getState().actions.setActiveChatId('another-chat'));
    releaseSave?.();

    await waitFor(() => expect(useGameStore.getState().ui.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringMatching(/状态已经变化/) }),
    ])));
    expect(useGameStore.getState().tavern.variables.location).toBe('home');
    expect(useGameStore.getState().game.history).toEqual([]);
  });
});
