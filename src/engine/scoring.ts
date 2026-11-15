/**
 * Hand scoring, driven by the preset's ScoringRules data. Pure; called exactly
 * once per hand by the `resolve-hand` command.
 */
import { lowestMember } from './opening';
import type { ModeRules, PointsRule } from './rules/presets';
import { teamOf } from './seats';
import type { HandEnd } from './state';
import { pipTotal, tileFromId } from './tiles';
import type { SeatIndex, TileId } from './types';

export interface HandScore {
  readonly seatTotals: readonly number[];
  readonly teamTotals: readonly number[];
  readonly winnerTeam: number | null;
  readonly winnerSeat: SeatIndex | null;
  readonly points: number;
}

export function handPips(hand: readonly TileId[]): number {
  return hand.reduce((s, id) => s + pipTotal(tileFromId(id)), 0);
}

function points(rule: PointsRule, winnerTeam: number, teamTotals: readonly number[]): number {
  const all = teamTotals.reduce((a, b) => a + b, 0);
  const own = teamTotals[winnerTeam]!;
  switch (rule) {
    case 'all-remaining-hand-pips':
      return all;
    case 'opponent-hand-pips':
      return all - own;
    case 'opponent-minus-own-pips':
      return Math.max(0, all - own - own);
  }
}

export function scoreHand(
  rules: ModeRules,
  finalHands: readonly (readonly TileId[])[],
  end: HandEnd,
  opener: SeatIndex,
): HandScore {
  const seatTotals = finalHands.map(handPips);
  const teamTotals = rules.teams.map((team) => team.reduce<number>((s, seat) => s + seatTotals[seat]!, 0));

  if (end.kind === 'out') {
    const winnerTeam = teamOf(rules, end.seat);
    return { seatTotals, teamTotals, winnerTeam, winnerSeat: end.seat, points: points(rules.scoring.out, winnerTeam, teamTotals) };
  }

  let winnerTeam: number | null;
  if (rules.scoring.blockWinner === 'lowest-team-pips') {
    const min = Math.min(...teamTotals);
    const lows = teamTotals.flatMap((t, i) => (t === min ? [i] : []));
    winnerTeam = lows.length === 1 ? lows[0]! : null;
  } else {
    const min = Math.min(...seatTotals);
    const lowTeams = new Set(seatTotals.flatMap((t, s) => (t === min ? [teamOf(rules, s as SeatIndex)] : [])));
    winnerTeam = lowTeams.size === 1 ? [...lowTeams][0]! : null;
  }
  if (winnerTeam === null) return { seatTotals, teamTotals, winnerTeam: null, winnerSeat: null, points: 0 };
  const winnerSeat = lowestMember(rules, rules.teams[winnerTeam]!, seatTotals, opener);
  return { seatTotals, teamTotals, winnerTeam, winnerSeat, points: points(rules.scoring.blockWin, winnerTeam, teamTotals) };
}
