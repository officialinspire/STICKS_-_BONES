/**
 * The line of play as a logical chain, independent of screen layout.
 *
 * Tiles are stored head → tail. Each placed tile records which canonical pip
 * faces the head and which faces the tail; the tile id is never rewritten, so
 * a "flipped" tile keeps its canonical identity (`t52` stays `t52` whether 5
 * or 2 faces the head). Doubles are crosswise and are never spinners: the line
 * always has exactly two open ends.
 */
import { hasPip, isDouble, otherEnd, tileFromId } from './tiles';
import type { Pip, SeatIndex, TileId } from './types';

/** Logical end of the chain. 'head' is the first tile's outer side; 'tail' the last tile's. */
export type EndId = 'head' | 'tail';
export const END_IDS: readonly EndId[] = ['head', 'tail'];

export interface PlacedTile {
  readonly tile: TileId;
  /** Pip on the side facing the head end of the chain. */
  readonly headPip: Pip;
  /** Pip on the side facing the tail end of the chain. */
  readonly tailPip: Pip;
  /** True for doubles: laid across the line. */
  readonly crosswise: boolean;
  readonly seat: SeatIndex;
  /** 0-based order in which tiles were played this hand. */
  readonly playIndex: number;
}

export interface LineState {
  /** Ordered head → tail. */
  readonly tiles: readonly PlacedTile[];
}

export interface OpenEnds {
  readonly head: Pip;
  readonly tail: Pip;
}

export const EMPTY_LINE: LineState = { tiles: [] };

export function openEnds(line: LineState): OpenEnds | null {
  const first = line.tiles[0];
  const last = line.tiles[line.tiles.length - 1];
  if (!first || !last) return null;
  return { head: first.headPip, tail: last.tailPip };
}

/** True when the tile id's high pip faces the tail (display hint only; identity never changes). */
export function isFlipped(p: PlacedTile): boolean {
  return !p.crosswise && p.headPip !== tileFromId(p.tile).high;
}

export interface Placement {
  readonly tile: TileId;
  readonly end: EndId;
  /** Open-end pip the tile matches, or null for the opening tile. */
  readonly matches: Pip | null;
  readonly headPip: Pip;
  readonly tailPip: Pip;
  readonly crosswise: boolean;
}

/**
 * Every distinct way `tileId` can be placed. On an empty line there is one
 * placement (reported as 'head'). Otherwise one per matching end, so a tile
 * that fits both ends yields two distinct choices, even when both ends show the
 * same pip.
 */
export function placementsFor(line: LineState, tileId: TileId): Placement[] {
  const tile = tileFromId(tileId);
  const crosswise = isDouble(tile);
  const ends = openEnds(line);
  if (!ends) return [{ tile: tileId, end: 'head', matches: null, headPip: tile.high, tailPip: tile.low, crosswise }];
  const out: Placement[] = [];
  if (hasPip(tile, ends.head)) {
    out.push({ tile: tileId, end: 'head', matches: ends.head, headPip: otherEnd(tile, ends.head), tailPip: ends.head, crosswise });
  }
  if (hasPip(tile, ends.tail)) {
    out.push({ tile: tileId, end: 'tail', matches: ends.tail, headPip: ends.tail, tailPip: otherEnd(tile, ends.tail), crosswise });
  }
  return out;
}

/**
 * Place a tile. On an empty line either end is accepted and treated as the
 * opening placement. Throws on an illegal placement — callers validate first.
 */
export function placeTile(line: LineState, tileId: TileId, end: EndId, seat: SeatIndex): { line: LineState; placed: PlacedTile } {
  const options = placementsFor(line, tileId);
  const choice = line.tiles.length === 0 ? options[0] : options.find((p) => p.end === end);
  if (!choice) throw new Error(`Illegal placement of ${tileId} at ${end}`);
  const placed: PlacedTile = {
    tile: tileId,
    headPip: choice.headPip,
    tailPip: choice.tailPip,
    crosswise: choice.crosswise,
    seat,
    playIndex: line.tiles.length,
  };
  const tiles = line.tiles.length === 0 || choice.end === 'tail' ? [...line.tiles, placed] : [placed, ...line.tiles];
  return { line: { tiles }, placed };
}

/** Structural check of a chain. Returns problems (empty = valid). */
export function checkLine(line: LineState): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  line.tiles.forEach((p, i) => {
    const t = tileFromId(p.tile);
    if (seen.has(p.tile)) problems.push(`line: ${p.tile} appears twice`);
    seen.add(p.tile);
    const pipsMatch =
      (p.headPip === t.high && p.tailPip === t.low) || (p.headPip === t.low && p.tailPip === t.high);
    if (!pipsMatch) problems.push(`line[${i}]: ${p.tile} oriented as ${p.headPip}|${p.tailPip}`);
    if (p.crosswise !== isDouble(t)) problems.push(`line[${i}]: ${p.tile} crosswise=${p.crosswise}`);
    const next = line.tiles[i + 1];
    if (next && p.tailPip !== next.headPip) problems.push(`line[${i}]→[${i + 1}]: ${p.tailPip} does not meet ${next.headPip}`);
  });
  const indices = line.tiles.map((p) => p.playIndex).sort((a, b) => a - b);
  if (indices.some((v, i) => v !== i)) problems.push('line: playIndex values are not 0..n-1');
  return problems;
}
