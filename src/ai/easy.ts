/**
 * Easy: a weighted random choice among legal moves. Slight preference for
 * heavier tiles and doubles; one move in five is picked uniformly. No lookahead.
 */
import { randomInt } from '../engine/rng';
import { tileFromId } from '../engine/tiles';
import type { Policy } from './types';
import { forcedDecision } from './forced';

export const easyPolicy: Policy = (obs, rng) => {
  const forced = forcedDecision(obs, rng);
  if (forced) return forced;
  const r0 = randomInt(rng, 5);
  if (r0.value === 0) {
    const r = randomInt(r0.state, obs.legal.length);
    const m = obs.legal[r.value]!;
    return { action: { type: 'play', tile: m.tile, end: m.end }, rng: r.state, method: 'easy: uniform pick' };
  }
  // Weights in tenths so the draw stays integral and deterministic.
  const weights = obs.legal.map((m) => {
    const t = tileFromId(m.tile);
    return 10 + (t.high + t.low) + (t.high === t.low ? 5 : 0);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const r = randomInt(r0.state, total);
  let acc = 0;
  let i = 0;
  for (; i < weights.length; i++) {
    acc += weights[i]!;
    if (r.value < acc) break;
  }
  const m = obs.legal[Math.min(i, obs.legal.length - 1)]!;
  return { action: { type: 'play', tile: m.tile, end: m.end }, rng: r.state, method: 'easy: weighted random (pips, doubles)' };
};
