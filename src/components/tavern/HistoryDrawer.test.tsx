// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatSession, Scene } from '../../sillytavern/types';
import { useGameStore } from '../../stores/gameStore';
import { HistoryDrawer } from './HistoryDrawer';

describe('seen-only dialogue history', () => {
  const initial = useGameStore.getState();
  const currentScene: Scene = { id: 'current', sourceMessageId: 'current-message', lines: [
    { speaker: '旁白', text: '这一句已经读完。' },
    { speaker: '旁白', text: '只打出几个字，后面内容还没有读。' },
    { speaker: '旁白', text: '未读的秘密不能出现。' },
  ] };
  const chat: ChatSession = {
    id: 'chat', name: 'test', characterName: '文穗', userName: '玩家', presetId: null,
    lorebookIds: [], variables: {}, createdAt: 1, updatedAt: 1,
    messages: [
      { id: 'old', role: 'assistant', content: '<thinking>私有思考不可见</thinking><maintext>场景|home\n对话|旁白|平静|上一回合的原文仍然保存。</maintext>', timestamp: 1, variables: {} },
      { id: 'input', role: 'user', content: '检查桌面。', timestamp: 2, variables: {} },
      { id: 'current-message', role: 'assistant', content: '<maintext>对话|旁白|平静|未读的秘密不能出现。</maintext><summary>完整摘要不得泄露</summary>', timestamp: 3, variables: {} },
    ],
  };
  beforeEach(() => {
    useGameStore.setState({ ...initial,
      game: { ...initial.game, currentScene, currentLineIndex: 1, sceneComplete: false,
        dialogueProgress: { sceneId: 'current', lineIndex: 1, text: '只打出几个字' } },
      tavern: { ...initial.tavern, chats: [chat], activeChatId: 'chat' },
      ui: { ...initial.ui, showHistory: true, showTitle: false },
    });
  });
  afterEach(() => { cleanup(); useGameStore.setState(initial, true); });

  it('shows prior original dialogue and only the displayed prefix of the live scene', () => {
    const { container } = render(<HistoryDrawer />);
    expect(screen.getByText('上一回合的原文仍然保存。')).toBeTruthy();
    expect(screen.getByText('检查桌面。')).toBeTruthy();
    expect(screen.getByText('这一句已经读完。')).toBeTruthy();
    expect(screen.getByText('只打出几个字')).toBeTruthy();
    expect(document.body.textContent).not.toContain('后面内容还没有读');
    expect(document.body.textContent).not.toContain('未读的秘密');
    expect(document.body.textContent).not.toContain('完整摘要');
    expect(document.body.textContent).not.toContain('私有思考');
    expect(document.body.textContent).not.toContain('场景|');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '关闭对话记录' }));
    expect(useGameStore.getState().ui.showHistory).toBe(false);
  });

  it('conservatively hides the latest assistant message in a legacy scene without a source id', () => {
    useGameStore.setState(state => ({ game: { ...state.game, currentScene: { ...currentScene, sourceMessageId: undefined } } }));
    render(<HistoryDrawer />);
    expect(screen.getByText('只打出几个字')).toBeTruthy();
    expect(document.body.textContent).not.toContain('未读的秘密');
  });

  it('never loses read progress when marking a shorter replayed prefix or switching scenes', () => {
    const actions = useGameStore.getState().actions;
    actions.markDialogueSeen(0, '这一句已经读完。');
    actions.markDialogueSeen(1, '只');
    expect(useGameStore.getState().game.dialogueProgress?.text).toBe('只打出几个字');
    actions.setCurrentScene({ id: 'new', lines: [{ speaker: '旁白', text: '新场景' }] });
    expect(useGameStore.getState().game.dialogueProgress).toBeNull();
  });

  it('does not reveal a name whose introduction is still ahead in the current scene', () => {
    useGameStore.setState(state => ({
      game: { ...state.game, currentLineIndex: 0,
        currentScene: { ...currentScene, knowledgeAlreadyCommitted: true, lines: [
          { speaker: '陈慧慧', character: 'chen-huihui-normal.png', text: '欢迎光临。' },
          { speaker: '旁白', text: '你认出她是陈慧慧。', knowledgeEvents: ['meet:chen-huihui'] },
        ] }, dialogueProgress: { sceneId: 'current', lineIndex: 0, text: '欢迎光临。' } },
      tavern: { ...state.tavern, variables: { ...state.tavern.variables, knowledgeEvents: ['meet:chen-huihui'] } },
    }));
    render(<HistoryDrawer />);
    expect(screen.getByText('店员')).toBeTruthy();
    expect(document.body.textContent).not.toContain('陈慧慧');
  });
});
