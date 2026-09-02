// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { SettingsModal } from './SettingsModal';

vi.mock('../../sillytavern/database', () => ({ saveSettings: vi.fn() }));
vi.mock('../../sillytavern/api-router', () => ({ fetchModels: vi.fn(), testConnectivity: vi.fn() }));

const settings: AppSettings = {
  api: { baseUrl: 'https://api.example.test/v1', apiKey: 'key', model: 'model' },
  characterName: '少女', userName: '玩家', activePresetId: null, activeLorebookIds: [],
  uiMode: 'game', customTags: [], typingSpeed: 35, fontSize: 'medium', moodIntensity: 1,
  opaqueTags: [], formatPromptTemplate: '', autoMode: false, autoIntervalMs: 1500,
  fontFamily: 'renou-fangsong', musicVolume: 0.5, soundVolume: 0.65,
  agentNarrativeMode: 'standard',
};

describe('SettingsModal', () => {
  const initialState = useGameStore.getState();

  beforeEach(() => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]) },
    });
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState(initialState, true);
  });

  it('uses the shared monochrome double-rail shell while preserving tab interaction', () => {
    useGameStore.setState(state => ({
      tavern: { ...state.tavern, settings },
      ui: { ...state.ui, showSettings: true },
    }));
    render(<SettingsModal />);

    const dialog = screen.getByRole('dialog', { name: '设置' });
    expect(dialog).toHaveClass('pixel-modal-shell', 'settings-modal-shell');
    expect(dialog.querySelectorAll('[data-pixel-frame-rail]')).toHaveLength(2);
    expect(dialog.querySelector('.clean-modal-frame-blue')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '音频' }));
    expect(screen.getByRole('button', { name: '音频' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('音乐音量')).toBeInTheDocument();
  });
});
