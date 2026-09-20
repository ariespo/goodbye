// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { PromptInspector } from './PromptInspector';
import { useGameStore } from '../../stores/gameStore';
import type { AppSettings, ChatMessage } from '../../sillytavern/types';

const initialState = useGameStore.getState();
afterEach(() => { cleanup(); useGameStore.setState(initialState, true); });

it('shows the configured summary projection while keeping the complete archive unchanged', () => {
  const settings: AppSettings = {
    api: { baseUrl: 'test', apiKey: '', model: 'test' }, characterName: '文穗', userName: '玩家',
    activePresetId: null, activeLorebookIds: [], uiMode: 'game', customTags: [], typingSpeed: 35,
    fontSize: 'medium', moodIntensity: 1, contextCompressionThresholdTokens: 2000,
  };
  const messages: ChatMessage[] = Array.from({ length: 5 }, (_, i) => ({
    id: `m${i}`, role: 'assistant', timestamp: i, variables: { cycleCount: 1 },
    content: `<maintext>对话|旁白|calm|${'雨'.repeat(800)}</maintext><sum>第${i}段剧情：玩家在公寓查看纸条。</sum>`,
  }));
  useGameStore.setState(state => ({ ui: { ...state.ui, showPromptInspector: true }, tavern: { ...state.tavern,
    settings, variables: { cycleCount: 1 }, activeChatId: 'chat', chats: [{ id: 'chat', name: '检查', messages,
      userName: '玩家', characterName: '文穗', presetId: null, lorebookIds: [], variables: { cycleCount: 1 }, createdAt: 1, updatedAt: 1 }],
  } }));
  render(<PromptInspector />);
  expect(screen.getByText('提示词预览')).toBeInTheDocument();
  expect(screen.getByText(/实际剧情生成会加入导演、写作及审查各阶段的专用内容/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '组装预览' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '历史消息' }));
  expect(screen.getByText(/已用摘要替换 3 段剧情；压缩阈值 2,000 tokens/)).toBeInTheDocument();
  expect(screen.getByText(/历史剧情摘要.*第0段剧情/)).toBeInTheDocument();
  expect(useGameStore.getState().tavern.chats[0].messages).toEqual(messages);
});
