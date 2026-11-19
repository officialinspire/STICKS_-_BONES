/**
 * Each story scene's images (backdrops + speaking cast), as plain data so the core bundle can tell
 * which scenes are ready offline without loading the Story chunk. A test keeps this equal to what the
 * Story layer actually loads (src/ui/story-assets.ts sceneAssets).
 */
import type { RuntimeAssetId } from '../assets/urls';
import type { SceneId } from './progress';

export const SCENE_IMAGES: Readonly<Record<SceneId, { readonly env: readonly RuntimeAssetId[]; readonly cast: readonly RuntimeAssetId[] }>> = {
  prologue: { env: ['env.cave-waterfall', 'env.neighborhood-patio'], cast: [] },
  'chapter-1': { env: ['env.neighborhood-patio'], cast: ['cast.rafa.atlas', 'cast.marisol.atlas'] },
  'chapter-2': { env: ['env.back-alley'], cast: ['cast.marisol.atlas', 'cast.vale.atlas'] },
  'chapter-3': { env: ['env.executive-terrace'], cast: ['cast.vale.atlas', 'cast.marisol.atlas', 'cast.rafa.atlas'] },
  'chapter-4': { env: ['env.moonlit-promenade'], cast: ['cast.rafa.atlas', 'cast.marisol.atlas'] },
  'chapter-5': { env: ['env.jungle-camp'], cast: ['cast.luz.atlas', 'cast.marisol.atlas'] },
  'chapter-6': { env: ['env.cave-waterfall', 'env.rest-area'], cast: ['cast.marisol.atlas', 'cast.luz.atlas'] },
  'chapter-7': { env: ['env.executive-terrace'], cast: ['cast.vale.atlas', 'cast.marisol.atlas', 'cast.rafa.atlas'] },
  epilogue: { env: ['env.neighborhood-patio'], cast: ['cast.marisol.atlas'] },
};
