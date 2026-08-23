// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAssetManifest,
  initializeAssetManifest,
  preloadImages,
  resetAssetManagerForTests,
  resolveManagedAssetUrl,
} from './assetManager';

describe('asset manager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetAssetManagerForTests();
  });

  it('loads the generated manifest and adds the content hash to logical asset URLs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: 'manifest-v1',
        generatedAt: '2026-08-24T00:00:00.000Z',
        assets: {
          'assets/backgrounds/home.png': { hash: 'abc123', bytes: 42, kind: 'background' },
        },
      }),
    }));

    await initializeAssetManifest();

    expect(getAssetManifest()?.version).toBe('manifest-v1');
    expect(resolveManagedAssetUrl('assets/backgrounds/home.png')).toBe('/assets/backgrounds/home.png?h=abc123');
    expect(resolveManagedAssetUrl('assets/backgrounds/home.png?v=manual')).toBe('/assets/backgrounds/home.png?v=manual&h=abc123');
    expect(resolveManagedAssetUrl('https://cdn.test/home.png')).toBe('https://cdn.test/home.png');
  });

  it('deduplicates image loads and reports progress after decode', async () => {
    let constructed = 0;
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        constructed += 1;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', MockImage);
    const progress: number[] = [];

    const result = await preloadImages(['/one.png', '/one.png'], value => progress.push(value.completed));

    expect(constructed).toBe(1);
    expect(result).toEqual({ completed: 1, total: 1, failed: 0 });
    expect(progress).toEqual([0, 1]);
  });
});
