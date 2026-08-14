// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { PlayerIdentityPrompt } from './PlayerIdentityPrompt';

const mocks = vi.hoisted(() => ({ saveSettings: vi.fn(), persistActiveChat: vi.fn() }));
vi.mock('../../sillytavern/database', () => ({ saveSettings: mocks.saveSettings }));
vi.mock('../../utils/chatPersistence', () => ({ persistActiveChat: mocks.persistActiveChat }));

const settings: AppSettings = {
  api: { baseUrl: 'test', apiKey: 'key', model: 'model' },
  characterName: '文穗', userName: '玩家', activePresetId: null, activeLorebookIds: [],
  uiMode: 'game', customTags: [], typingSpeed: 35, fontSize: 'medium', moodIntensity: 1,
  opaqueTags: [], formatPromptTemplate: '', autoMode: false, autoIntervalMs: 1500,
  fontFamily: 'renou-fangsong', musicVolume: 0.5, soundVolume: 0.65,
  agentNarrativeMode: 'standard',
};

describe('PlayerIdentityPrompt', () => {
  const initialState = useGameStore.getState();
  afterEach(() => {
    cleanup();
    mocks.saveSettings.mockReset();
    mocks.persistActiveChat.mockReset();
    useGameStore.setState(initialState, true);
  });

  it('persists the chosen name and gender before continuing the prologue', async () => {
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.persistActiveChat.mockResolvedValue(null);
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings } }));
    const onConfirmed = vi.fn();
    render(<PlayerIdentityPrompt open onConfirmed={onConfirmed} />);

    fireEvent.change(screen.getByPlaceholderText('输入你的名字'), { target: { value: '张明' } });
    fireEvent.click(screen.getByRole('button', { name: '男' }));
    fireEvent.click(screen.getByRole('button', { name: '就是这个！' }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(mocks.saveSettings.mock.calls[0][0]).toMatchObject({
      userName: '张明', playerGender: 'male', playerIdentityConfirmed: true,
    });
    expect(mocks.persistActiveChat).toHaveBeenCalledWith({ userName: '张明' });
    expect(useGameStore.getState().tavern.settings).toMatchObject({
      userName: '张明', playerGender: 'male', playerIdentityConfirmed: true,
    });
  });
});
