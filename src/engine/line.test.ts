import { describe, expect, it } from 'vitest';
import { checkLine, EMPTY_LINE, isFlipped, openEnds, placeTile, placementsFor, type LineState } from './line';
import type { TileId } from './types';

function build(...steps: [TileId, 'head' | 'tail'][]): LineState {
  return steps.reduce((line, [t, e]) => placeTile(line, t, e, 0).line, EMPTY_LINE);
}

describe('line of play (logical chain)', () => {
  it('opening tile: one placement, canonical orientation, either end accepted', () => {
    expect(placementsFor(EMPTY_LINE, 't63')).toEqual([
      { tile: 't63', end: 'head', matches: null, headPip: 6, tailPip: 3, crosswise: false },
    ]);
    const viaTail = placeTile(EMPTY_LINE, 't63', 'tail', 1);
    expect(openEnds(viaTail.line)).toEqual({ head: 6, tail: 3 });
  });

  it('tracks both open ends as tiles are added at head and tail', () => {
    const line = build(['t63', 'head'], ['t31', 'tail'], ['t64', 'head']);
    expect(line.tiles.map((t) => [t.tile, t.headPip, t.tailPip])).toEqual([
      ['t64', 4, 6],
      ['t63', 6, 3],
      ['t31', 3, 1],
    ]);
    expect(openEnds(line)).toEqual({ head: 4, tail: 1 });
    expect(checkLine(line)).toEqual([]);
  });

  it('a tile fitting both ends yields two distinct choices', () => {
    const line = build(['t31', 'head'], ['t51', 'tail']); // ends 3 … 5
    expect(openEnds(line)).toEqual({ head: 3, tail: 5 });
    const opts = placementsFor(line, 't53');
    expect(opts.map((o) => [o.end, o.matches])).toEqual([
      ['head', 3],
      ['tail', 5],
    ]);
    expect(openEnds(placeTile(line, 't53', 'head', 0).line)).toEqual({ head: 5, tail: 5 });
    expect(openEnds(placeTile(line, 't53', 'tail', 0).line)).toEqual({ head: 3, tail: 3 });
  });

  it('equal open ends still give separate head and tail choices', () => {
    const line = build(['t41', 'head'], ['t61', 'tail'], ['t64', 'tail']); // 4 … 4
    expect(openEnds(line)).toEqual({ head: 4, tail: 4 });
    expect(placementsFor(line, 't42').map((o) => o.end)).toEqual(['head', 'tail']);
  });

  it('flipping keeps canonical tile identity', () => {
    const line = build(['t41', 'head'], ['t61', 'tail'], ['t64', 'tail']);
    const atHead = placeTile(line, 't42', 'head', 0).placed;
    const atTail = placeTile(line, 't42', 'tail', 0).placed;
    expect(atHead).toMatchObject({ tile: 't42', headPip: 2, tailPip: 4 });
    expect(atTail).toMatchObject({ tile: 't42', headPip: 4, tailPip: 2 });
    expect(isFlipped(atHead)).toBe(true);
    expect(isFlipped(atTail)).toBe(false);
  });

  it('doubles are crosswise, never spinners: still exactly two ends', () => {
    const line = build(['t52', 'head'], ['t22', 'tail']);
    const dbl = line.tiles[1]!;
    expect(dbl).toMatchObject({ tile: 't22', crosswise: true, headPip: 2, tailPip: 2 });
    expect(openEnds(line)).toEqual({ head: 5, tail: 2 });
    expect(placementsFor(line, 't21').map((o) => o.end)).toEqual(['tail']);
  });

  it('blanks match blanks; double-blank is a crosswise zero', () => {
    const line = build(['t50', 'head'], ['t00', 'tail'], ['t30', 'tail']);
    expect(openEnds(line)).toEqual({ head: 5, tail: 3 });
    expect(line.tiles[1]).toMatchObject({ tile: 't00', crosswise: true });
    expect(placementsFor(line, 't10')).toEqual([]);
  });

  it('rejects illegal placements and flags broken chains', () => {
    const line = build(['t63', 'head']);
    expect(() => placeTile(line, 't21', 'tail', 0)).toThrow();
    expect(placementsFor(line, 't21')).toEqual([]);
    const broken: LineState = { tiles: [line.tiles[0]!, { ...line.tiles[0]!, tile: 't21', headPip: 2, tailPip: 1, playIndex: 1 }] };
    expect(checkLine(broken).length).toBeGreaterThan(0);
  });
});
