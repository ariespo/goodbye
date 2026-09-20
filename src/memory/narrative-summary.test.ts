import { describe, expect, it } from 'vitest';
import type { ChatMessage, Scene } from '../sillytavern/types';
import { buildNarrativeSummary, formatNarrativeSummary } from './narrative-summary';

const scene: Scene = { id: 'accepted', lines: [
  { speaker: '旁白', text: '你来到学校。' },
  { speaker: '门卫', text: '我没有看见她。' },
] };
const summary = '你来到学校询问门卫。门卫表示没有看见文穗，这不能证明她没有到校；考勤尚未核实。';
const message: ChatMessage = { id: 'turn', role: 'assistant', content: `<sum>${summary}</sum>`, timestamp: 1, variables: {} };

describe('accepted narrative summary', () => {
  it('records deterministic timing, movement and only presented speakers without changing the accepted text', () => {
    const result = buildNarrativeSummary({ text: summary, scene,
      startedAt: new Date('2024-09-09T08:00:00'), endedAt: new Date('2024-09-09T08:25:00'),
      cycleCount: 2, startLocationId: 'home', endLocationId: 'school' });
    expect(result).toMatchObject({ version: 1, text: summary, cycleCount: 2,
      startLocationId: 'home', endLocationId: 'school', participants: ['玩家', '门卫'] });
    const formatted = formatNarrativeSummary({ ...message, narrativeSummary: result });
    expect(formatted).toContain('08:00');
    expect(formatted).toContain('08:25');
    expect(formatted).toContain('第2');
    expect(formatted).toContain('门卫');
    expect(formatted).toContain(summary);
  });

  it('uses a legacy summary with its historical day and never invents a missing summary', () => {
    expect(formatNarrativeSummary({ ...message, variables: { cycleCount: 1 } })).toContain(summary);
    expect(formatNarrativeSummary({ ...message, variables: { cycleCount: 1 } })).toContain('第1');
    expect(formatNarrativeSummary({ ...message, content: '<maintext>正文。</maintext>' })).toBeNull();
  });

  it('rejects stale metadata after the stored summary changes', () => {
    const old = buildNarrativeSummary({ text: '旧摘要', scene,
      startedAt: new Date('2024-09-09T08:00:00'), endedAt: new Date('2024-09-09T08:25:00'),
      cycleCount: 9, startLocationId: 'home', endLocationId: 'school' });
    const formatted = formatNarrativeSummary({ ...message, narrativeSummary: old });
    expect(formatted).toContain(summary);
    expect(formatted).not.toContain('第9');
  });

  it('tolerates incomplete summary metadata from imported saves', () => {
    const malformed = { version: 1, text: summary } as NonNullable<ChatMessage['narrativeSummary']>;
    expect(formatNarrativeSummary({ ...message, narrativeSummary: malformed })).toContain(summary);
  });
});
