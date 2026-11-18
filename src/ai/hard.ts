/**
 * Hard: determinized Monte Carlo ("perfect-information Monte Carlo").
 * It samples HARD_WORLDS guesses of the unknown tiles consistent with public
 * evidence, plays every legal move out to the end of the hand in each guess
 * with a greedy rollout for all seats, and picks the move with the best
 * average result for its side. Bounded: worlds × moves × ≤400 plies.
 * It is a sampling search over guessed worlds, not an exact solver.
 */
import { forcedDecision } from './forced';
import { inferKnowledge } from './knowledge';
import { normalContext, normalScore } from './normal';
import { rollout } from './rollout';
import { sampleWorld } from './sampler';
import type { Policy } from './types';
import type { TileId } from '../engine/types';

export const HARD_WORLDS = 64;

export const hardPolicy: Policy = (obs, rng) => {
  const forced = forcedDecision(obs, rng);
  if (forced) return forced;
  const k = inferKnowledge(obs);
  const totals = obs.legal.map(() => 0);
  let st = rng;
  let relaxedWorlds = 0;
  let plies = 0;
  for (let w = 0; w < HARD_WORLDS; w++) {
    const sample = sampleWorld(k, st);
    st = sample.rng;
    if (sample.relaxed) relaxedWorlds++;
    const hands: TileId[][] = Array.from({ length: obs.seatCount }, (_, s) => (s === obs.seat ? [...obs.hand] : [...(sample.holdings.get(s as never) ?? [])]));
    const boneyard = obs.boneyardCount > 0 ? (sample.holdings.get('stock') ?? []).slice(0, obs.boneyardCount) : [];
    obs.legal.forEach((m, i) => {
      const r = rollout(obs, { hands, boneyard }, m);
      totals[i]! += r.value;
      plies += r.plies;
    });
  }
  // Ties (common when many lines are equal) fall back to the Normal heuristic.
  const ctx = normalContext(obs);
  let best = 0;
  let bestScore = -Infinity;
  obs.legal.forEach((m, i) => {
    const sc = totals[i]! / HARD_WORLDS + normalScore(obs, m, ctx) * 1e-3;
    if (sc > bestScore) {
      best = i;
      bestScore = sc;
    }
  });
  const m = obs.legal[best]!;
  return {
    action: { type: 'play', tile: m.tile, end: m.end },
    rng: st,
    method: `hard: Monte Carlo over ${HARD_WORLDS} sampled worlds`,
    stats: { worlds: HARD_WORLDS, relaxedWorlds, rolloutPlies: plies },
  };
};
