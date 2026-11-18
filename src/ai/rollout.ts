/**
 * Fast hand-completion simulator used by the Hard policy on SAMPLED worlds.
 * It never touches real match state: the worlds it plays out are guesses
 * generated from public evidence (see sampler.ts).
 */
import type { HandEnd } from '../engine/state';
import type { ModeRules } from '../engine/rules/presets';
import { scoreHand } from '../engine/scoring';
import type { Pip, SeatIndex, TileId } from '../engine/types';
import { pipsOf } from './knowledge';
import type { AiObservation, ObservedMove } from './observation';

export interface World {
  /** hands[seat]: my real hand for my seat, sampled hands for the others. */
  readonly hands: readonly (readonly TileId[])[];
  /** Sampled boneyard in a sampled draw order (empty when the mode has no boneyard). */
  readonly boneyard: readonly TileId[];
}

const MAX_PLIES = 400;

/** Rollout policy: shed pips and doubles, keep a follow-up play. Cheap by design. */
function greedyPick(hand: readonly TileId[], ends: { head: Pip; tail: Pip }): { tile: TileId; end: 'head' | 'tail' } | null {
  let best: { tile: TileId; end: 'head' | 'tail'; score: number } | null = null;
  for (const t of hand) {
    const [a, b] = pipsOf(t);
    for (const end of ['head', 'tail'] as const) {
      const p = ends[end];
      if (a !== p && b !== p) continue;
      const left = (a === p ? b : a) as Pip;
      const other = end === 'head' ? ends.tail : ends.head;
      let follow = 0;
      for (const x of hand) {
        if (x === t) continue;
        const [c, d] = pipsOf(x);
        if (c === left || d === left || c === other || d === other) follow++;
      }
      const score = a + b + (a === b ? 3 : 0) + Math.min(follow, 3) * 1.5;
      if (!best || score > best.score) best = { tile: t, end, score };
    }
  }
  return best;
}

/** Play `first` for the observing seat, then finish the hand greedily for everyone. Returns my side's net points and the plies used. */
export function rollout(obs: AiObservation, world: World, first: ObservedMove): { value: number; plies: number } {
  const rules: ModeRules = obs.rules;
  const hands = world.hands.map((h) => [...h]);
  const boneyard = [...world.boneyard];
  const canDraw = rules.noMove.kind === 'draw-until-playable';
  const n = obs.seatCount;
  const remove = (seat: number, t: TileId) => hands[seat]!.splice(hands[seat]!.indexOf(t), 1);
  remove(obs.seat, first.tile);
  let ends: { head: Pip; tail: Pip } = obs.openEnds
    ? first.end === 'head'
      ? { head: first.headPip, tail: obs.openEnds.tail }
      : { head: obs.openEnds.head, tail: first.tailPip }
    : { head: first.headPip, tail: first.tailPip };
  let end: HandEnd | null = hands[obs.seat]!.length === 0 ? { kind: 'out', seat: obs.seat } : null;
  let turn = (obs.seat + 1) % n;
  let passes = 0;
  let plies = 0;
  while (!end && plies < MAX_PLIES) {
    plies++;
    const pick = greedyPick(hands[turn]!, ends);
    if (pick) {
      const [a, b] = pipsOf(pick.tile);
      const matched = ends[pick.end];
      const other = (a === matched ? b : a) as Pip;
      ends = pick.end === 'head' ? { head: other, tail: ends.tail } : { head: ends.head, tail: other };
      remove(turn, pick.tile);
      passes = 0;
      if (hands[turn]!.length === 0) end = { kind: 'out', seat: turn as SeatIndex };
      else turn = (turn + 1) % n;
    } else if (canDraw && boneyard.length) {
      hands[turn]!.push(boneyard.shift()!);
    } else {
      passes++;
      if (passes >= n) end = { kind: 'blocked' };
      else turn = (turn + 1) % n;
    }
  }
  if (!end) return { value: 0, plies };
  const s = scoreHand(rules, hands, end, obs.opener);
  const value = s.winnerTeam === null ? 0 : s.winnerTeam === obs.myTeam ? s.points : -s.points;
  return { value, plies };
}
