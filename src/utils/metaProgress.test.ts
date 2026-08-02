import { describe, expect, it } from 'vitest';
import {
  loadMetaProgress,
  mergeMetaProgress,
  recordEndingProgress,
  saveMetaProgress,
} from './metaProgress';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('persistent meta progress', () => {
  it('跨结局累积且不会被后一次较旧状态覆盖', () => {
    const storage = memoryStorage();
    recordEndingProgress('A-1', { lockedRoute: 'A', routesLockedEver: ['A'] }, storage);
    recordEndingProgress('B-1', { lockedRoute: 'B', routesLockedEver: ['B'] }, storage);

    expect(loadMetaProgress(storage).endingsSeen).toEqual(['A-1', 'B-1']);
    expect(loadMetaProgress(storage).routesLockedEver).toEqual(['A', 'B']);
  });

  it('STAY 永久记录曾经留下的元进度', () => {
    const storage = memoryStorage();
    recordEndingProgress('STAY', { routesLockedEver: ['A'] }, storage);
    expect(loadMetaProgress(storage).stayedEver).toBe(true);
  });

  it('新游戏和旧存档合并全局进度而不降低它', () => {
    const storage = memoryStorage();
    saveMetaProgress({
      endingsSeen: ['A-1', 'B-1', 'C-1'],
      routesLockedEver: ['A', 'B', 'C'],
      stayedEver: true,
    }, storage);
    const merged = mergeMetaProgress(
      { routesLockedEver: ['FAKE'], stayedEver: false },
      ['F-1'],
      loadMetaProgress(storage),
    );

    expect(merged.endingsSeen).toEqual(['F-1', 'A-1', 'B-1', 'C-1']);
    expect(merged.variables.routesLockedEver).toEqual(['FAKE', 'A', 'B', 'C']);
    expect(merged.variables.stayedEver).toBe(true);
  });
});
