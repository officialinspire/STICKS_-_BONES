import type { ModeRules } from './rules/presets';
import type { SeatIndex } from './types';

/** Next seat in play order (counterclockwise around the table). */
export function nextSeat(rules: Pick<ModeRules, 'seatCount'>, seat: SeatIndex): SeatIndex {
  return ((seat + 1) % rules.seatCount) as SeatIndex;
}

/** Index of the side (team) a seat belongs to. */
export function teamOf(rules: Pick<ModeRules, 'teams'>, seat: SeatIndex): number {
  const t = rules.teams.findIndex((team) => team.includes(seat));
  if (t < 0) throw new Error(`Seat ${seat} not in any team`);
  return t;
}

/**
 * Presentation mapping (not engine logic): where each seat index sits on screen
 * from the bottom seat's point of view. Two-player games use bottom/top.
 */
export type TablePosition = 'bottom' | 'right' | 'top' | 'left';

export function tablePosition(seatCount: 2 | 4, seat: SeatIndex): TablePosition {
  if (seatCount === 2) return seat === 0 ? 'bottom' : 'top';
  return (['bottom', 'right', 'top', 'left'] as const)[seat];
}
