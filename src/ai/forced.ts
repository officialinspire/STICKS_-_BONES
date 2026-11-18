import type { RngState } from '../engine/rng';
import type { AiObservation } from './observation';
import type { Decision } from './types';

/** Draw / pass / single legal move need no thinking at any difficulty. */
export function forcedDecision(obs: AiObservation, rng: RngState): Decision | null {
  if (obs.legal.length === 0) return { action: obs.mustDraw ? { type: 'draw' } : { type: 'pass' }, rng, method: obs.mustDraw ? 'forced draw' : 'forced pass' };
  if (obs.legal.length === 1) {
    const m = obs.legal[0]!;
    return { action: { type: 'play', tile: m.tile, end: m.end }, rng, method: 'only legal move' };
  }
  return null;
}
