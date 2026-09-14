import { describe, expect, it } from 'vitest';
import { resolvePlayerActionIntent, readActionIntentSnapshot } from './player-action-intent';
const time = new Date('2024-09-09T08:00:00');
it.each(['在文穗的中学向门卫追问文穗早晨的具体走向与时间', '向门卫打听文穗走到哪里', '向门卫追问文穗是否前往未知仓库'])('keeps the subject of an inquiry separate from player travel: %s', text => {
  expect(resolvePlayerActionIntent(text, 'school', time)?.steps).toEqual([{ kind: 'inquiry', scope: 'normal', locationId: 'school', targetNpcIds: ['school-guard'] }]);
});
it.each(['我检查眼前能看到的事情，决定接下来去哪里找文穗。', '检查房间，考虑去哪个地方寻找线索', '检查房间，决定去何处调查'])('keeps a contemplated destination from becoming an unresolved journey: %s', text => {
  expect(resolvePlayerActionIntent(text, 'home', time)?.steps.every(step => step.locationId === 'home')).toBe(true);
});
describe('player action intent', () => {
  it('binds the old street choice to Zhou at his building', () => {
    expect(resolvePlayerActionIntent('前往旧街区向周大爷打听清晨动静', 'senpai-building', time)?.steps).toEqual([
      { kind: 'inquiry', scope: 'normal', locationId: 'old-man-building', targetNpcIds: ['old-man'] },
    ]);
  });
  it('leaves unknown explicit destinations unresolved', () => {
    expect(resolvePlayerActionIntent('前往未知仓库调查', 'home', time)).toBeNull();
  });
  it.each(['不去周大爷家，留在原地询问', '给周大爷打电话询问旧街区情况', '询问怎么去周大爷家'])('does not teleport: %s', text => {
    expect(resolvePlayerActionIntent(text, 'home', time)?.steps.every(step => step.locationId === 'home')).toBe(true);
  });
  it('rejects altered or privileged snapshot fields', () => {
    const value = { version: 1, originalInput: '调查房间', startLocationId: 'home', steps: [{ kind: 'investigation', scope: 'normal', locationId: 'home', requestedMinutes: 1 }] };
    expect(readActionIntentSnapshot(value)).toBeNull();
    expect(readActionIntentSnapshot({ ...value, steps: [{ kind: 'investigation', scope: 'normal', locationId: 'missing' }] })).toBeNull();
  });
});

it.each(['在这里休息一会儿', '先在这里稍作休息', '在商住楼休息'])('recognizes affirmative rest without inventing travel: %s', text => {
  expect(resolvePlayerActionIntent(text, 'senpai-building', time)?.steps).toEqual([{ kind: 'rest', scope: 'normal', locationId: 'senpai-building' }]);
});
it.each(['不休息，继续询问', '询问能否休息'])('does not mistake mentioned rest for attempted rest: %s', text => {
  expect(resolvePlayerActionIntent(text, 'home', time)?.steps[0].kind).toBe('inquiry');
});

it('validates JSON bindings independently of property insertion order', () => {
  const snapshot = resolvePlayerActionIntent('调查房间', 'home', time)!;
  expect(readActionIntentSnapshot({ ...snapshot, steps: [{ locationId: 'home', scope: 'normal', kind: 'investigation' }] })).toEqual(snapshot);
});
it('does not hide an unknown journey behind another named destination', () => {
  expect(resolvePlayerActionIntent('前往未知仓库，去学校调查', 'home', time)).toBeNull();
});
it('keeps conversation work after a recognized journey', () => {
  expect(resolvePlayerActionIntent('前往商住楼向灯织同步目前进展', 'home', time)?.steps[0].kind).toBe('inquiry');
});

it.each(['前往冷清的社区便利店询问陈慧慧', '前往我昨天经过的社区便利店询问陈慧慧'])('resolves a public destination within its affirmative descriptive travel phrase: %s', text => {
  expect(resolvePlayerActionIntent(text, 'school', time)?.steps[0].locationId).toBe('supermarket');
});
it.each(['离开学校前往未知地方调查', '前往学校附近的未知仓库调查', '打电话询问怎么前往冷清的社区便利店'])('does not use an origin or directions question as a destination: %s', text => {
  const snapshot = resolvePlayerActionIntent(text, 'home', time);
  expect(snapshot === null || snapshot.steps.every(step => step.locationId === 'home')).toBe(true);
});

it.each(['调查文穗去向', '查看过去的记录'])('does not treat lexical motion words as travel: %s', text => {
  expect(resolvePlayerActionIntent(text, 'home', time)?.steps[0].locationId).toBe('home');
});

it.each(['前往医院查看休息室', '查看休息时间'])('does not grant rest from an investigation object: %s', text => {
  expect(resolvePlayerActionIntent(text, 'home', time)?.steps[0].kind).toBe('investigation');
});

it.each(['回家', '前往周大爷住处'])('prices a plain recognized journey without invented inquiry: %s', text => {
  expect(resolvePlayerActionIntent(text, 'senpai-building', time)?.steps[0].kind).toBe('travel');
});

it('keeps inquiry work before a declared journey after finishing the inquiry', () => {
  expect(resolvePlayerActionIntent('打听完情况后前往学校', 'home', time)?.steps).toEqual([
    { kind: 'inquiry', scope: 'normal', locationId: 'home' },
    { kind: 'travel', scope: 'normal', locationId: 'school' },
  ]);
});
it('rejects an unresolved journey after finishing an inquiry', () => {
  expect(resolvePlayerActionIntent('打听完情况后前往未知仓库', 'home', time)).toBeNull();
});
it.each([
  '在文穗的中学向门卫追问文穗早晨的具体走向与时间',
  '追问文穗打听完情况后前往学校的原因',
  '询问“打听完情况后前往学校”是什么意思',
])('keeps inquiry object movement separate from player movement: %s', text => {
  expect(resolvePlayerActionIntent(text, 'home', time)?.steps.every(step => step.locationId === 'home')).toBe(true);
});

it('does not split an inquiry quotation at its internal punctuation', () => {
  const input = '询问“你说，打听完情况后前往学校”是什么意思';
  expect(resolvePlayerActionIntent(input, 'home', time)?.steps.every(step => step.locationId === 'home')).toBe(true);
});
