import { describe, it, expect } from 'vitest';
import {
  checkScheduledEvents,
  buildScheduledDirectives,
  DEATH_NEWS_TIME,
  nextScheduledBoundary,
  planQuietWait,
} from './scheduled-events';
import type { InvestigationOpportunity } from './investigation-opportunities';

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
    expect(lines[0]).toContain('初步');
    expect(lines[0]).toContain('身份');
    expect(lines[0]).toContain('死亡时刻');
    expect(lines[0]).toContain('必须');
    expect(lines[0]).not.toContain('理智应明显下降');
  });
  it('delivered允许有限跟进、休息和明确等待', () => {
    const lines = buildScheduledDirectives({ deathNews: 'delivered' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('哀痛');
    expect(lines[0]).toContain('有限跟进');
    expect(lines[0]).toContain('休息');
    expect(lines[0]).toContain('明确等待');
    expect(lines[0]).not.toContain('理智持续下滑');
    expect(lines[0]).not.toContain('行动项收窄');
    expect(lines[0]).not.toContain('挽救已经发生的死亡');
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

describe('planQuietWait', () => {
  const timedOpportunity: InvestigationOpportunity = {
    id: 'investigation:c1:F002:atmosphere:school',
    locationId: 'school',
    publicGoal: '向门卫确认文穗今天是否到校',
    scope: 'normal',
    sourceIds: ['fact:F002:atmosphere'],
    topicKey: 'school:attendance',
    availableUntil: '2024-09-09T11:30:00',
  };

  it('compresses an unqualified wait to the next required event', () => {
    expect(planQuietWait({ time: '2024-09-09T10:00:00', variables: {} })).toEqual({
      kind: 'wait',
      requestedMinutes: 360,
      endTime: DEATH_NEWS_TIME,
      boundary: { id: 'death-news', at: DEATH_NEWS_TIME },
      expiringOpportunities: [],
    });
  });

  it('honors a shorter explicit limit without claiming the later boundary', () => {
    expect(planQuietWait({
      time: '2024-09-09T10:00:00',
      variables: {},
      requestedMinutes: 90,
    })).toEqual({
      kind: 'wait',
      requestedMinutes: 90,
      endTime: '2024-09-09T11:30:00',
      expiringOpportunities: [],
    });
  });

  it('returns the due boundary instead of constructing a zero-minute wait action', () => {
    expect(planQuietWait({
      time: DEATH_NEWS_TIME,
      variables: { deathNews: 'pending' },
    })).toEqual({
      kind: 'deliver-boundary',
      requestedMinutes: 0,
      endTime: DEATH_NEWS_TIME,
      boundary: { id: 'death-news', at: DEATH_NEWS_TIME },
      expiringOpportunities: [],
    });
  });

  it('stops at an earlier appointment and discloses only public expiring opportunity data', () => {
    const decision = planQuietWait({
      time: '2024-09-09T10:00:00',
      variables: {},
      commitmentBoundaries: [{ id: 'commitment:school', at: '2024-09-09T12:00:00' }],
      opportunities: [timedOpportunity],
    });

    expect(decision).toEqual({
      kind: 'wait',
      requestedMinutes: 120,
      endTime: '2024-09-09T12:00:00',
      boundary: { id: 'commitment:school', at: '2024-09-09T12:00:00' },
      expiringOpportunities: [{
        id: timedOpportunity.id,
        locationId: 'school',
        publicGoal: timedOpportunity.publicGoal,
        scope: 'normal',
        availableUntil: '2024-09-09T11:30:00',
      }],
    });
    expect(JSON.stringify(decision)).not.toContain('sourceIds');
    expect(JSON.stringify(decision)).not.toContain('topicKey');
  });

  it('rejects a non-positive explicit wait limit', () => {
    expect(() => planQuietWait({
      time: '2024-09-09T10:00:00',
      variables: {},
      requestedMinutes: 0,
    })).toThrow(/positive/i);
  });
});
