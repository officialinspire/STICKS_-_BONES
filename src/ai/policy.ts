/** Policy registry and the bridge from an AI decision to an engine command. */
import type { Command } from '../engine/commands';
import type { RngState } from '../engine/rng';
import type { SeatIndex } from '../engine/types';
import { easyPolicy } from './easy';
import { hardPolicy } from './hard';
import { normalPolicy } from './normal';
import type { AiObservation } from './observation';
import type { AiAction, Decision, Difficulty, Policy } from './types';

export const POLICIES: Readonly<Record<Difficulty, Policy>> = { easy: easyPolicy, normal: normalPolicy, hard: hardPolicy };

export function decide(difficulty: Difficulty, obs: AiObservation, rng: RngState): Decision {
  return POLICIES[difficulty](obs, rng);
}

/** AI actions go through exactly the same validated command path as human input. */
export function toCommand(action: AiAction, seat: SeatIndex, seq: number): Command {
  if (action.type === 'play') return { type: 'play', seq, seat, tile: action.tile, end: action.end };
  return { type: action.type, seq, seat };
}
