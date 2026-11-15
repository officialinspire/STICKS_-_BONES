/**
 * Seedable, serializable RNG and shuffle contract.
 *
 * Contract `sfc32-fy/1` (bump SHUFFLE_CONTRACT if any step changes, because
 * saved games and replays depend on identical output):
 *   1. A seed (uint32 or string) is expanded to four uint32 words. Strings are
 *      hashed with cyrb128; numbers are expanded with splitmix32.
 *   2. The generator is SFC32, advanced 12 times after seeding to mix state.
 *   3. `randomInt(n)` draws uint32 values and rejects the biased tail
 *      (values >= floor(2^32 / n) * n), so results are uniform.
 *   4. `shuffle` is Fisher–Yates from the last index down to 1, swapping
 *      index i with randomInt(i + 1).
 *
 * All functions are pure: they take an RngState and return a new one.
 * Seeds and RNG state reveal hidden hands — never put them in URLs, logs,
 * analytics, DOM attributes, or pass-and-play screens.
 */

export const SHUFFLE_CONTRACT = 'sfc32-fy/1' as const;

export interface RngState {
  readonly contract: typeof SHUFFLE_CONTRACT;
  readonly s: readonly [number, number, number, number];
}

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function splitmix32(seed: number): [number, number, number, number] {
  let x = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    out.push((z ^ (z >>> 16)) >>> 0);
  }
  return out as [number, number, number, number];
}

function step(s: readonly [number, number, number, number]): {
  value: number;
  s: [number, number, number, number];
} {
  let [a, b, c, d] = s;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) >>> 0;
  return { value: t >>> 0, s: [a >>> 0, b >>> 0, c >>> 0, d] };
}

export function seedRng(seed: number | string): RngState {
  if (typeof seed === 'number' && (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)) {
    throw new RangeError('Numeric seed must be a uint32');
  }
  let s = typeof seed === 'string' ? cyrb128(seed) : splitmix32(seed);
  for (let i = 0; i < 12; i++) s = step(s).s;
  return { contract: SHUFFLE_CONTRACT, s };
}

export function isRngState(x: unknown): x is RngState {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as { contract?: unknown; s?: unknown };
  return (
    r.contract === SHUFFLE_CONTRACT &&
    Array.isArray(r.s) &&
    r.s.length === 4 &&
    r.s.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
  );
}

export function nextUint32(state: RngState): { value: number; state: RngState } {
  const r = step(state.s);
  return { value: r.value, state: { contract: SHUFFLE_CONTRACT, s: r.s } };
}

/** Uniform integer in [0, n). n must be an integer in [1, 2^32]. */
export function randomInt(state: RngState, n: number): { value: number; state: RngState } {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError(`randomInt bound ${n}`);
  const limit = Math.floor(0x100000000 / n) * n;
  let st = state;
  for (;;) {
    const r = nextUint32(st);
    st = r.state;
    if (r.value < limit) return { value: r.value % n, state: st };
  }
}

/** Pure Fisher–Yates shuffle. Returns a new array; input is not modified. */
export function shuffle<T>(items: readonly T[], state: RngState): { items: T[]; state: RngState } {
  const out = items.slice();
  let st = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = randomInt(st, i + 1);
    st = r.state;
    const j = r.value;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return { items: out, state: st };
}
