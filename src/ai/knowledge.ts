/**
 * Public-information inference shared by the Normal and Hard policies.
 * Everything here is derived from an AiObservation only.
 */
import { CANONICAL_TILE_IDS, compareOpeningStrength, tileFromId } from '../engine/tiles';
import type { Pip, SeatIndex, TileId } from '../engine/types';
import type { AiObservation } from './observation';

export type Holder = SeatIndex | 'stock';

export interface PublicKnowledge {
  /** Tiles not in my hand and not on the table: held by other seats or in the stock. */
  readonly unknown: readonly TileId[];
  /** Other seats and the stock, with how many unknown tiles each holds. */
  readonly holders: readonly { readonly id: Holder; readonly size: number }[];
  /** Pips each seat is known not to hold (it passed while they were open). */
  readonly voids: Readonly<Record<number, readonly Pip[]>>;
  /** Specific tiles a seat cannot hold (from the opening rule). */
  readonly excluded: Readonly<Record<number, readonly TileId[]>>;
}

export function pipsOf(id: TileId): [Pip, Pip] {
  const t = tileFromId(id);
  return [t.high, t.low];
}

export function inferKnowledge(obs: AiObservation): PublicKnowledge {
  const seen = new Set<string>([...obs.hand, ...obs.line.map((t) => t.tile)]);
  const unknown = CANONICAL_TILE_IDS.filter((t) => !seen.has(t));
  const holders: { id: Holder; size: number }[] = [];
  for (let s = 0; s < obs.seatCount; s++) if (s !== obs.seat) holders.push({ id: s as SeatIndex, size: obs.handSizes[s]! });
  const stockSize = obs.boneyardCount + obs.unusedCount;
  if (stockSize > 0) holders.push({ id: 'stock', size: stockSize });

  // A pass is only allowed with no legal move and (in Draw) an empty boneyard,
  // and hands never grow afterwards, so a pass proves a permanent void.
  const voids: Record<number, Pip[]> = {};
  for (const a of obs.history) {
    if (a.kind !== 'pass' || !a.endsAtPass) continue;
    const set = new Set(voids[a.seat] ?? []);
    set.add(a.endsAtPass.head as Pip);
    set.add(a.endsAtPass.tail as Pip);
    voids[a.seat] = [...set].sort();
  }

  // "Highest double, else heaviest tile" opening: every tile stronger than the
  // one led was in no dealt hand. A seat that has not drawn since cannot hold it.
  const excluded: Record<number, TileId[]> = {};
  const first = obs.history[0];
  if (obs.openingRule === 'highest-double-else-heaviest' && first?.kind === 'play') {
    const led = tileFromId(first.tile);
    const stronger = unknown.filter((t) => compareOpeningStrength(tileFromId(t), led) > 0);
    for (let s = 0; s < obs.seatCount; s++) {
      if (s === obs.seat) continue;
      const drew = obs.history.some((a) => a.kind === 'draw' && a.seat === s);
      if (!drew && stronger.length) excluded[s] = stronger;
    }
  }
  return { unknown, holders, voids, excluded };
}

/** Holders that may hold `tile` given the public evidence. */
export function allowedHolders(k: PublicKnowledge, tile: TileId): Holder[] {
  const [a, b] = pipsOf(tile);
  return k.holders
    .filter((h) => {
      if (h.id === 'stock') return true;
      const v = k.voids[h.id];
      if (v && (v.includes(a) || v.includes(b))) return false;
      return !(k.excluded[h.id]?.includes(tile) ?? false);
    })
    .map((h) => h.id);
}

/** Unseen copies (from my point of view) of each pip value. */
export function unseenPipCounts(obs: AiObservation): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const t of inferKnowledge(obs).unknown) {
    const [a, b] = pipsOf(t);
    counts[a]!++;
    if (b !== a) counts[b]!++;
  }
  return counts;
}
