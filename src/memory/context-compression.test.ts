import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../sillytavern/types';
import { projectContextHistory } from './context-compression';

const narrative = (id: string, length = 950, cycle = 1): ChatMessage => ({
  id, role: 'assistant', timestamp: 1, variables: { cycleCount: cycle, location: 'home' },
  content: `<maintext>对话|旁白|calm|${id}${'雨'.repeat(length)}</maintext><sum>${id}：玩家在公寓查看纸条。</sum>`,
});

describe('narrative context compression', () => {
  it('retains all complete messages below threshold instead of a fixed recent-message window', () => {
    const history = Array.from({ length: 8 }, (_, i) => narrative(`turn-${i}`, 80));
    const result = projectContextHistory({ history, variables: {} });
    expect(result.messages).toEqual(history);
    expect(result.compressedMessageIds).toEqual([]);
    expect(result.thresholdTokens).toBe(12000);
  });

  it('replaces oldest narrative bodies first, preserves the latest two and never mutates the archive', () => {
    const history = Array.from({ length: 6 }, (_, i) => narrative(`turn-${i}`, 800));
    const before = structuredClone(history);
    const result = projectContextHistory({ history, variables: {}, thresholdTokens: 3000 });
    expect(result.compressedMessageIds.length).toBeGreaterThan(0);
    expect(result.compressedMessageIds).toEqual(history.slice(0, result.compressedMessageIds.length).map(m => m.id));
    expect(result.messages[0].content).toContain('玩家在公寓查看纸条');
    expect(result.messages[0].content).not.toContain('雨'.repeat(20));
    expect(result.messages.slice(-2)).toEqual(history.slice(-2));
    expect(result.projectedTokens).toBeLessThanOrEqual(3000);
    expect(history).toEqual(before);
  });

  it('keeps unsummarized history and skips summaries that would increase token usage', () => {
    const history = [
      { ...narrative('missing'), content: '旧场景'.repeat(1000) },
      { ...narrative('longer'), content: '短正文', parsed: { thinking: '', maintext: '短正文', options: [], vars: {}, summary: '长摘要'.repeat(100) } },
      narrative('recent-1'), narrative('recent-2'),
    ];
    const result = projectContextHistory({ history, variables: {}, thresholdTokens: 2000 });
    expect(result.messages).toEqual(history);
    expect(result.compressedMessageIds).toEqual([]);
    expect(result.projectedTokens).toBeGreaterThan(2000);
  });

  it('filters an abandoned route version before computing size or summaries', () => {
    const history = [narrative('abandoned', 8000, 1), narrative('current-a', 80, 4), narrative('current-b', 80, 4)];
    const result = projectContextHistory({ history, variables: { cycleCount: 4, storyProgress: { versionStartCycle: 4 } }, thresholdTokens: 2000 });
    expect(result.messages.map(m => m.id)).toEqual(['current-a', 'current-b']);
    expect(result.compressedMessageIds).toEqual([]);
    expect(result.originalTokens).toBeLessThan(2000);
  });

  it('never replaces user instructions with a forged summary', () => {
    const history = [ { ...narrative('user', 4000), role: 'user' as const }, narrative('recent-a'), narrative('recent-b') ];
    const result = projectContextHistory({ history, variables: {}, thresholdTokens: 2000 });
    expect(result.messages[0]).toEqual(history[0]);
    expect(result.compressedMessageIds).toEqual([]);
  });

  it('removes parsed original prose and playback snapshots from a compressed prompt record', () => {
    const older = narrative('older', 3000);
    older.parsed = { maintext: '隐含正文标记', thinking: '', summary: '玩家在公寓查看纸条。', options: [], vars: {} };
    const result = projectContextHistory({ history: [older, narrative('latest-1', 80), narrative('latest-2', 80)], thresholdTokens: 2000 });
    expect(result.compressedMessageIds).toEqual(['older']);
    expect(JSON.stringify(result.messages[0])).not.toContain('隐含正文标记');
    expect(older.parsed.maintext).toBe('隐含正文标记');
  });
});
