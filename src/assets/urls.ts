/**
 * Runtime URL registry. Only assets with status "runtime" in the manifest are
 * listed, so Vite bundles exactly these files. Each `new URL(literal,
 * import.meta.url)` is rewritten by Vite to a hashed, base-relative URL, which
 * keeps GitHub Pages subpath hosting working.
 *
 * `npm run assets:verify` fails if this list and the manifest disagree.
 */
import type { ImageAssetId } from './manifest';

export const RUNTIME_ASSET_URLS = {
  'cousin.atlas.portrait': new URL(
    '../../assets/art/characters/Eight-expression transparent portrait atlas-2.png',
    import.meta.url,
  ).href,
  // Optional presentation art: loaded only when an animation/effect first needs it.
  'cousin.anim.slam': new URL('../../assets/art/characters/Confident six-frame domino slam.png', import.meta.url).href,
  'fx.sheet': new URL('../../assets/art/effects/Eight polished dominoes effect sprites.png', import.meta.url).href,
  'tile.atlas': new URL('../../assets/generated/tiles/double-six-atlas.png', import.meta.url).href,
  'table.weathered': new URL('../../assets/art/tables/Weathered Caribbean game tabletop.png', import.meta.url).href,
  'env.neighborhood-patio': new URL(
    '../../assets/art/environments/Shaded Puerto Rican Neighborhood Patio.png',
    import.meta.url,
  ).href,
} as const satisfies Partial<Record<ImageAssetId, string>>;

export type RuntimeAssetId = keyof typeof RUNTIME_ASSET_URLS;
