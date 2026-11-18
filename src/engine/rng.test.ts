import { describe, expect, it } from 'vitest';
import { isRngState, nextUint32, randomInt, seedRng, shuffle, SHUFFLE_CONTRACT } from './rng';
import { CANONICAL_TILE_IDS } from './tiles';

describe('seedable RNG contract', () => {
  it('is deterministic for equal seeds and differs across seeds', () => {
    const a = shuffle(CANONICAL_TILE_IDS, seedRng('cousin')).items;
    const b = shuffle(CANONICAL_TILE_IDS, seedRng('cousin')).items;
    const c = shuffle(CANONICAL_TILE_IDS, seedRng('primo')).items;
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('locks the contract with golden vectors (changing these breaks saved games)', () => {
    let st = seedRng(12345);
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = nextUint32(st);
      out.push(r.value);
      st = r.state;
    }
    expect(SHUFFLE_CONTRACT).toBe('sfc32-fy/1');
    expect(out).toMatchInlineSnapshot(`
      [
        2345461488,
        1344865159,
        2974739204,
        3448212715,
      ]
    `);
    expect(shuffle(CANONICAL_TILE_IDS, seedRng('cousin')).items.slice(0, 7)).toMatchInlineSnapshot(`
      [
        "t54",
        "t62",
        "t44",
        "t41",
        "t50",
        "t11",
        "t33",
      ]
    `);
  });

  it('state is plain serializable data', () => {
    const st = seedRng('serialize-me');
    const round = JSON.parse(JSON.stringify(st));
    expect(isRngState(round)).toBe(true);
    expect(nextUint32(round).value).toBe(nextUint32(st).value);
  });

  it('shuffle is a permutation and does not mutate input', () => {
    const input = [...CANONICAL_TILE_IDS];
    const { items } = shuffle(input, seedRng(7));
    expect(input).toEqual([...CANONICAL_TILE_IDS]);
    expect([...items].sort()).toEqual([...CANONICAL_TILE_IDS].sort());
  });

  it('randomInt stays in range and is roughly uniform', () => {
    let st = seedRng('uniform');
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 7000; i++) {
      const r = randomInt(st, 7);
      st = r.state;
      counts[r.value]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(850);
    expect(() => randomInt(st, 0)).toThrow();
  });

  it('rejects invalid numeric seeds', () => {
    expect(() => seedRng(-1)).toThrow();
    expect(() => seedRng(1.5)).toThrow();
    expect(isRngState({ contract: 'other', s: [1, 2, 3, 4] })).toBe(false);
  });
});
