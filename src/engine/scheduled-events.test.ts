import { describe, it, expect } from 'vitest';
import {
  checkScheduledEvents,
  buildScheduledDirectives,
  DEATH_NEWS_TIME,
  nextScheduledBoundary,
} from './scheduled-events';

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

describe('nextScheduledBoundary', () => {
  it('returns death news before midnight when it has not been delivered', () => {
    expect(nextScheduledBoundary('2024-09-09T15:30:00', {})).toEqual({
      id: 'death-news', at: '2024-09-09T16:00:00',
    });
  });

  it('returns the current clock for death news that is already pending or overdue', () => {
    expect(nextScheduledBoundary('2024-09-09T16:10:00', { deathNews: 'pending' })).toEqual({
      id: 'death-news', at: '2024-09-09T16:10:00',
    });
    expect(nextScheduledBoundary('2024-09-09T16:10:00', {})).toEqual({
      id: 'death-news', at: '2024-09-09T16:10:00',
    });
  });

  it('uses midnight after death news has been delivered', () => {
    expect(nextScheduledBoundary('2024-09-09T20:00:00', { deathNews: 'delivered' })).toEqual({
      id: 'midnight', at: '2024-09-10T00:00:00',
    });
  });

  it('returns midnight at the current clock when reset is already due', () => {
    expect(nextScheduledBoundary('2024-09-10T00:00:00', { deathNews: 'delivered' })).toEqual({
      id: 'midnight', at: '2024-09-10T00:00:00',
    });
  });

  it('accepts validated commitment boundaries without importing memory internals', () => {
    expect(nextScheduledBoundary('2024-09-09T10:00:00', {}, [
      { id: 'commitment:noon', at: '2024-09-09T12:00:00' },
      { id: 'commitment:late', at: '2024-09-09T18:00:00' },
    ])).toEqual({ id: 'commitment:noon', at: '2024-09-09T12:00:00' });
  });

  it('normalizes an overdue commitment to now and resolves ties deterministically', () => {
    expect(nextScheduledBoundary('2024-09-09T16:00:00', {}, [
      { id: 'commitment:overdue', at: '2024-09-09T15:00:00' },
      { id: 'commitment:exact', at: '2024-09-09T16:00:00' },
    ])).toEqual({ id: 'death-news', at: '2024-09-09T16:00:00' });
  });

  it('rejects malformed clocks instead of allowing work past an unknown boundary', () => {
    expect(() => nextScheduledBoundary('not-a-time', {})).toThrow(/clock/i);
    expect(() => nextScheduledBoundary('2024-09-09T10:00:00', {}, [
      { id: 'commitment:bad', at: 'not-a-time' },
    ])).toThrow(/clock/i);
  });
});
