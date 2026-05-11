import { describe, it, expect } from 'vitest';
import { scanLorebooks, buildLorebookPrompt } from './lorebook-engine';
import type { Lorebook } from './types';

describe('lorebook-engine', () => {
  const mockLorebook: Lorebook = {
    id: 'test-book',
    name: '测试世界书',
    entries: [
      {
        uid: 1,
        key: ['少女', '女孩'],
        keysecondary: [],
        comment: '角色设定',
        content: '少女是一个神秘的角色。',
        position: 0,
        order: 100,
        enabled: true,
        constant: false,
        selective: false,
        selectiveLogic: 0,
        addMemo: false,
        displayIndex: 0,
        excludeRecursion: false,
        preventRecursion: false,
        delay: 0,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('should match keywords in text', () => {
    const matches = scanLorebooks([mockLorebook], ['test-book'], '少女走进了房间');
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedKeys).toContain('少女');
  });

  it('should not match disabled entries', () => {
    const disabled = { ...mockLorebook, entries: [{ ...mockLorebook.entries[0], enabled: false }] };
    const matches = scanLorebooks([disabled], ['test-book'], '少女走进了房间');
    expect(matches).toHaveLength(0);
  });

  it('should build lorebook prompt', () => {
    const matches = scanLorebooks([mockLorebook], ['test-book'], '少女');
    const prompt = buildLorebookPrompt(matches);
    expect(prompt).toContain('角色设定');
    expect(prompt).toContain('少女是一个神秘的角色');
  });
});
