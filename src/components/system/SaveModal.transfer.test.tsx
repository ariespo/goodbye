// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, initializeDatabase } from '../../sillytavern/database';
import { useGameStore } from '../../stores/gameStore';
import { buildSaveSlotPayload, startNewGame } from '../../utils/gameSession';
import { serializeSaveArchive } from '../../utils/save-transfer';
import { SaveModal } from './SaveModal';

const initial = useGameStore.getState();
let archive: string;
function file(text: string) {
  const result = new File([text], 'memory.farewell.json', { type: 'application/json' });
  Object.defineProperty(result, 'text', { value: async () => text });
  return result;
}
async function open(mode: 'manage' | 'load') {
  render(<SaveModal />);
  act(() => window.dispatchEvent(new CustomEvent('farewell:open-save-modal', { detail: { mode } })));
  await screen.findByRole('dialog');
}

beforeEach(async () => {
  useGameStore.setState(initial, true);
  const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await initializeDatabase();
  quiet.mockRestore();
  await db.saves.clear();
  await db.chats.clear();
  await startNewGame();
  archive = serializeSaveArchive(buildSaveSlotPayload('旅行前的记忆', ''));
});
afterEach(() => { cleanup(); useGameStore.setState(initial, true); vi.restoreAllMocks(); });

describe('save file controls', () => {
  it('keeps keyboard focus inside an empty archive instead of trapping it on the hidden file input', async () => {
    await open('load');
    const importButton = screen.getByRole('button', { name: '导入存档' });
    importButton.focus();
    fireEvent.keyDown(importButton, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭存档' })).toHaveFocus();
  });

  it.each(['manage', 'load'] as const)('imports in %s mode without activating the save, then loads only on request', async mode => {
    await open(mode);
    const before = useGameStore.getState();
    fireEvent.change(screen.getByLabelText('导入存档文件'), { target: { files: [file(archive)] } });
    await screen.findByText('旅行前的记忆');
    expect(await db.saves.toArray()).toHaveLength(1);
    expect(useGameStore.getState().game).toBe(before.game);
    expect(useGameStore.getState().tavern).toBe(before.tavern);
    expect(screen.getByLabelText('导入存档文件')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '读取 旅行前的记忆' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useGameStore.getState().game).not.toBe(before.game);
  });

  it('reports invalid files and lets the same input retry successfully', async () => {
    await open('load');
    const input = screen.getByLabelText('导入存档文件');
    fireEvent.change(input, { target: { files: [file('{broken')] } });
    await waitFor(() => expect(useGameStore.getState().ui.notifications.some(n => n.type === 'error')).toBe(true));
    expect(await db.saves.toArray()).toHaveLength(0);
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { files: [file(archive)] } });
    await screen.findByText('旅行前的记忆');
  });

  it('blocks duplicate imports and close interactions while the file is being read', async () => {
    await open('load');
    let finish!: (text: string) => void;
    const pending = new File([], 'pending.json');
    Object.defineProperty(pending, 'text', { value: () => new Promise<string>(resolve => { finish = resolve; }) });
    const input = screen.getByLabelText('导入存档文件');
    fireEvent.change(input, { target: { files: [pending] } });
    expect(screen.getByRole('button', { name: '导入存档' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关闭存档' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [file(archive)] } });
    await act(async () => finish(archive));
    await screen.findByText('旅行前的记忆');
    expect(await db.saves.toArray()).toHaveLength(1);
  });

  it('exports from the title load view without bubbling into a load action', async () => {
    await db.saves.add(buildSaveSlotPayload('导出测试', ''));
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:save-download');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    await open('load');
    const before = useGameStore.getState();
    const button = await screen.findByRole('button', { name: '导出 导出测试' });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);
    await waitFor(() => expect(downloaded).toBe('导出测试.farewell.json'));
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useGameStore.getState().game).toBe(before.game);
    expect(useGameStore.getState().tavern).toBe(before.tavern);
  });
});
