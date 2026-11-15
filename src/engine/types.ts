/**
 * Core domain types for the STICKS & BONES engine.
 *
 * The engine is pure TypeScript: no DOM, no timers, no Math.random, no I/O.
 * Every value is plain JSON-serializable data.
 */

/** Pip value on one half of a tile. 0 is the blank and counts as zero. */
export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const PIPS: readonly Pip[] = [0, 1, 2, 3, 4, 5, 6];
export const MAX_PIP: Pip = 6;

/**
 * Canonical tile id: `t` + high pip + low pip, e.g. `t64`, `t00`.
 * Ids are opaque to presentation and never encode art.
 */
export type TileId = `t${Pip}${Pip}`;

export interface Tile {
  readonly id: TileId;
  readonly high: Pip;
  readonly low: Pip;
}

/**
 * Seat index. Turn order is always next = (seat + 1) % seatCount, which is
 * counterclockwise around the table (see docs/RULES.md for the diagram).
 */
export type SeatIndex = 0 | 1 | 2 | 3;

export type ModeId = 'draw2' | 'block2' | 'partnership4';

export const MODE_IDS: readonly ModeId[] = ['draw2', 'block2', 'partnership4'];

export type TargetScore = 100 | 200;
