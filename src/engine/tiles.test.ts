import { describe, expect, it } from 'vitest';
import {
  CANONICAL_TILE_IDS,
  compareOpeningStrength,
  createDoubleSixSet,
  DOUBLE_SIX_TILE_COUNT,
  isDouble,
  otherEnd,
  parseTileId,
  pipTotal,
  tileFromId,
} from './tiles';

describe('double-six set', () => {
  const set = createDoubleSixSet();

  it('has exactly 28 tiles with unique ids', () => {
    expect(set).toHaveLength(DOUBLE_SIX_TILE_COUNT);
    expect(new Set(set.map((t) => t.id)).size).toBe(28);
    expect(new Set(CANONICAL_TILE_IDS).size).toBe(28);
  });

  it('contains every unordered pair 0..6 exactly once', () => {
    const pairs = new Set(set.map((t) => `${Math.min(t.high, t.low)}-${Math.max(t.high, t.low)}`));
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) expect(pairs.has(`${a}-${b}`)).toBe(true);
    expect(pairs.size).toBe(28);
  });

  it('stores high >= low and ids match pips', () => {
    for (const t of set) {
      expect(t.high).toBeGreaterThanOrEqual(t.low);
      expect(t.id).toBe(`t${t.high}${t.low}`);
      expect(tileFromId(t.id)).toEqual(t);
    }
  });

  it('has 7 doubles and 168 total pips (blank = 0)', () => {
    expect(set.filter(isDouble)).toHaveLength(7);
    expect(set.reduce((s, t) => s + pipTotal(t), 0)).toBe(168);
    expect(pipTotal(tileFromId('t00'))).toBe(0);
  });

  it('is frozen and canonical order is stable', () => {
    expect(Object.isFrozen(set)).toBe(true);
    expect(Object.isFrozen(set[0])).toBe(true);
    expect(CANONICAL_TILE_IDS.slice(0, 4)).toEqual(['t00', 't10', 't11', 't20']);
    expect(CANONICAL_TILE_IDS.at(-1)).toBe('t66');
  });
});

describe('tile ids', () => {
  it('rejects non-canonical ids', () => {
    for (const bad of ['t46', 't70', 't7', '64', 't-1', 'T64', 't640', '', 't 6']) expect(parseTileId(bad)).toBeNull();
  });
  it('otherEnd follows canonical values', () => {
    const t = tileFromId('t52');
    expect(otherEnd(t, 5)).toBe(2);
    expect(otherEnd(t, 2)).toBe(5);
    expect(() => otherEnd(t, 3)).toThrow();
  });
});

describe('opening strength', () => {
  const cmp = (a: string, b: string) => compareOpeningStrength(tileFromId(a as never), tileFromId(b as never));
  it('any double beats any non-double; higher double wins', () => {
    expect(cmp('t00', 't65')).toBeGreaterThan(0);
    expect(cmp('t55', 't44')).toBeGreaterThan(0);
  });
  it('non-doubles: higher total, then higher end', () => {
    expect(cmp('t65', 't64')).toBeGreaterThan(0);
    expect(cmp('t63', 't54')).toBeGreaterThan(0);
    expect(cmp('t54', 't63')).toBeLessThan(0);
  });
});
