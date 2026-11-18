/**
 * Samples complete guesses ("worlds") of the unknown tiles that are
 * consistent with public evidence: hand sizes, the stock size, voids proven
 * by passes, and opening-rule exclusions. Uses only the AI's own RNG stream.
 *
 * Constraint-respecting randomized assignment (most-constrained tile first,
 * holder chosen in proportion to remaining capacity). Approximately — not
 * exactly — uniform over consistent worlds; documented as such.
 */
import { randomInt, shuffle, type RngState } from '../engine/rng';
import type { TileId } from '../engine/types';
import { allowedHolders, type Holder, type PublicKnowledge } from './knowledge';

export interface Sample {
  readonly holdings: ReadonlyMap<Holder, readonly TileId[]>;
  /** True if no consistent assignment was found and constraints were dropped. */
  readonly relaxed: boolean;
  readonly rng: RngState;
}

const ATTEMPTS = 40;

export function sampleWorld(k: PublicKnowledge, rng: RngState): Sample {
  let st = rng;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const sh = shuffle(k.unknown, st);
    st = sh.state;
    const order = sh.items.map((t) => ({ t, allowed: allowedHolders(k, t) })).sort((a, b) => a.allowed.length - b.allowed.length);
    const cap = new Map<Holder, number>(k.holders.map((h) => [h.id, h.size] as [Holder, number]));
    const out = new Map<Holder, TileId[]>(k.holders.map((h) => [h.id, []] as [Holder, TileId[]]));
    let ok = true;
    for (const { t, allowed } of order) {
      const cands = allowed.filter((h) => (cap.get(h) ?? 0) > 0);
      if (!cands.length) {
        ok = false;
        break;
      }
      const total = cands.reduce<number>((a, h) => a + cap.get(h)!, 0);
      const r = randomInt(st, total);
      st = r.state;
      let acc = 0;
      let chosen = cands[0]!;
      for (const h of cands) {
        acc += cap.get(h)!;
        if (r.value < acc) {
          chosen = h;
          break;
        }
      }
      out.get(chosen)!.push(t);
      cap.set(chosen, cap.get(chosen)! - 1);
    }
    if (ok) {
      const stock = out.get('stock');
      if (stock) {
        const s2 = shuffle(stock, st);
        st = s2.state;
        out.set('stock', s2.items);
      }
      return { holdings: out, relaxed: false, rng: st };
    }
  }
  // Fallback: ignore the evidence (sizes still respected).
  const sh = shuffle(k.unknown, st);
  const out = new Map<Holder, TileId[]>();
  let i = 0;
  for (const h of k.holders) {
    out.set(h.id, sh.items.slice(i, i + h.size));
    i += h.size;
  }
  return { holdings: out, relaxed: true, rng: sh.state };
}
