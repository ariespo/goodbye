export type SaveModalMode = 'manage' | 'load';

/** 从标题页、结局等外部打开读档或存档面板。 */
export function openSaveModal(mode: SaveModalMode = 'load'): void {
  window.dispatchEvent(new CustomEvent('farewell:open-save-modal', { detail: { mode } }));
}
