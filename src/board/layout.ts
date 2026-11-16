/**
 * Responsive board layout: a pure projection of the engine's logical chain
 * onto a grid measured in tile units (1 unit = a tile's short side).
 *
 * Centre-out "snake": the opening tile (playIndex 0) sits in the middle of
 * row 0. The tail arm grows right and wraps DOWN; the head arm grows left and
 * wraps UP (it is the tail-arm algorithm rotated 180°). Existing tiles never
 * move when a tile is added, the two arms can never collide, and wrapping is
 * purely visual: it never changes which tiles are the logical end tiles.
 *
 * Doubles are crosswise (vertical in a row). At a wrap the turning tile is
 * vertical, its first half beside the previous tile and its second half above
 * the first tile of the next row.
 */
import type { EndId, LineState, PlacedTile } from '../engine/line';
import { openEnds } from '../engine/line';
import { tileFromId } from '../engine/tiles';
import type { Pip, TileId } from '../engine/types';
import { opposite, rotationFor, type Direction } from '../render/pips';

export interface BoxU {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface LaidTile {
  readonly tile: TileId;
  /** Index in the chain, head (0) → tail. */
  readonly index: number;
  readonly placed: PlacedTile;
  readonly box: BoxU;
  /** Direction from the tile's centre to its head-facing half (meaningless for doubles). */
  readonly headDir: Direction;
  /** Direction the face's HIGH half points on screen. */
  readonly highDir: Direction;
  /** CSS clockwise rotation applied to the portrait face. */
  readonly rotation: 0 | 90 | 180 | 270;
}

export interface EndSlot {
  readonly end: EndId;
  readonly box: BoxU;
  /** Pip value shown at this open end, or null on an empty board. */
  readonly pip: Pip | null;
  /** Direction from the slot toward the tile it attaches to. */
  readonly towardChain: Direction | null;
}

export interface BoardLayout {
  /** Board width in units (the wrap width). */
  readonly widthUnits: number;
  readonly heightUnits: number;
  readonly tiles: readonly LaidTile[];
  /** On an empty board both slots are the same central "lead" slot. */
  readonly slots: { readonly head: EndSlot; readonly tail: EndSlot };
}

export const MIN_WIDTH_UNITS = 8;

interface LocalPiece {
  box: BoxU;
  /** Direction (local frame) from the piece's centre toward the opener side. */
  back: Direction;
}

/** Lay out one arm in a local frame: start at x=`start` on row 0, travel +x, wrap downward. */
function layArm(pieces: readonly { double: boolean }[], start: number, half: number): { laid: LocalPiece[]; next: LocalPiece } {
  let x = start;
  let dir = 1;
  let rowY = 0;
  let afterTurn = false;
  const laid: LocalPiece[] = [];
  const place = (double: boolean): LocalPiece => {
    if (afterTurn) {
      afterTurn = false;
      const a = x;
      const b = x + 2 * dir;
      const lo = Math.min(a, b);
      const piece: LocalPiece = double
        ? { box: { x: dir > 0 ? lo + 1 : lo, y: rowY - 1, w: 1, h: 2 }, back: 'up' }
        : { box: { x: lo, y: rowY - 0.5, w: 2, h: 1 }, back: dir > 0 ? 'left' : 'right' };
      x = b;
      return piece;
    }
    const need = double ? 1 : 2;
    const fits = dir > 0 ? x + need <= half - 1 : x - need >= -half + 1;
    if (!fits) {
      const colX = dir > 0 ? x : x - 1;
      const piece: LocalPiece = { box: { x: colX, y: rowY - 0.5, w: 1, h: 2 }, back: 'up' };
      x = dir > 0 ? x + 1 : x - 1;
      dir = -dir;
      rowY += 2;
      afterTurn = true;
      return piece;
    }
    const lo = dir > 0 ? x : x - need;
    const piece: LocalPiece = double
      ? { box: { x: lo, y: rowY - 1, w: 1, h: 2 }, back: 'up' }
      : { box: { x: lo, y: rowY - 0.5, w: 2, h: 1 }, back: dir > 0 ? 'left' : 'right' };
    x += need * dir;
    return piece;
  };
  for (const p of pieces) laid.push(place(p.double));
  // The ghost slot is where a (non-double) next tile would go; computing it never mutates the arm.
  const next = place(false);
  return { laid, next };
}

const rot180 = (b: BoxU): BoxU => ({ x: -b.x - b.w, y: -b.y - b.h, w: b.w, h: b.h });

function faceFor(p: PlacedTile, box: BoxU, headDir: Direction): { highDir: Direction; rotation: 0 | 90 | 180 | 270 } {
  const t = tileFromId(p.tile);
  let highDir: Direction;
  if (p.crosswise) highDir = box.h > box.w ? 'up' : 'right';
  else highDir = p.headPip === t.high ? headDir : opposite(headDir);
  return { highDir, rotation: rotationFor(highDir) };
}

/**
 * Lay out a line for a board `widthUnits` wide (clamped to MIN_WIDTH_UNITS).
 * Output boxes are translated so x ∈ [0, widthUnits] and y ≥ 0.
 */
export function layoutChain(line: LineState, widthUnits: number): BoardLayout {
  const W = Math.max(MIN_WIDTH_UNITS, Math.floor(widthUnits));
  const half = W / 2;
  const tiles = line.tiles;
  const ends = openEnds(line);
  const raw: { tile: PlacedTile; index: number; box: BoxU; headDir: Direction }[] = [];
  let headSlot: { box: BoxU; toward: Direction | null };
  let tailSlot: { box: BoxU; toward: Direction | null };

  if (tiles.length === 0) {
    const lead = { x: -1, y: -0.5, w: 2, h: 1 };
    headSlot = { box: lead, toward: null };
    tailSlot = { box: lead, toward: null };
  } else {
    const o = tiles.findIndex((t) => t.playIndex === 0);
    const opener = tiles[o]!;
    const oBox = opener.crosswise ? { x: -0.5, y: -1, w: 1, h: 2 } : { x: -1, y: -0.5, w: 2, h: 1 };
    raw.push({ tile: opener, index: o, box: oBox, headDir: 'left' });
    const start = opener.crosswise ? 0.5 : 1;

    // Tail arm: chain order o+1 … end; each tile's head faces the opener (its "back").
    const tailTiles = tiles.slice(o + 1);
    const tailArm = layArm(tailTiles.map((t) => ({ double: t.crosswise })), start, half);
    tailArm.laid.forEach((p, i) => raw.push({ tile: tailTiles[i]!, index: o + 1 + i, box: p.box, headDir: p.back }));
    tailSlot = { box: tailArm.next.box, toward: tailArm.next.back };

    // Head arm: chain order o-1 … 0, laid in a rotated frame; each tile's TAIL faces the opener.
    const headTiles = tiles.slice(0, o).reverse();
    const headArm = layArm(headTiles.map((t) => ({ double: t.crosswise })), start, half);
    headArm.laid.forEach((p, i) =>
      raw.push({ tile: headTiles[i]!, index: o - 1 - i, box: rot180(p.box), headDir: p.back /* opposite(back) rotated 180° */ }),
    );
    headSlot = { box: rot180(headArm.next.box), toward: opposite(headArm.next.back) };
  }

  const allBoxes = [...raw.map((r) => r.box), headSlot.box, tailSlot.box];
  const minY = Math.min(...allBoxes.map((b) => b.y));
  const maxY = Math.max(...allBoxes.map((b) => b.y + b.h));
  const shift = (b: BoxU): BoxU => ({ x: b.x + half, y: b.y - minY, w: b.w, h: b.h });

  const laid: LaidTile[] = raw
    .map((r) => {
      const box = shift(r.box);
      return { tile: r.tile.tile, index: r.index, placed: r.tile, box, headDir: r.headDir, ...faceFor(r.tile, box, r.headDir) };
    })
    .sort((a, b) => a.index - b.index);

  return {
    widthUnits: W,
    heightUnits: maxY - minY,
    tiles: laid,
    slots: {
      head: { end: 'head', box: shift(headSlot.box), pip: ends?.head ?? null, towardChain: headSlot.toward },
      tail: { end: 'tail', box: shift(tailSlot.box), pip: ends?.tail ?? null, towardChain: tailSlot.toward },
    },
  };
}

/** Pip value a laid tile shows on the half that points in `dir` (null if `dir` is along its short axis). */
export function pipShownToward(t: LaidTile, dir: Direction): Pip | null {
  const face = tileFromId(t.tile);
  const vertical = t.box.h > t.box.w;
  const alongLong = vertical ? dir === 'up' || dir === 'down' : dir === 'left' || dir === 'right';
  if (!alongLong) return null;
  return dir === t.highDir ? face.high : face.low;
}
