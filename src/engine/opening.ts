/**
 * Opener selection, driven entirely by the preset's OpeningRule data.
 */
import type { ModeRules, OpeningRule } from './rules/presets';
import { nextSeat } from './seats';
import type { HandResult, OpeningRequirement } from './state';
import { compareOpeningStrength, tileFromId } from './tiles';
import type { SeatIndex, TileId } from './types';

export interface OpenerChoice {
  readonly seat: SeatIndex;
  readonly requirement: OpeningRequirement;
  readonly rule: OpeningRule['kind'];
}

export interface PreviousHand {
  readonly result: HandResult;
  readonly opener: SeatIndex;
}

/** Which opening rule applies to the next hand. */
export function openingRuleFor(rules: ModeRules, previous: PreviousHand | null): OpeningRule {
  if (!previous) return rules.opening.firstHand;
  if (previous.result.end.kind === 'out') return rules.opening.afterOut;
  return previous.result.winnerTeam === null ? rules.opening.afterBlockTie : rules.opening.afterBlockWin;
}

/**
 * Lowest-total seat among `members`; ties go to the member reached first when
 * walking turn order from `startSeat` (inclusive).
 */
export function lowestMember(
  rules: Pick<ModeRules, 'seatCount'>,
  members: readonly SeatIndex[],
  totals: readonly number[],
  startSeat: SeatIndex,
): SeatIndex {
  let best: SeatIndex | null = null;
  let seat = startSeat;
  for (let i = 0; i < rules.seatCount; i++) {
    if (members.includes(seat) && (best === null || totals[seat]! < totals[best]!)) best = seat;
    seat = nextSeat(rules, seat);
  }
  if (best === null) throw new Error('lowestMember: no members');
  return best;
}

function strongestDealtTile(hands: readonly (readonly TileId[])[]): { seat: SeatIndex; tile: TileId } {
  let best: { seat: SeatIndex; tile: TileId } | null = null;
  hands.forEach((hand, seat) => {
    for (const id of hand) {
      if (!best || compareOpeningStrength(tileFromId(id), tileFromId(best.tile)) > 0) best = { seat: seat as SeatIndex, tile: id };
    }
  });
  if (!best) throw new Error('No tiles dealt');
  return best;
}

export function selectOpener(
  rules: ModeRules,
  hands: readonly (readonly TileId[])[],
  previous: PreviousHand | null,
): OpenerChoice {
  const rule = openingRuleFor(rules, previous);
  const any: OpeningRequirement = { kind: 'any' };
  const need = (what: string): PreviousHand => {
    if (!previous) throw new Error(`Opening rule ${rule.kind} needs a previous hand (${what})`);
    return previous;
  };
  switch (rule.kind) {
    case 'highest-double-else-heaviest': {
      const { seat, tile } = strongestDealtTile(hands);
      return { seat, requirement: { kind: 'tile', tile }, rule: rule.kind };
    }
    case 'double-six-holder': {
      const seat = hands.findIndex((h) => h.includes('t66'));
      if (seat < 0) throw new Error('double-six-holder: t66 was not dealt');
      return { seat: seat as SeatIndex, requirement: { kind: 'tile', tile: 't66' }, rule: rule.kind };
    }
    case 'previous-winner': {
      const seat = need('winner').result.winnerSeat;
      if (seat === null) throw new Error('previous-winner after a tie');
      return { seat, requirement: any, rule: rule.kind };
    }
    case 'rotate-from-previous-opener':
      return { seat: nextSeat(rules, need('opener').opener), requirement: any, rule: rule.kind };
    case 'seat-that-went-out': {
      const end = need('out seat').result.end;
      if (end.kind !== 'out') throw new Error('seat-that-went-out after a block');
      return { seat: end.seat, requirement: any, rule: rule.kind };
    }
    case 'lowest-member-of-winning-team': {
      const prev = need('winning team');
      const team = prev.result.winnerTeam;
      if (team === null) throw new Error('lowest-member-of-winning-team after a tie');
      const seat = lowestMember(rules, rules.teams[team]!, prev.result.seatTotals, prev.opener);
      return { seat, requirement: any, rule: rule.kind };
    }
  }
}
