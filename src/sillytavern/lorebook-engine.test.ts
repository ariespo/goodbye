import { describe, it, expect } from 'vitest';
import { createLorebookEngine } from './lorebook-engine';
import type { Lorebook, LorebookEntry } from './types';

function makeEntry(partial: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    id: crypto.randomUUID(),
    keys: ['少女', '女孩'],
    secondaryKeys: [],
    content: '少女是一个神秘的角色。',
    comment: '角色设定',
    enabled: true,
    order: 100,
    position: 'after_char',
    selective: false,
    selectiveLogic: 'and_any',
    constant: false,
    probability: 100,
    useProbability: false,
    addMemo: false,
    ...partial,
  };
}

function makeBook(entries: LorebookEntry[]): Lorebook {
  return {
    id: 'test-book',
    name: '测试世界书',
    entries,
    recursiveScanning: false,
    caseSensitive: false,
    matchWholeWords: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('LorebookEngine', () => {
  it('matches by primary keyword', () => {
    const engine = createLorebookEngine(makeBook([makeEntry()]));
    const matches = engine.scan('少女走进了房间');
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedKeywords).toContain('少女');
  });

  it('skips disabled entries', () => {
    const engine = createLorebookEngine(makeBook([makeEntry({ enabled: false })]));
    const matches = engine.scan('少女走进了房间');
    expect(matches).toHaveLength(0);
  });

  it('activates constant entries without keywords', () => {
    const engine = createLorebookEngine(makeBook([makeEntry({ keys: [], constant: true })]));
    const matches = engine.scan('完全无关的文本');
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedKeywords).toEqual(['constant']);
  });

  it('formatEntriesContent joins by blank line', () => {
    const engine = createLorebookEngine(makeBook([
      makeEntry({ content: 'A' }),
      makeEntry({ content: 'B' }),
    ]));
    const matches = engine.scan('少女');
    expect(engine.formatEntriesContent(matches)).toContain('A');
    expect(engine.formatEntriesContent(matches)).toContain('B');
  });
});
