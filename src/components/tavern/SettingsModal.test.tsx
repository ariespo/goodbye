// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { SettingsModal } from './SettingsModal';
import { saveSettings } from '../../sillytavern/database';

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
    vi.mocked(saveSettings).mockReset();
    vi.mocked(saveSettings).mockResolvedValue(undefined);
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

  it('saves optional prices against the exact model and endpoint without price guesses', async () => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings }, ui: { ...state.ui, showSettings: true } }));
    render(<SettingsModal />);
    fireEvent.click(screen.getByRole('button', { name: 'AI 接口' }));
    const input = screen.getByLabelText('主模型输入价格 / 百万 token');
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('主模型输出价格 / 百万 token'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('主模型计价币种'), { target: { value: 'CNY' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ api: expect.objectContaining({ pricing: {
      baseUrl: settings.api.baseUrl, model: settings.api.model, currency: 'CNY', inputPerMillion: 2.5, outputPerMillion: 9,
    } }) }));
  });

  it('shows the default compression budget for existing settings and only applies changes after saving', async () => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings }, ui: { ...state.ui, showSettings: true } }));
    render(<SettingsModal />);
    fireEvent.click(screen.getByRole('button', { name: '剧情模式' }));
    const input = screen.getByLabelText('剧情压缩阈值（估算 token）');
    expect(input).toHaveValue(12000);
    fireEvent.change(input, { target: { value: '18000' } });
    expect(useGameStore.getState().tavern.settings?.contextCompressionThresholdTokens).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(useGameStore.getState().tavern.settings?.contextCompressionThresholdTokens).toBe(18000));
    expect(useGameStore.getState().ui.showSettings).toBe(false);
  });

  it('discards a changed compression budget on cancel and restores the saved value when reopened', () => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings: { ...settings, contextCompressionThresholdTokens: 9000 } }, ui: { ...state.ui, showSettings: true } }));
    const { rerender } = render(<SettingsModal />);
    fireEvent.click(screen.getByRole('button', { name: '剧情模式' }));
    fireEvent.change(screen.getByLabelText('剧情压缩阈值（估算 token）'), { target: { value: '24000' } });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(useGameStore.getState().tavern.settings?.contextCompressionThresholdTokens).toBe(9000);
    useGameStore.setState(state => ({ ui: { ...state.ui, showSettings: true } }));
    rerender(<SettingsModal />);
    expect(screen.getByLabelText('剧情压缩阈值（估算 token）')).toHaveValue(9000);
  });

  it.each([
    ['', 12000], ['-20', 2000], ['999999', 100000], ['8600.7', 8600],
  ])('normalizes the compression budget %s when saving', async (inputValue, expected) => {
    useGameStore.setState(state => ({ tavern: { ...state.tavern, settings }, ui: { ...state.ui, showSettings: true } }));
    render(<SettingsModal />);
    fireEvent.click(screen.getByRole('button', { name: '剧情模式' }));
    fireEvent.change(screen.getByLabelText('剧情压缩阈值（估算 token）'), { target: { value: inputValue } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(useGameStore.getState().tavern.settings?.contextCompressionThresholdTokens).toBe(expected));
  });
});
