import { IMAGE_ASSETS, type ImageAssetId } from './manifest';
import type { ImageAsset, SpriteFrame } from './types';
import { RUNTIME_ASSET_URLS, type RuntimeAssetId } from './urls';

export { IMAGE_ASSETS, MISSING_ASSETS, ASSET_MANIFEST_VERSION } from './manifest';
export type { ImageAssetId } from './manifest';
export type { RuntimeAssetId } from './urls';
export * from './types';

export function getAsset(id: ImageAssetId): ImageAsset {
  const asset = IMAGE_ASSETS.find((a) => a.id === id);
  if (!asset) throw new Error(`Unknown asset ${id}`);
  return asset;
}

export function getFrame(id: ImageAssetId, frameId: string): SpriteFrame {
  const frame = getAsset(id).frames?.find((f) => f.id === frameId);
  if (!frame) throw new Error(`Unknown frame ${id}/${frameId}`);
  return frame;
}

/** URL for a bundled runtime asset, or null if not bundled (caller must fall back). */
export function assetUrl(id: RuntimeAssetId): string | null {
  return RUNTIME_ASSET_URLS[id] ?? null;
}
