import type { EndId } from './line';
import type { SeatIndex, TileId } from './types';

/**
 * Commands are the only way to change match state. Every command echoes the
 * state's `seq`; a mismatch is rejected as stale (double taps, late AI moves,
 * replays after an undo).
 */
export type Command =
  | { readonly type: 'play'; readonly seq: number; readonly seat: SeatIndex; readonly tile: TileId; readonly end: EndId }
  | { readonly type: 'draw'; readonly seq: number; readonly seat: SeatIndex }
  | { readonly type: 'pass'; readonly seq: number; readonly seat: SeatIndex }
  | { readonly type: 'resolve-hand'; readonly seq: number }
  | { readonly type: 'start-next-hand'; readonly seq: number };

export type CommandErrorCode =
  | 'malformed-command'
  | 'stale-command'
  | 'match-over'
  | 'hand-not-in-progress'
  | 'hand-not-ended'
  | 'already-resolved'
  | 'hand-not-resolved'
  | 'invalid-seat'
  | 'not-your-turn'
  | 'invalid-tile'
  | 'tile-already-played'
  | 'tile-not-in-hand'
  | 'must-lead-required-tile'
  | 'invalid-end'
  | 'illegal-placement'
  | 'has-legal-move'
  | 'must-draw'
  | 'no-draw-in-mode'
  | 'boneyard-empty';

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}
