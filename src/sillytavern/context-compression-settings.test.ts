import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getSettings, initializeDatabase, saveSettings } from './database';
import { normalizeContextCompressionThreshold } from './types';

describe('context compression settings', () => {
  beforeAll(async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await initializeDatabase();
    warn.mockRestore();
  });

  beforeEach(async () => { await db.settings.clear(); });

  it.each([
    [undefined, 12000], [null, 12000], [NaN, 12000], [Infinity, 12000],
    ['8000', 12000], [1500, 2000], [2000, 2000], [12345.9, 12345], [100000, 100000], [100001, 100000],
  ])('normalizes imported or runtime value %s to %s', (value, expected) => {
    expect(normalizeContextCompressionThreshold(value)).toBe(expected);
  });

  it('supplies a default for older settings while preserving their existing configuration', async () => {
    const defaults = (await getSettings())!;
    const legacy = { ...defaults, id: 1, userName: '旧存档玩家' };
    delete legacy.contextCompressionThresholdTokens;
    await db.settings.put(legacy);
    expect(await getSettings()).toMatchObject({ userName: '旧存档玩家', contextCompressionThresholdTokens: 12000 });
  });

  it('normalizes an invalid persisted budget on read and clamps saves before persistence', async () => {
    const defaults = (await getSettings())!;
    await db.settings.put({ ...defaults, id: 1, contextCompressionThresholdTokens: NaN });
    expect((await getSettings())?.contextCompressionThresholdTokens).toBe(12000);
    await saveSettings({ ...defaults, id: 1, contextCompressionThresholdTokens: 100001 });
    expect((await db.settings.toArray())[0].contextCompressionThresholdTokens).toBe(100000);
  });
});
