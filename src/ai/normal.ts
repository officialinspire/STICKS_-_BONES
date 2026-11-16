/**
 * Normal: a one-ply heuristic (no search). Scores each legal move by pip
 * disposal, doubles, suit coverage of the hand it leaves, opponents' known
 * voids (from public passes), partner support in Partnership, and a
 * pip-count estimate when a move would lock the game.
 */
import { tileFromId } from '../engine/tiles';
import type { Pip, SeatIndex, TileId } from '../engine/types';
import { forcedDecision } from './forced';
import { inferKnowledge, pipsOf, type PublicKnowledge } from './knowledge';
import type { AiObservation, ObservedMove } from './observation';
import type { Policy } from './types';

export interface NormalContext {
  readonly k: PublicKnowledge;
  readonly opponents: readonly SeatIndex[];
  readonly partner: SeatIndex | null;
  readonly partnerPips: ReadonlySet<Pip>;
  readonly avgUnknownPips: number;
}

export function normalContext(obs: AiObservation): NormalContext {
  const k = inferKnowledge(obs);
  const mine = obs.teams[obs.myTeam]!;
  const opponents = Array.from({ length: obs.seatCount }, (_, s) => s as SeatIndex).filter((s) => !mine.includes(s));
  const partnerPips = new Set<Pip>();
  if (obs.partner !== null) for (const a of obs.history) if (a.kind === 'play' && a.seat === obs.partner) pipsOf(a.tile).forEach((p) => partnerPips.add(p));
  const unknownPips = k.unknown.reduce((s, t) => s + pipsOf(t)[0] + pipsOf(t)[1], 0);
  return { k, opponents, partner: obs.partner, partnerPips, avgUnknownPips: k.unknown.length ? unknownPips / k.unknown.length : 0 };
}

export function endsAfter(obs: AiObservation, m: ObservedMove): { head: Pip; tail: Pip } {
  if (!obs.openEnds) return { head: m.headPip, tail: m.tailPip };
  return m.end === 'head' ? { head: m.headPip, tail: obs.openEnds.tail } : { head: obs.openEnds.head, tail: m.tailPip };
}

const pipSum = (ids: readonly TileId[]) => ids.reduce((s, t) => s + pipsOf(t)[0] + pipsOf(t)[1], 0);

export function normalScore(obs: AiObservation, m: ObservedMove, ctx: NormalContext): number {
  const t = tileFromId(m.tile);
  const dbl = t.high === t.low;
  const ends = endsAfter(obs, m);
  const endPips = ends.head === ends.tail ? [ends.head] : [ends.head, ends.tail];
  const rest = obs.hand.filter((id) => id !== m.tile);
  const matches = (id: TileId) => endPips.some((p) => pipsOf(id).includes(p));
  const leaves = obs.openEnds ? (m.end === 'head' ? m.headPip : m.tailPip) : null;

  let s = (t.high + t.low) * 1.0 + (dbl ? 4 : 0);
  // Suit coverage: keep a follow-up play available, favour our strong suit.
  const cover = rest.filter(matches).length;
  s += Math.min(cover, 4) * 1.2;
  if (cover === 0 && rest.length > 0) s -= 3;
  if (leaves !== null) s += rest.filter((id) => pipsOf(id).includes(leaves)).length * 0.6;

  // Opponents' public passes.
  const endgame = ctx.opponents.some((o) => obs.handSizes[o]! <= 2);
  for (const p of endPips) {
    const voidCount = ctx.opponents.filter((o) => ctx.k.voids[o]?.includes(p)).length;
    if (voidCount === ctx.opponents.length) s += endgame ? 6 : 3;
    else if (voidCount > 0) s += endgame ? 3 : 1.5;
    // Partner: don't strand them; support suits they have played.
    if (ctx.partner !== null) {
      if (ctx.k.voids[ctx.partner]?.includes(p)) s -= 2;
      if (ctx.partnerPips.has(p)) s += 0.7;
    }
  }
  if (endgame) s += (t.high + t.low) * 0.5;

  // Would this move lock the game? Then compare pip totals (estimated for unknown hands).
  const playable = ctx.k.unknown.filter(matches).length + rest.filter(matches).length;
  if (obs.openEnds && playable === 0 && rest.length > 0) {
    const myTeam = obs.teams[obs.myTeam]!;
    const mine = pipSum(rest) + myTeam.filter((x) => x !== obs.seat).reduce<number>((a, x) => a + obs.handSizes[x]! * ctx.avgUnknownPips, 0);
    const theirs = ctx.opponents.reduce<number>((a, o) => a + obs.handSizes[o]! * ctx.avgUnknownPips, 0);
    s += mine < theirs ? 8 + (theirs - mine) * 0.5 : -10;
  }
  return s;
}

export const normalPolicy: Policy = (obs, rng) => {
  const forced = forcedDecision(obs, rng);
  if (forced) return forced;
  const ctx = normalContext(obs);
  let best = obs.legal[0]!;
  let bestScore = -Infinity;
  for (const m of obs.legal) {
    const sc = normalScore(obs, m, ctx);
    if (sc > bestScore) {
      best = m;
      bestScore = sc;
    }
  }
  return { action: { type: 'play', tile: best.tile, end: best.end }, rng, method: 'normal: one-ply heuristic' };
};
