/**
 * Plain pip arithmetic for the results sheet, derived from the hand result and
 * the preset's scoring rules (never re-scored independently: the final number
 * always equals result.points, which tests verify across simulated hands).
 */
import type { ModeRules } from '../engine/rules/presets';
import type { HandResult } from '../engine/state';
import { tileFromId } from '../engine/tiles';
import type { SeatIndex, TileId } from '../engine/types';

export interface Explanation {
  /** One line per seat: its remaining tiles and their pip sum. */
  readonly hands: readonly string[];
  /** For team games: each side's combined pips. */
  readonly teams: readonly string[];
  /** Who won and why. */
  readonly decision: string;
  /** The points sum, ending in "= <points>". */
  readonly points: string;
  /** The final number shown in `points` (must equal result.points). */
  readonly value: number;
}

const tilePips = (id: TileId) => {
  const t = tileFromId(id);
  return { label: `${t.high}|${t.low}`, pips: t.high + t.low };
};

export function handLine(name: string, tiles: readonly TileId[]): string {
  if (!tiles.length) return `${name}: no tiles left = 0`;
  const parts = tiles.map(tilePips);
  const total = parts.reduce((a, p) => a + p.pips, 0);
  if (parts.length === 1) return `${name}: ${parts[0]!.label} (${parts[0]!.pips}) = ${total}`;
  return `${name}: ${parts.map((p) => `${p.label} (${p.pips})`).join(' + ')} = ${total}`;
}

export function explainResult(r: HandResult, rules: ModeRules, name: (s: SeatIndex) => string, team: (t: number) => string): Explanation {
  const seats = r.finalHands.map((_, s) => s as SeatIndex);
  const hands = seats.map((s) => handLine(name(s), r.finalHands[s]!));
  const teamGame = rules.teams.some((t) => t.length > 1);
  const teams = teamGame ? rules.teams.map((t, i) => `${team(i)}: ${t.map((s) => r.seatTotals[s]).join(' + ')} = ${r.teamTotals[i]}`) : [];
  const sideTotal = (i: number) => r.teamTotals[i]!;
  const sideName = (i: number) => (teamGame ? team(i) : name(rules.teams[i]![0]!));
  const all = r.teamTotals.reduce((a, b) => a + b, 0);

  if (r.winnerTeam === null) {
    const vs = rules.teams.map((_, i) => `${sideName(i)} ${sideTotal(i)}`).join(' vs ');
    return { hands, teams, decision: `Blocked and tied: ${vs}.`, points: 'No points this hand = 0', value: 0 };
  }
  const w = r.winnerTeam;
  const others = rules.teams.map((_, i) => i).filter((i) => i !== w);
  const rule = r.end.kind === 'out' ? rules.scoring.out : rules.scoring.blockWin;
  const decision =
    r.end.kind === 'out'
      ? `${name(r.end.seat)} went out first, so ${sideName(w)} ${teamGame ? 'win' : name(r.end.seat) === 'You' ? 'win' : 'wins'} the hand.`
      : `Blocked: ${rules.teams.map((_, i) => `${sideName(i)} ${sideTotal(i)}`).join(' vs ')} — fewer pips wins.`;
  let points: string;
  let value: number;
  switch (rule) {
    case 'all-remaining-hand-pips':
      value = all;
      points = `Every pip left: ${rules.teams.map((_, i) => sideTotal(i)).join(' + ')} = ${value}`;
      break;
    case 'opponent-hand-pips':
      value = others.reduce((a, i) => a + sideTotal(i), 0);
      points = `Opponent’s pips: ${others.map((i) => sideTotal(i)).join(' + ')} = ${value}`;
      break;
    case 'opponent-minus-own-pips': {
      const opp = others.reduce((a, i) => a + sideTotal(i), 0);
      value = Math.max(0, opp - sideTotal(w));
      points = `Opponent’s pips minus own: ${opp} − ${sideTotal(w)} = ${value}`;
      break;
    }
  }
  return { hands, teams, decision, points, value };
}
