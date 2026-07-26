import { describe, it, expect } from 'vitest';
import { parseTimeCost, clampTimeCost, advanceClock, laterTime, crossesThreshold } from './game-clock';

describe('parseTimeCost', () => {
  it('解析分钟', () => expect(parseTimeCost('5分钟')).toBe(5));
  it('解析小时', () => expect(parseTimeCost('2小时')).toBe(120));
  it('解析小时+分钟', () => expect(parseTimeCost('1小时30分钟')).toBe(90));
  it('容忍空格', () => expect(parseTimeCost('30 分钟')).toBe(30));
  it('无法解析返回0', () => expect(parseTimeCost('片刻')).toBe(0));
  it('空值返回0', () => expect(parseTimeCost(undefined)).toBe(0));
});

describe('clampTimeCost', () => {
  it('正常值取整', () => expect(clampTimeCost(15.7)).toBe(16));
  it('下限1', () => expect(clampTimeCost(0)).toBe(1));
  it('上限180', () => expect(clampTimeCost(999)).toBe(180));
  it('NaN返回默认10', () => expect(clampTimeCost(NaN)).toBe(10));
});

describe('advanceClock', () => {
  it('推进分钟', () => expect(advanceClock('2024-09-09T07:30:00', 45)).toBe('2024-09-09T08:15:00'));
  it('跨日', () => expect(advanceClock('2024-09-09T23:50:00', 20)).toBe('2024-09-10T00:10:00'));
  it('非法时间视为开局时刻', () => expect(advanceClock('garbage', 30)).toBe('2024-09-09T08:00:00'));
});

describe('laterTime', () => {
  it('返回较晚者', () => expect(laterTime('2024-09-09T08:00:00', '2024-09-09T11:00:00')).toBe('2024-09-09T11:00:00'));
  it('时钟只进不退', () => expect(laterTime('2024-09-09T12:00:00', '2024-09-09T09:00:00')).toBe('2024-09-09T12:00:00'));
  it('一方非法返回另一方', () => expect(laterTime('garbage', '2024-09-09T09:00:00')).toBe('2024-09-09T09:00:00'));
});

describe('crossesThreshold', () => {
  const T16 = '2024-09-09T16:00:00';
  it('跨过16点', () => expect(crossesThreshold('2024-09-09T15:50:00', '2024-09-09T16:10:00', T16)).toBe(true));
  it('恰好落在阈值', () => expect(crossesThreshold('2024-09-09T15:50:00', T16, T16)).toBe(true));
  it('未到不触发', () => expect(crossesThreshold('2024-09-09T14:00:00', '2024-09-09T15:00:00', T16)).toBe(false));
  it('早已过了不重复触发', () => expect(crossesThreshold('2024-09-09T16:30:00', '2024-09-09T17:00:00', T16)).toBe(false));
});
