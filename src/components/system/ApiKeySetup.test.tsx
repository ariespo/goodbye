// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { ApiKeySetup } from './ApiKeySetup';

const mocks = vi.hoisted(() => ({
  saveSettings: vi.fn(),
  fetchModels: vi.fn(),
}));

vi.mock('../../sillytavern/database', () => ({ saveSettings: mocks.saveSettings }));
vi.mock('../../sillytavern/api-router', () => ({ fetchModels: mocks.fetchModels }));

const settings = (apiKey = ''): AppSettings => ({
  api: { baseUrl: 'https://api.example.test/v1', apiKey, model: 'manual-model' },
  characterName: '少女',
  userName: '玩家',
  activePresetId: null,
  activeLorebookIds: [],
  uiMode: 'game',
  customTags: [],
  typingSpeed: 35,
  fontSize: 'medium',
  moodIntensity: 1,
  opaqueTags: [],
  formatPromptTemplate: '',
  autoMode: false,
  autoIntervalMs: 1500,
  fontFamily: 'renou-fangsong',
  musicVolume: 0.5,
  soundVolume: 0.65,
  agentNarrativeMode: 'standard',
});

describe('ApiKeySetup', () => {
  const initialState = useGameStore.getState();

  afterEach(() => {
    cleanup();
    mocks.saveSettings.mockReset();
    mocks.fetchModels.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('does not reopen on the title screen when a persisted API key is loaded', () => {
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, settings: settings('saved-key') },
      ui: { ...state.ui, introPlayed: true, showTitle: true },
    }));

    const { container } = render(<ApiKeySetup />);
    expect(container.innerHTML).toBe('');
  });

  it('reads models, lets the player select one, and persists the same API settings', async () => {
    mocks.fetchModels.mockResolvedValue([{ id: 'model-a' }, { id: 'model-b' }]);
    mocks.saveSettings.mockResolvedValue(undefined);
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, settings: settings() },
      ui: { ...state.ui, introPlayed: true, showTitle: true },
    }));

    const { container } = render(<ApiKeySetup />);
    fireEvent.change(container.querySelector('input[type="password"]')!, { target: { value: 'new-key' } });
    fireEvent.click(screen.getByRole('button', { name: '读取模型' }));

    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'model-b' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledTimes(1));
    expect(mocks.fetchModels).toHaveBeenCalledWith({
      baseUrl: 'https://api.example.test/v1', apiKey: 'new-key', model: '',
    });
    expect(mocks.saveSettings.mock.calls[0][0]).toMatchObject({
      api: { baseUrl: 'https://api.example.test/v1', apiKey: 'new-key', model: 'model-b' },
    });
    expect(useGameStore.getState().tavern.settings?.api.model).toBe('model-b');
  });
});
