import { describe, expect, it } from 'vitest';
import type { ChatSession } from '../sillytavern/types';
import { recoverNarrativeKnowledge } from './knowledgeRecovery';

function makeChat(content: string): ChatSession {
  return {
    id: 'chat-1',
    name: '测试存档',
    messages: [{ id: 'message-1', role: 'assistant', content, timestamp: 1, variables: {} }],
    characterName: '少女',
    userName: '玩家',
    presetId: null,
    lorebookIds: [],
    variables: { knowledgeEvents: ['know:home', 'know:supermarket'] },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('narrative knowledge recovery', () => {
  it('repairs a Huihui profile already established by a complete archived scene', () => {
    const chat = makeChat(`<maintext>
场景|supermarket-day
对话|店员|calm|欢、欢迎光临……吃、吃吃。
对话|旁白|calm|这是附近便利店的店员陈慧慧。她总是紧张兮兮的，笑得很不自然，看起来有些奇怪。
对话|陈慧慧|calm|今、今天想找什么？
</maintext>`);

    const recovered = recoverNarrativeKnowledge(chat);
    expect(recovered).not.toBe(chat);
    expect(recovered.variables.knowledgeEvents).toContain('meet:chen-huihui');
  });

  it('does not unlock the profile from an incomplete mention', () => {
    const chat = makeChat('<maintext>\n对话|旁白|calm|我想起陈慧慧也在附近。\n</maintext>');
    expect(recoverNarrativeKnowledge(chat)).toBe(chat);
  });
});
