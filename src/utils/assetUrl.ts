import { resolveManagedAssetUrl } from './assetManager';

export function assetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return resolveManagedAssetUrl(path);
}
