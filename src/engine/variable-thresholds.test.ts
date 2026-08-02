import { describe, expect, it } from 'vitest';
import { getSanityConstraint, translateForDirector, translateForWriter } from './variable-thresholds';

describe('sanity 分档', () => {
  it.each([
    [100, 4, 0, '正常'],
    [79, 4, 0, '正常'],
    [70, 4, 0, '正常'],
    [69, 4, 1, '下滑'],
    [40, 4, 1, '下滑'],
    [39, 3, 1, '濒危'],
    [20, 3, 1, '濒危'],
    [19, 3, 1, '崩溃'],
    [0, 3, 1, '崩溃'],
  ])('sanity=%i → %i 选项 %i 异常', (sanity, optionCount, anomalyOptionCount, keyword) => {
    const vars = { sanity };
    expect(getSanityConstraint(vars)).toEqual({ optionCount, anomalyOptionCount });
    expect(translateForWriter(vars)).toContain(keyword);
    expect(translateForDirector(vars)).toContain(keyword);
  });

  it('缺失变量按默认值 sanity=80 落正常档', () => {
    expect(getSanityConstraint({})).toEqual({ optionCount: 4, anomalyOptionCount: 0 });
    expect(translateForWriter({})).toContain('理智正常');
  });
});

describe('affinity 分档（写手侧）', () => {
  it.each([
    [80, '温情'],
    [79, '中性'],
    [40, '中性'],
    [39, '冷淡'],
  ])('fumi=%i → %s', (value, keyword) => {
    expect(translateForWriter({ affinity: { fumi: value } })).toContain(keyword);
  });

  it.each([
    [80, '问题可能不在外面'],
    [79, '她在躲什么人'],
    [40, '她在躲什么人'],
    [39, '表面客套'],
  ])('touko=%i → 含 %s', (value, keyword) => {
    expect(translateForWriter({ affinity: { touko: value } })).toContain(keyword);
  });

  it('缺失时用默认值 fumi=70 中性、touko=40 中档', () => {
    const text = translateForWriter({});
    expect(text).toContain('中性');
    expect(text).toContain('她在躲什么人');
  });
});

describe('suspicion 汇总（导演侧）', () => {
  it('全部低于 26 → 尚无重点怀疑对象', () => {
    expect(translateForDirector({ suspicion: { 'old-man': 10, self: 10 } })).toContain('尚无重点怀疑对象');
  });

  it('单个达到 26 → 点名重点怀疑对象', () => {
    const text = translateForDirector({ suspicion: { 'old-man': 26, clerk: 5 } });
    expect(text).toContain('old-man 是重点怀疑对象');
    expect(text).not.toContain('clerk');
  });

  it('达到 50 → 锁线门槛文案', () => {
    expect(translateForDirector({ suspicion: { 'detective-a': 50 } })).toContain('已达锁线门槛');
  });

  it('混合时只报告过阈值者，按嫌疑值降序', () => {
    const text = translateForDirector({ suspicion: { 'old-man': 30, teacher: 45, clerk: 0 } });
    expect(text.indexOf('teacher')).toBeLessThan(text.indexOf('old-man'));
    expect(text).not.toContain('clerk');
  });
});

describe('investigation 分层（导演侧）', () => {
  it('全 0 不输出调查进度', () => {
    expect(translateForDirector({ investigation: { psych: 0, crime: 0 } })).not.toContain('调查进度');
  });

  it.each([
    [30, '复盘视角'],
    [60, '笔记本深层内容'],
    [100, '完整动机'],
  ])('单方向 %i → %s', (value, keyword) => {
    expect(translateForDirector({ investigation: { crime: value } })).toContain(keyword);
  });

  it('四方向独立判断', () => {
    const text = translateForDirector({ investigation: { psych: 30, crime: 60, occult: 100, science: 0 } });
    expect(text).toContain('心理侧写');
    expect(text).toContain('刑侦推理');
    expect(text).toContain('神秘学');
    expect(text).not.toContain('科学取证');
  });
});

describe('两侧不重复', () => {
  const vars = { sanity: 35, suspicion: { 'old-man': 30 }, investigation: { crime: 60 } };

  it('writer 不含选项/嫌疑/调查文案', () => {
    const text = translateForWriter(vars);
    expect(text).not.toContain('选项');
    expect(text).not.toContain('嫌疑');
    expect(text).not.toContain('调查进度');
  });

  it('director 不含叙事质感与好感文案', () => {
    const text = translateForDirector(vars);
    expect(text).not.toContain('意识流');
    expect(text).not.toContain('文穂');
    expect(text).not.toContain('灯织');
  });
});
