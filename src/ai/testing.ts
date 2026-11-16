/**
 * Test/tournament support (not used by the app): drive whole matches with AI
 * policies on every seat through the real engine command path.
 */
import { createMatchConfig } from '../engine/config';
import { applyCommand, createMatch, rulesOf } from '../engine/match';
import { seedRng, type RngState } from '../engine/rng';
import type { MatchState } from '../engine/state';
import type { ModeId, SeatIndex } from '../engine/types';
import { seatView } from '../engine/view';
import { buildObservation, type AiObservation } from './observation';
import { decide, toCommand } from './policy';
import type { Decision, Difficulty } from './types';

export interface DecisionPoint {
  readonly state: MatchState;
  readonly seat: SeatIndex;
  readonly obs: AiObservation;
  readonly rng: RngState;
}

export interface DriveOptions {
  readonly mode: ModeId;
  readonly dealSeed: string;
  readonly aiSeed: string;
  /** Difficulty per side (index = team). */
  readonly sides: readonly Difficulty[];
  readonly maxHands?: number;
  readonly onDecision?: (p: DecisionPoint, d: Decision) => void;
}

/** Play a match (or `maxHands` hands). Throws if the engine ever rejects an AI command. */
export function driveMatch(o: DriveOptions): { state: MatchState; hands: number; netForSide0: number; decisions: number } {
  const cfg = createMatchConfig({ mode: o.mode, humanSeats: [0] });
  if (!cfg.ok) throw new Error('config');
  const created = createMatch(cfg.config, o.dealSeed);
  if (!created.ok) throw new Error('create');
  let state = created.state;
  const rules = rulesOf(state);
  const rngs = Array.from({ length: rules.seatCount }, (_, s) => seedRng(`ai:${o.aiSeed}:${s}`));
  let hands = 0;
  let net = 0;
  let decisions = 0;
  for (let guard = 0; guard < 50000; guard++) {
    if (state.phase === 'match-over' || (o.maxHands !== undefined && hands >= o.maxHands)) break;
    if (state.phase === 'hand-ended' || state.phase === 'hand-resolved') {
      const r = applyCommand(state, { type: state.phase === 'hand-ended' ? 'resolve-hand' : 'start-next-hand', seq: state.seq });
      if (!r.ok) throw new Error(r.error.code);
      if (state.phase === 'hand-ended') {
        hands++;
        const res = r.state.hand.result!;
        if (res.winnerTeam !== null) net += res.winnerTeam === 0 ? res.points : -res.points;
      }
      state = r.state;
      continue;
    }
    const seat = state.hand.turn;
    const team = rules.teams.findIndex((t) => t.includes(seat));
    const obs = buildObservation(seatView(state, seat), rules);
    const d = decide(o.sides[team]!, obs, rngs[seat]!);
    o.onDecision?.({ state, seat, obs, rng: rngs[seat]! }, d);
    rngs[seat] = d.rng;
    decisions++;
    const r = applyCommand(state, toCommand(d.action, seat, state.seq));
    if (!r.ok) throw new Error(`AI command rejected (${o.mode} ${o.dealSeed}/${o.aiSeed} seat ${seat} ${o.sides[team]}): ${r.error.code} ${JSON.stringify(d.action)}`);
    state = r.state;
  }
  return { state, hands, netForSide0: net, decisions };
}

/** Mirrored duel: every deal is played twice with the sides swapped; returns A's mean points per hand. */
export function mirroredDuel(mode: ModeId, a: Difficulty, b: Difficulty, deals: number, handsPerDeal: number, seed: string): number {
  let net = 0;
  let hands = 0;
  for (let g = 0; g < deals; g++) {
    const x = driveMatch({ mode, dealSeed: `${seed}-${g}`, aiSeed: `${seed}-ai-${g}`, sides: [a, b], maxHands: handsPerDeal });
    const y = driveMatch({ mode, dealSeed: `${seed}-${g}`, aiSeed: `${seed}-ai-${g}`, sides: [b, a], maxHands: handsPerDeal });
    net += x.netForSide0 - y.netForSide0;
    hands += x.hands + y.hands;
  }
  return net / hands;
}
