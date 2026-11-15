import { MAX_PIP, PIPS, type Pip, type Tile, type TileId } from './types';

/** Number of tiles in a double-six set: C(7,2) + 7 = 28. */
export const DOUBLE_SIX_TILE_COUNT = 28;

function isPip(n: number): n is Pip {
  return Number.isInteger(n) && n >= 0 && n <= MAX_PIP;
}

export function makeTile(a: Pip, b: Pip): Tile {
  const high = (a >= b ? a : b) as Pip;
  const low = (a >= b ? b : a) as Pip;
  return { id: `t${high}${low}`, high, low };
}

/**
 * The canonical double-six set in canonical order:
 * t00, t10, t11, t20, t21, t22, ... t66 (high ascending, then low ascending).
 * Each call returns fresh frozen objects so callers cannot share mutations.
 */
export function createDoubleSixSet(): readonly Tile[] {
  const tiles: Tile[] = [];
  for (const high of PIPS) {
    for (const low of PIPS) {
      if (low > high) break;
      tiles.push(Object.freeze(makeTile(high, low)));
    }
  }
  return Object.freeze(tiles);
}

export const CANONICAL_TILE_IDS: readonly TileId[] = Object.freeze(createDoubleSixSet().map((t) => t.id));

/** Parse and validate a tile id. Returns null for anything non-canonical (e.g. `t46`, `t70`). */
export function parseTileId(id: string): Tile | null {
  const m = /^t([0-6])([0-6])$/.exec(id);
  if (!m) return null;
  const high = Number(m[1]);
  const low = Number(m[2]);
  if (!isPip(high) || !isPip(low) || low > high) return null;
  return makeTile(high, low);
}

export function tileFromId(id: TileId): Tile {
  const t = parseTileId(id);
  if (!t) throw new Error(`Invalid tile id: ${id}`);
  return t;
}

export function isDouble(t: Tile): boolean {
  return t.high === t.low;
}

/** Pip total; blank halves count zero. */
export function pipTotal(t: Tile): number {
  return t.high + t.low;
}

export function hasPip(t: Tile, pip: Pip): boolean {
  return t.high === pip || t.low === pip;
}

/** The pip on the other half after matching `pip`. Throws if `pip` is not on the tile. */
export function otherEnd(t: Tile, pip: Pip): Pip {
  if (t.high === pip) return t.low;
  if (t.low === pip) return t.high;
  throw new Error(`Tile ${t.id} has no ${pip}`);
}

/**
 * Opening strength used by the "highest double, else heaviest tile, ties by
 * higher end" selection. Positive when `a` is stronger than `b`.
 * Any double beats any non-double.
 */
export function compareOpeningStrength(a: Tile, b: Tile): number {
  const ad = isDouble(a);
  const bd = isDouble(b);
  if (ad !== bd) return ad ? 1 : -1;
  if (ad && bd) return a.high - b.high;
  const byTotal = pipTotal(a) - pipTotal(b);
  if (byTotal !== 0) return byTotal;
  return a.high - b.high;
}
