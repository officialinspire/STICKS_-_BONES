import { IMAGE_ASSETS, type ImageAssetId } from './manifest';
import type { ImageAsset, SpriteFrame } from './types';
import { PORTRAIT_URLS, RUNTIME_ASSET_URLS, type RuntimeAssetId, type WarmKey } from './urls';

export { IMAGE_ASSETS, MISSING_ASSETS, ASSET_MANIFEST_VERSION } from './manifest';
export type { ImageAssetId } from './manifest';
export type { RuntimeAssetId, WarmKey, PortraitKey } from './urls';
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

/** URL for anything the warmer can load: a runtime asset or an environment's portrait crop. */
export function urlFor(key: WarmKey): string | null {
  return key in PORTRAIT_URLS ? PORTRAIT_URLS[key as keyof typeof PORTRAIT_URLS] : (RUNTIME_ASSET_URLS[key as RuntimeAssetId] ?? null);
}
