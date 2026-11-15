/**
 * Serializable match state. Contains hidden information (hands, stock, RNG):
 * presentation and AI must read it through `seatView`, never directly.
 */
import type { MatchConfig } from './config';
import type { LineState } from './line';
import type { RngState } from './rng';
import type { OpeningRule, StockRule } from './rules/presets';
import type { SeatIndex, TileId } from './types';

export const MATCH_STATE_SCHEMA_VERSION = 1;
export const ENGINE_ID = 'sticks-and-bones-rules/1' as const;

/**
 * playing        — seats act (play / draw / pass).
 * hand-ended     — someone went out or the hand is blocked; hands are frozen
 *                  until a single `resolve-hand` command scores it.
 * hand-resolved  — scored; `start-next-hand` deals the next one.
 * match-over     — a side reached the target. Terminal.
 */
export type Phase = 'playing' | 'hand-ended' | 'hand-resolved' | 'match-over';

export type OpeningRequirement = { readonly kind: 'tile'; readonly tile: TileId } | { readonly kind: 'any' };

export type HandEnd = { readonly kind: 'out'; readonly seat: SeatIndex } | { readonly kind: 'blocked' };

export interface HandResult {
  readonly handNumber: number;
  readonly opener: SeatIndex;
  readonly end: HandEnd;
  /** Hands exactly as they stood when the hand ended (revealed at hand end). */
  readonly finalHands: readonly (readonly TileId[])[];
  readonly seatTotals: readonly number[];
  readonly teamTotals: readonly number[];
  /** null for a blocked tie. */
  readonly winnerTeam: number | null;
  /** Seat credited with the win (out seat, or lowest-pip member of the winning side at a block). */
  readonly winnerSeat: SeatIndex | null;
  readonly points: number;
  readonly scoresAfter: readonly number[];
}

export interface HandState {
  readonly number: number;
  readonly hands: readonly (readonly TileId[])[];
  /** Boneyard (draws from index 0) or the hidden unused tiles, per `stockKind`. */
  readonly stock: readonly TileId[];
  readonly stockKind: StockRule['kind'];
  readonly line: LineState;
  readonly opener: SeatIndex;
  readonly openingRule: OpeningRule['kind'];
  readonly requirement: OpeningRequirement;
  readonly turn: SeatIndex;
  /** Consecutive passes since the last play. Reset to 0 by every play. */
  readonly consecutivePasses: number;
  /** Tiles drawn by the current seat during this turn. */
  readonly drawsThisTurn: number;
  readonly end: HandEnd | null;
  readonly result: HandResult | null;
}

export interface MatchState {
  readonly schemaVersion: typeof MATCH_STATE_SCHEMA_VERSION;
  readonly engine: typeof ENGINE_ID;
  readonly config: MatchConfig;
  /** Count of accepted commands. Commands must echo it to be accepted (stale-command guard). */
  readonly seq: number;
  readonly rng: RngState;
  /** Points per side, indexed like `rules.teams`. */
  readonly scores: readonly number[];
  readonly phase: Phase;
  readonly hand: HandState;
  readonly history: readonly HandResult[];
  readonly winnerTeam: number | null;
}
