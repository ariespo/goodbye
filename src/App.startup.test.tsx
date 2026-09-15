// @vitest-environment jsdom

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, ChatSession, SaveSlot } from './sillytavern/types';
import { createDefaultPreset } from './sillytavern/types';
import { createDefaultVariables } from './sillytavern/vars-merger';
import { useGameStore } from './stores/gameStore';
import App from './App';

const database = vi.hoisted(() => ({
  initializeDatabase: vi.fn(),
  getSettings: vi.fn(),
  getLorebooks: vi.fn(),
  getPresets: vi.fn(),
  getChats: vi.fn(),
  getSaves: vi.fn(),
  saveChat: vi.fn(),
  savePreset: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('./sillytavern/database', () => database);
vi.mock('./utils/fonts', () => ({ applyFontFamily: () => {} }));
vi.mock('./components/game/GameCanvas', () => ({ GameCanvas: () => <div>游戏场景</div> }));
vi.mock('./components/system/CustomCursor', () => ({ CustomCursor: () => null }));
vi.mock('./components/system/TitleMusic', () => ({ TitleMusic: () => null }));
vi.mock('./components/system/AudioSystem', () => ({ AudioSystem: () => null }));
vi.mock('./components/system/NotificationToast', () => ({ NotificationToast: () => null }));
vi.mock('./components/system/TurnRecoveryBar', () => ({ TurnRecoveryBar: () => null }));
vi.mock('./components/system/ApiKeySetup', () => ({ ApiKeySetup: () => null }));
vi.mock('./components/system/SaveModal', () => ({ SaveModal: () => null }));
vi.mock('./components/tavern/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('./components/tavern/LorebookModal', () => ({ LorebookModal: () => null }));
vi.mock('./components/tavern/PresetModal', () => ({ PresetModal: () => null }));
vi.mock('./components/tavern/HistoryDrawer', () => ({ HistoryDrawer: () => null }));

const settings: AppSettings = {
  api: { baseUrl: 'https://api.example.test/v1', apiKey: 'saved-key', model: 'test-model' },
  characterName: '少女', userName: '玩家', activePresetId: 'preset', activeLorebookIds: [],
  uiMode: 'game', customTags: [], typingSpeed: 35, fontSize: 'medium', moodIntensity: 1,
  opaqueTags: [], formatPromptTemplate: '', autoMode: false, autoIntervalMs: 1500,
  fontFamily: 'renou-fangsong', musicVolume: 0.5, soundVolume: 0.65, agentNarrativeMode: 'standard',
};

function existingChat(): ChatSession {
  return {
    id: 'existing-chat', name: '已有对话', characterName: '少女', userName: '玩家',
    presetId: 'preset', lorebookIds: [], variables: createDefaultVariables(),
    messages: [{ id: 'message', role: 'user', content: '调查信箱', timestamp: 1, variables: {} }],
    createdAt: 1, updatedAt: 2,
  };
}

function existingSave(): SaveSlot {
  const state = useGameStore.getState();
  return {
    id: 'saved-slot', name: '雨夜', createdAt: 1, thumbnail: '', historyIndex: 0,
    gameState: {
      currentSceneIndex: 0, currentLineIndex: 0,
      gameStatus: state.game.gameStatus, currentState: state.game.currentState,
    },
    tavernState: { variables: createDefaultVariables(), messages: [] },
  };
}

describe('App startup with saved game data', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    database.initializeDatabase.mockResolvedValue(true);
    database.getSettings.mockResolvedValue(settings);
    database.getLorebooks.mockResolvedValue([]);
    database.getPresets.mockResolvedValue([{ ...createDefaultPreset(), id: 'preset', createdAt: 1, updatedAt: 1 }]);
    database.getChats.mockResolvedValue([]);
    database.getSaves.mockResolvedValue([]);
    database.saveChat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('waits for saved slots before mounting either opening video or title', async () => {
    let finishReading!: (saves: SaveSlot[]) => void;
    database.getSaves.mockReturnValue(new Promise<SaveSlot[]>(resolve => { finishReading = resolve; }));
    const { container } = render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载游戏数据');
    expect(container.querySelector('video')).toBeNull();
    await waitFor(() => expect(database.getSaves).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: '标题菜单' })).not.toBeInTheDocument();

    await act(async () => finishReading([existingSave()]));
    expect(await screen.findByRole('navigation', { name: '标题菜单' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('video[src*="opening-014"]')).toBeNull();
    const titleVideo = container.querySelector<HTMLVideoElement>('video[src*="title-loop-009"]');
    expect(titleVideo?.loop).toBe(true);
    expect(titleVideo?.muted).toBe(true);
    expect(useGameStore.getState().ui).toMatchObject({ showTitle: true, introPlayed: true, titleRevealed: true });
  });

  it('skips the opening for persisted chat progress even without a manual save slot', async () => {
    database.getChats.mockResolvedValue([existingChat()]);
    render(<App />);

    expect(await screen.findByRole('navigation', { name: '标题菜单' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /开场动画/ })).not.toBeInTheDocument();
    expect(database.saveChat).not.toHaveBeenCalled();
  });

  it('keeps the intro for a new player after creating the initial chat, including StrictMode', async () => {
    render(<StrictMode><App /></StrictMode>);

    const skipOpening = await screen.findByRole('button', { name: '跳过开场动画' });
    expect(database.saveChat).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation', { name: '标题菜单' })).not.toBeInTheDocument();
    expect(useGameStore.getState().ui.introPlayed).toBe(false);

    fireEvent.click(skipOpening);
    expect(await screen.findByRole('navigation', { name: '标题菜单' })).toBeInTheDocument();
    expect(useGameStore.getState().ui.introPlayed).toBe(true);
  });

  it('leaves the loading screen and reports a failed read instead of hanging', async () => {
    database.getChats.mockRejectedValue(new Error('存储读取失败'));
    render(<App />);

    expect(await screen.findByRole('button', { name: '跳过开场动画' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(useGameStore.getState().ui.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error', message: '数据加载失败: 存储读取失败' }),
    ]));
  });
});
