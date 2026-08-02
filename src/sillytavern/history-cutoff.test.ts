import { describe, expect, it } from 'vitest';
import type { ChatMessage } from './types';
import { excludeCurrentInputFromHistory } from './history-cutoff';

function message(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${content}`,
    role,
    content,
    timestamp: 1,
    variables: {},
  };
}

describe('excludeCurrentInputFromHistory', () => {
  it('剔除已持久化在末尾的当前输入', () => {
    const history = [
      message('assistant', '上一回合'),
      message('user', '调查雨衣'),
    ];
    expect(excludeCurrentInputFromHistory(history, '调查雨衣'))
      .toEqual([history[0]]);
  });

  it('不删除不同内容或非 user 的历史消息', () => {
    const history = [
      message('user', '旧输入'),
      message('assistant', '当前回复'),
    ];
    expect(excludeCurrentInputFromHistory(history, '新输入')).toBe(history);
  });
});
