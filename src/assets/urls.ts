/**
 * Runtime URL registry. Only assets with status "runtime" in the manifest are
 * listed, so Vite bundles exactly these files. Each `new URL(literal,
 * import.meta.url)` is rewritten by Vite to a hashed, base-relative URL, which
 * keeps GitHub Pages subpath hosting working.
 *
 * The runtime files are WebP derivatives (assets/generated/web/, built by
 * `npm run assets:derive`) with the SAME pixel dimensions as the preserved
 * originals, so every frame rectangle in the manifest applies unchanged.
 * `npm run assets:verify` fails if this list, the manifest and
 * src/assets/derivatives.json disagree.
 */
import type { ImageAssetId } from './manifest';

export const RUNTIME_ASSET_URLS = {
  'cousin.atlas.portrait': new URL('../../assets/generated/web/cousin-portrait-atlas.webp', import.meta.url).href,
  // Optional presentation art: loaded only when an animation/effect first needs it (or by the idle warm-up).
  'cousin.anim.slam': new URL('../../assets/generated/web/cousin-slam-strip.webp', import.meta.url).href,
  'fx.sheet': new URL('../../assets/generated/web/effects-sheet.webp', import.meta.url).href,
  'tile.atlas': new URL('../../assets/generated/web/double-six-atlas.webp', import.meta.url).href,
  'table.weathered': new URL('../../assets/generated/web/weathered-tabletop.webp', import.meta.url).href,
  'env.neighborhood-patio': new URL('../../assets/generated/web/neighborhood-patio.webp', import.meta.url).href,
  // Story only (Prologue dream); warmed when the Story screen opens, never at startup.
  'env.cave-waterfall': new URL('../../assets/generated/web/cave-waterfall.webp', import.meta.url).href,
  // Story chapter backdrops: warmed only when their scene is next (src/story/staging.ts).
  'env.back-alley': new URL('../../assets/generated/web/back-alley.webp', import.meta.url).href,
  'env.moonlit-promenade': new URL('../../assets/generated/web/moonlit-promenade.webp', import.meta.url).href,
  'env.jungle-camp': new URL('../../assets/generated/web/jungle-camp.webp', import.meta.url).href,
  'env.executive-terrace': new URL('../../assets/generated/web/executive-terrace.webp', import.meta.url).href,
  // Chapter 6 after the cave: the modern rest area at the entrance (its post-cave dialogue and its hand).
  'env.rest-area': new URL('../../assets/generated/web/rest-area.webp', import.meta.url).href,
  // Evidence inspection cards: the blank card behind the code-rendered excerpt text (Case file → Evidence).
  'prop.evidence-card': new URL('../../assets/generated/web/evidence-card.webp', import.meta.url).href,
  // Story cast portraits: REPACKED derivatives (src/assets/cast.json — cleaned edges, uniform baseline-aligned
  // cells), so their frame rects come from cast.json, not the source manifest. Loaded per scene, never at startup.
  'cast.vale.atlas': new URL('../../assets/generated/web/cast-vale.webp', import.meta.url).href,
  'cast.luz.atlas': new URL('../../assets/generated/web/cast-luz.webp', import.meta.url).href,
  'cast.marisol.atlas': new URL('../../assets/generated/web/cast-marisol.webp', import.meta.url).href,
  'cast.rafa.atlas': new URL('../../assets/generated/web/cast-rafa.webp', import.meta.url).href,
} as const satisfies Partial<Record<ImageAssetId, string>>;

export type RuntimeAssetId = keyof typeof RUNTIME_ASSET_URLS;

/**
 * Portrait (3:4) crops of the environments, centred on src/assets/focal.ts (derivatives.json → `portrait`).
 * Used instead of the full frame when the viewport is no wider than 3:4: same visible area, fewer bytes.
 */
export const PORTRAIT_URLS = {
  'env.neighborhood-patio@portrait': new URL('../../assets/generated/web/neighborhood-patio-portrait.webp', import.meta.url).href,
  'env.cave-waterfall@portrait': new URL('../../assets/generated/web/cave-waterfall-portrait.webp', import.meta.url).href,
  'env.back-alley@portrait': new URL('../../assets/generated/web/back-alley-portrait.webp', import.meta.url).href,
  'env.moonlit-promenade@portrait': new URL('../../assets/generated/web/moonlit-promenade-portrait.webp', import.meta.url).href,
  'env.jungle-camp@portrait': new URL('../../assets/generated/web/jungle-camp-portrait.webp', import.meta.url).href,
  'env.executive-terrace@portrait': new URL('../../assets/generated/web/executive-terrace-portrait.webp', import.meta.url).href,
  'env.rest-area@portrait': new URL('../../assets/generated/web/rest-area-portrait.webp', import.meta.url).href,
} as const;

export type PortraitKey = keyof typeof PORTRAIT_URLS;
/** Anything the image warmer can fetch and decode. */
export type WarmKey = RuntimeAssetId | PortraitKey;
