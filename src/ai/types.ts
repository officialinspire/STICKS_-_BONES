import type { EndId } from '../engine/line';
import type { RngState } from '../engine/rng';
import type { TileId } from '../engine/types';
import type { AiObservation } from './observation';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export type AiAction = { readonly type: 'play'; readonly tile: TileId; readonly end: EndId } | { readonly type: 'draw' } | { readonly type: 'pass' };

export interface Decision {
  readonly action: AiAction;
  /** The AI's own RNG stream after this decision (independent of the shuffle RNG). */
  readonly rng: RngState;
  /** Short honest description of how the move was chosen. */
  readonly method: string;
  readonly stats?: { readonly worlds: number; readonly relaxedWorlds: number; readonly rolloutPlies: number };
}

export type Policy = (obs: AiObservation, rng: RngState) => Decision;
