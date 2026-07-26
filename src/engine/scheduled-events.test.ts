import { describe, it, expect } from 'vitest';
import { checkScheduledEvents, buildScheduledDirectives, DEATH_NEWS_TIME } from './scheduled-events';

describe('checkScheduledEvents', () => {
  it('跨过16点触发死讯pending', () => {
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', {}))
      .toEqual({ deathNews: 'pending' });
  });
  it('未跨过不触发', () => {
    expect(checkScheduledEvents('2024-09-09T10:00:00', '2024-09-09T11:00:00', {})).toEqual({});
  });
  it('已置位不重复触发', () => {
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', { deathNews: 'delivered' }))
      .toEqual({});
    expect(checkScheduledEvents('2024-09-09T15:30:00', '2024-09-09T16:20:00', { deathNews: 'pending' }))
      .toEqual({});
  });
  it('新轮次变量已清除后可再次触发', () => {
    // settleCycleVariables 不继承 deathNews，等价于 {} 场景
    expect(checkScheduledEvents('2024-09-09T15:59:00', DEATH_NEWS_TIME, {}))
      .toEqual({ deathNews: 'pending' });
  });
});

describe('buildScheduledDirectives', () => {
  it('pending返回死讯指令', () => {
    const lines = buildScheduledDirectives({ deathNews: 'pending' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('死讯');
    expect(lines[0]).toContain('必须');
  });
  it('delivered返回崩溃段指令', () => {
    const lines = buildScheduledDirectives({ deathNews: 'delivered' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('崩溃');
  });
  it('未置位返回空数组', () => {
    expect(buildScheduledDirectives({})).toEqual([]);
  });
});
