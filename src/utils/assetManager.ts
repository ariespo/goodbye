export type AssetKind = 'background' | 'character' | 'audio' | 'video' | 'ending' | string;

export interface AssetManifestEntry {
  hash: string;
  bytes: number;
  kind: AssetKind;
}

export interface AssetManifest {
  version: string;
  generatedAt: string;
  assets: Record<string, AssetManifestEntry>;
}

export interface AssetLoadProgress {
  completed: number;
  total: number;
  failed: number;
}

const MAX_CONCURRENT_LOADS = 6;
const IMAGE_LOAD_TIMEOUT_MS = 30_000;
let manifest: AssetManifest | null = null;
let activeLoads = 0;
const queue: Array<() => void> = [];
const imageRequests = new Map<string, Promise<void>>();
const loadedImages = new Set<string>();

function baseUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const cleanPath = path.replace(/^\/+/, '');
  return `${base}${base.endsWith('/') ? '' : '/'}${cleanPath}`;
}

function normalizedAssetKey(path: string): string {
  const withoutOrigin = path.replace(/^https?:\/\/[^/]+/i, '');
  const base = import.meta.env.BASE_URL.replace(/^\/+|\/+$/g, '');
  const withoutBase = base && withoutOrigin.replace(/^\/+/, '').startsWith(`${base}/`)
    ? withoutOrigin.replace(/^\/+/, '').slice(base.length + 1)
    : withoutOrigin.replace(/^\/+/, '');
  return withoutBase.split(/[?#]/, 1)[0] ?? withoutBase;
}

export async function initializeAssetManifest(): Promise<AssetManifest | null> {
  try {
    const response = await fetch(baseUrl('asset-manifest.json'), { cache: 'no-store' });
    if (!response.ok) return null;
    const value = await response.json() as AssetManifest;
    if (!value || typeof value.version !== 'string' || !value.assets || typeof value.assets !== 'object') return null;
    manifest = value;
    return value;
  } catch {
    // Development and tests remain usable before the manifest has been generated.
    return null;
  }
}

export function resolveManagedAssetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const resolved = baseUrl(path);
  const entry = manifest?.assets[normalizedAssetKey(path)];
  if (!entry) return resolved;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}h=${entry.hash}`;
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      activeLoads += 1;
      task().then(resolve, reject).finally(() => {
        activeLoads -= 1;
        queue.shift()?.();
      });
    };
    if (activeLoads < MAX_CONCURRENT_LOADS) start();
    else queue.push(start);
  });
}

export function preloadImage(url: string): Promise<void> {
  if (!url || typeof Image === 'undefined' || loadedImages.has(url)) return Promise.resolve();
  const existing = imageRequests.get(url);
  if (existing) return existing;

  const request = schedule(() => new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error(`资源加载超时：${url}`)), IMAGE_LOAD_TIMEOUT_MS);
    const settle = (callback: () => void) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    image.onerror = () => settle(() => reject(new Error(`资源加载失败：${url}`)));
    image.onload = () => {
      const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
      decoded.catch(() => undefined).finally(() => settle(() => {
        loadedImages.add(url);
        resolve();
      }));
    };
    image.src = url;
  })).finally(() => imageRequests.delete(url));

  imageRequests.set(url, request);
  return request;
}

export async function preloadImages(
  urls: Iterable<string>,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<AssetLoadProgress> {
  const unique = [...new Set([...urls].filter(Boolean))];
  const progress: AssetLoadProgress = { completed: 0, total: unique.length, failed: 0 };
  onProgress?.({ ...progress });
  await Promise.all(unique.map(url => preloadImage(url).catch(() => {
    progress.failed += 1;
  }).finally(() => {
    progress.completed += 1;
    onProgress?.({ ...progress });
  })));
  return progress;
}

export function prefetchImages(urls: Iterable<string>): void {
  void preloadImages(urls);
}

export function getAssetManifest(): AssetManifest | null {
  return manifest;
}

export function resetAssetManagerForTests(): void {
  manifest = null;
  imageRequests.clear();
  loadedImages.clear();
  activeLoads = 0;
  queue.length = 0;
}
