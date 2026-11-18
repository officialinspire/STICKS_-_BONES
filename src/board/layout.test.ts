import { describe, expect, it } from 'vitest';
import { createMatchConfig } from '../engine/config';
import { EMPTY_LINE, openEnds, placeTile, type LineState } from '../engine/line';
import { applyCommand, createMatch } from '../engine/match';
import { seedRng } from '../engine/rng';
import { randomCommand } from '../engine/simulate';
import { chain } from '../engine/testing/craft';
import { CANONICAL_TILE_IDS, tileFromId } from '../engine/tiles';
import type { TileId } from '../engine/types';
import type { Direction } from '../render/pips';
import { layoutChain, MIN_WIDTH_UNITS, pipShownToward, type BoxU, type LaidTile } from './layout';

const EPS = 1e-9;
const overlapArea = (a: BoxU, b: BoxU) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** True when boxes share an edge segment of positive length (touch without overlapping). */
const touch = (a: BoxU, b: BoxU) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (Math.abs(ox) < EPS && oy > EPS) || (Math.abs(oy) < EPS && ox > EPS);
};
const halfBox = (t: LaidTile, dir: Direction): BoxU => {
  if (t.placed.crosswise) return t.box;
  const { x, y, w, h } = t.box;
  switch (dir) {
    case 'left':
      return { x, y, w: w / 2, h };
    case 'right':
      return { x: x + w / 2, y, w: w / 2, h };
    case 'up':
      return { x, y, w, h: h / 2 };
    case 'down':
      return { x, y: y + h / 2, w, h: h / 2 };
  }
};
const opp = (d: Direction): Direction => ({ up: 'down', down: 'up', left: 'right', right: 'left' }) [d] as Direction;
const shown = (t: LaidTile, dir: Direction) => (t.placed.crosswise ? tileFromId(t.tile).high : pipShownToward(t, dir));

function assertLayout(line: LineState, width: number, tag: string) {
  const L = layoutChain(line, width);
  const msg = `${tag} width=${width}`;
  expect(L.tiles.length, msg).toBe(line.tiles.length);
  const boxes = [...L.tiles.map((t) => t.box), L.slots.head.box, L.slots.tail.box];
  for (const b of boxes) {
    expect(b.x, msg).toBeGreaterThanOrEqual(-EPS);
    expect(b.x + b.w, msg).toBeLessThanOrEqual(L.widthUnits + EPS);
    expect(b.y, msg).toBeGreaterThanOrEqual(-EPS);
    expect(b.y + b.h, msg).toBeLessThanOrEqual(L.heightUnits + EPS);
  }
  // No two tiles (or a tile and an open-end slot) overlap.
  for (let i = 0; i < L.tiles.length; i++) {
    for (let j = i + 1; j < L.tiles.length; j++) expect(overlapArea(L.tiles[i]!.box, L.tiles[j]!.box), `${msg} tiles ${i}/${j}`).toBeLessThan(EPS);
    if (line.tiles.length) {
      expect(overlapArea(L.tiles[i]!.box, L.slots.head.box), `${msg} head slot overlaps ${i}`).toBeLessThan(EPS);
      expect(overlapArea(L.tiles[i]!.box, L.slots.tail.box), `${msg} tail slot overlaps ${i}`).toBeLessThan(EPS);
    }
  }
  // Consecutive tiles touch, and the touching halves show the same number.
  for (let i = 0; i + 1 < L.tiles.length; i++) {
    const a = L.tiles[i]!;
    const b = L.tiles[i + 1]!;
    const aTail = opp(a.headDir);
    expect(touch(halfBox(a, aTail), halfBox(b, b.headDir)), `${msg} ${a.tile}→${b.tile} halves do not touch`).toBe(true);
    expect(shown(a, aTail), `${msg} ${a.tile} tail half`).toBe(a.placed.tailPip);
    expect(shown(b, b.headDir), `${msg} ${b.tile} head half`).toBe(b.placed.headPip);
    expect(a.placed.tailPip).toBe(b.placed.headPip);
  }
  // Open-end slots attach to the true logical end tiles and face the open-end pip.
  if (line.tiles.length) {
    const ends = openEnds(line)!;
    const first = L.tiles[0]!;
    const last = L.tiles[L.tiles.length - 1]!;
    expect(touch(L.slots.head.box, halfBox(first, first.headDir)), `${msg} head slot detached`).toBe(true);
    expect(touch(L.slots.tail.box, halfBox(last, opp(last.headDir))), `${msg} tail slot detached`).toBe(true);
    expect(shown(first, first.headDir)).toBe(ends.head);
    expect(shown(last, opp(last.headDir))).toBe(ends.tail);
    expect([L.slots.head.pip, L.slots.tail.pip]).toEqual([ends.head, ends.tail]);
  }
  // Every rotation is a quarter turn whose high half matches the data.
  for (const t of L.tiles) {
    expect([0, 90, 180, 270]).toContain(t.rotation);
    const vertical = t.box.h > t.box.w;
    expect(vertical ? [0, 180] : [90, 270], `${msg} ${t.tile} rotation/aspect`).toContain(t.rotation);
  }
  return L;
}

function linesFromSimulation(mode: 'draw2' | 'block2' | 'partnership4', seed: string): LineState[] {
  const cfg = createMatchConfig({ mode });
  if (!cfg.ok) throw new Error('cfg');
  const created = createMatch(cfg.config, seed);
  if (!created.ok) throw new Error('create');
  let s = created.state;
  let policy = seedRng(seed);
  const lines: LineState[] = [];
  for (let i = 0; i < 400; i++) {
    const p = randomCommand(s, policy);
    policy = p.policy;
    if (!p.command || p.command.type === 'start-next-hand') break;
    const r = applyCommand(s, p.command);
    if (!r.ok) throw new Error(r.error.code);
    s = r.state;
    if (p.command.type === 'play') lines.push(s.hand.line);
  }
  return lines;
}

describe('board layout (wrapping view of the logical chain)', () => {
  it('empty board shows one central lead slot', () => {
    const L = layoutChain(EMPTY_LINE, 12);
    expect(L.tiles).toEqual([]);
    expect(L.slots.head.box).toEqual(L.slots.tail.box);
    expect(L.slots.head.pip).toBeNull();
  });

  it('a complete 28-tile chain lays out legally at every width from the minimum to desktop', () => {
    const full = chain(CANONICAL_TILE_IDS, 0);
    // Build it as if played from the middle outwards, so both arms are exercised.
    const mid = 13;
    let line = placeTile(EMPTY_LINE, full[mid]![0] as TileId, 'head', 0).line;
    for (let k = 1; k <= 14; k++) {
      if (mid + k < full.length) line = placeTile(line, full[mid + k]![0] as TileId, 'tail', 0).line;
      if (mid - k >= 0) line = placeTile(line, full[mid - k]![0] as TileId, 'head', 0).line;
    }
    expect(line.tiles).toHaveLength(28);
    for (let w = MIN_WIDTH_UNITS; w <= 30; w++) assertLayout(line, w, 'full-28');
  });

  it('every intermediate line from seeded games lays out legally at phone, tablet and desktop widths', () => {
    for (const mode of ['draw2', 'block2', 'partnership4'] as const)
      for (let g = 0; g < 12; g++)
        for (const line of linesFromSimulation(mode, `layout-${mode}-${g}`))
          for (const w of [8, 11, 14, 22]) assertLayout(line, w, `${mode}#${g} n=${line.tiles.length}`);
  });

  it('wrapping never changes the logical ends', () => {
    const lines = linesFromSimulation('draw2', 'ends-check');
    const line = lines[lines.length - 1]!;
    const widths = [8, 9, 10, 13, 17, 25];
    const firsts = widths.map((w) => layoutChain(line, w).tiles[0]!.tile);
    const lasts = widths.map((w) => layoutChain(line, w).tiles.at(-1)!.tile);
    expect(new Set(firsts).size).toBe(1);
    expect(new Set(lasts).size).toBe(1);
    expect(firsts[0]).toBe(line.tiles[0]!.tile);
    expect(lasts[0]).toBe(line.tiles.at(-1)!.tile);
  });

  it('adding a tile never moves tiles already on the board', () => {
    const lines = linesFromSimulation('partnership4', 'stable');
    for (let i = 1; i < lines.length; i++) {
      const before = layoutChain(lines[i - 1]!, 12);
      const after = layoutChain(lines[i]!, 12);
      const shiftY = after.tiles.find((t) => t.tile === before.tiles[0]!.tile)!.box.y - before.tiles[0]!.box.y;
      for (const t of before.tiles) {
        const moved = after.tiles.find((x) => x.tile === t.tile)!;
        expect(moved.box.x).toBe(t.box.x);
        expect(moved.box.y - t.box.y).toBe(shiftY);
        expect(moved.rotation).toBe(t.rotation);
      }
    }
  });

  it('widths below the minimum are clamped', () => {
    expect(layoutChain(EMPTY_LINE, 3).widthUnits).toBe(MIN_WIDTH_UNITS);
  });
});
