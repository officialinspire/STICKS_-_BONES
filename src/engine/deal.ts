import type { ModeRules } from './rules/presets';
import { shuffle, type RngState } from './rng';
import { CANONICAL_TILE_IDS } from './tiles';
import type { TileId } from './types';

export interface DealResult {
  /** hands[seat] — hidden information; never expose outside the owning seat's view. */
  readonly hands: readonly (readonly TileId[])[];
  /** Boneyard (draw mode) or the unused set-aside tiles (block mode). Empty for partnership. Hidden. */
  readonly stock: readonly TileId[];
  readonly rng: RngState;
}

/**
 * Shuffle the canonical set with the seedable contract and deal contiguous
 * blocks: seat s receives shuffled[s*n .. s*n+n-1]; the remainder is stock.
 */
export function deal(rules: ModeRules, rng: RngState): DealResult {
  const { items, state } = shuffle(CANONICAL_TILE_IDS, rng);
  const n = rules.tilesPerSeat;
  const hands = Array.from({ length: rules.seatCount }, (_, s) => Object.freeze(items.slice(s * n, s * n + n)));
  const stock = Object.freeze(items.slice(rules.seatCount * n));
  if (stock.length !== rules.stock.size)
    throw new Error(`Deal produced ${stock.length} stock tiles; preset expects ${rules.stock.size}`);
  return { hands: Object.freeze(hands), stock, rng: state };
}
