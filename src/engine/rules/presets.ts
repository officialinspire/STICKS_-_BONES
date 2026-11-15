/**
 * Versioned rules presets.
 *
 * "Cousin's House Rules" are STICKS & BONES' chosen defaults. Dominoes rules
 * vary by region, family and table; these are not presented as the only
 * correct Puerto Rican rules. See docs/RULES.md for prose and sources.
 *
 * Presets are data. The engine must read behaviour from these fields rather
 * than branching on the mode id, so a future preset (or version) can change a
 * rule without touching engine code. Never mutate a published version: add a
 * new version and keep the old one for saved games.
 */
import type { ModeId, SeatIndex, TargetScore } from '../types';

/** What happens to tiles that are not dealt. */
export type StockRule =
  | { readonly kind: 'boneyard'; readonly size: number }
  | { readonly kind: 'unused'; readonly size: number }
  | { readonly kind: 'none'; readonly size: 0 };

/** What a seat does when it holds no legal move. */
export type NoMoveRule =
  /** Draw one at a time until a drawn tile is playable or the boneyard is empty; must play a playable drawn tile that turn; pass only when the boneyard is empty. */
  | { readonly kind: 'draw-until-playable'; readonly mustPlayDrawnTile: true; readonly passOnlyWhenBoneyardEmpty: true }
  | { readonly kind: 'pass' };

/** Who opens a hand and with what. */
export type OpeningRule =
  /** Highest double dealt; if no seat holds a double, the highest pip-total tile, ties by higher end. Must lead that tile. */
  | { readonly kind: 'highest-double-else-heaviest'; readonly mustLeadSelectedTile: true }
  /** Holder of the double-six must lead it. */
  | { readonly kind: 'double-six-holder'; readonly mustLeadSelectedTile: true }
  /** Winner of the previous hand; any tile. */
  | { readonly kind: 'previous-winner'; readonly anyTile: true }
  /** The seat after the previous hand's opener, in turn order; any tile. */
  | { readonly kind: 'rotate-from-previous-opener'; readonly anyTile: true }
  /** The seat that emptied its hand; any tile. */
  | { readonly kind: 'seat-that-went-out'; readonly anyTile: true }
  /** Lower-pip member of the winning team; tied members resolved by the earliest in turn order starting from the previous opener; any tile. */
  | {
      readonly kind: 'lowest-member-of-winning-team';
      readonly tieBreak: 'earliest-in-turn-order-from-previous-opener';
      readonly anyTile: true;
    };

export interface OpeningRules {
  readonly firstHand: OpeningRule;
  readonly afterOut: OpeningRule;
  readonly afterBlockWin: OpeningRule;
  readonly afterBlockTie: OpeningRule;
}

/** Points awarded for a hand. */
export type PointsRule =
  /** Sum of every pip still in every hand (the winner's own included, when any). */
  | 'all-remaining-hand-pips'
  /** Sum of pips in opposing hands only. */
  | 'opponent-hand-pips'
  /** Opposing pips minus the winner's own pips. */
  | 'opponent-minus-own-pips';

export interface ScoringRules {
  /** Points when a seat empties its hand. */
  readonly out: PointsRule;
  /** How a blocked hand's winner is decided. */
  readonly blockWinner: 'lowest-seat-pips' | 'lowest-team-pips';
  /** Points for the winner of a blocked hand. */
  readonly blockWin: PointsRule;
  /** Points when a blocked hand is tied. */
  readonly blockTie: 'zero';
  /** Bonuses are off in v1 (no capicú, chuchazo, forced-pass bonus, or forced redeal). */
  readonly bonuses: readonly [];
  /** Scoring is resolved exactly once per hand. */
  readonly resolveOncePerHand: true;
}

export interface ModeRules {
  readonly mode: ModeId;
  readonly name: string;
  readonly summary: string;
  readonly seatCount: 2 | 4;
  readonly tilesPerSeat: number;
  readonly stock: StockRule;
  /** Each inner array is one side; partners share a side. Every seat appears exactly once. */
  readonly teams: readonly (readonly SeatIndex[])[];
  /** Seat order of play: next = (seat + 1) % seatCount. */
  readonly turnOrder: readonly SeatIndex[];
  readonly turnDirection: 'counterclockwise';
  readonly mustPlayWhenAble: true;
  readonly noMove: NoMoveRule;
  readonly opening: OpeningRules;
  readonly scoring: ScoringRules;
  readonly target: { readonly default: TargetScore; readonly allowed: readonly TargetScore[] };
}

export interface SharedRules {
  readonly set: 'double-six';
  readonly tileCount: 28;
  readonly blankValue: 0;
  /** Doubles are placed crosswise but are never spinners: the line always has exactly two open ends. */
  readonly doubles: { readonly orientation: 'crosswise'; readonly spinner: false };
  readonly openEnds: 2;
  readonly handEnds: readonly ['out', 'blocked'];
}

export interface RulesPreset {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly disclaimer: string;
  readonly shared: SharedRules;
  readonly modes: { readonly [M in ModeId]: ModeRules & { readonly mode: M } };
}

const SHARED: SharedRules = {
  set: 'double-six',
  tileCount: 28,
  blankValue: 0,
  doubles: { orientation: 'crosswise', spinner: false },
  openEnds: 2,
  handEnds: ['out', 'blocked'],
};

const NO_BONUSES: readonly [] = [];

export const COUSINS_HOUSE_RULES_V1: RulesPreset = {
  id: 'cousins-house-rules',
  version: 1,
  name: "Cousin's House Rules",
  disclaimer:
    "Dominoes rules vary across Puerto Rico and between families. These are Cousin's House Rules — the defaults at this table, not the only correct way to play.",
  shared: SHARED,
  modes: {
    draw2: {
      mode: 'draw2',
      name: 'Draw',
      summary: 'Two players, seven tiles each, 14 in the boneyard. Draw when you cannot play.',
      seatCount: 2,
      tilesPerSeat: 7,
      stock: { kind: 'boneyard', size: 14 },
      teams: [[0], [1]],
      turnOrder: [0, 1],
      turnDirection: 'counterclockwise',
      mustPlayWhenAble: true,
      noMove: { kind: 'draw-until-playable', mustPlayDrawnTile: true, passOnlyWhenBoneyardEmpty: true },
      opening: {
        firstHand: { kind: 'highest-double-else-heaviest', mustLeadSelectedTile: true },
        afterOut: { kind: 'previous-winner', anyTile: true },
        afterBlockWin: { kind: 'previous-winner', anyTile: true },
        afterBlockTie: { kind: 'highest-double-else-heaviest', mustLeadSelectedTile: true },
      },
      scoring: {
        out: 'all-remaining-hand-pips',
        blockWinner: 'lowest-seat-pips',
        blockWin: 'all-remaining-hand-pips',
        blockTie: 'zero',
        bonuses: NO_BONUSES,
        resolveOncePerHand: true,
      },
      target: { default: 100, allowed: [100, 200] },
    },
    block2: {
      mode: 'block2',
      name: 'Block',
      summary: 'Two players, seven tiles each, 14 set aside unused. No drawing — pass when you cannot play.',
      seatCount: 2,
      tilesPerSeat: 7,
      stock: { kind: 'unused', size: 14 },
      teams: [[0], [1]],
      turnOrder: [0, 1],
      turnDirection: 'counterclockwise',
      mustPlayWhenAble: true,
      noMove: { kind: 'pass' },
      opening: {
        firstHand: { kind: 'highest-double-else-heaviest', mustLeadSelectedTile: true },
        afterOut: { kind: 'rotate-from-previous-opener', anyTile: true },
        afterBlockWin: { kind: 'rotate-from-previous-opener', anyTile: true },
        afterBlockTie: { kind: 'rotate-from-previous-opener', anyTile: true },
      },
      scoring: {
        out: 'opponent-hand-pips',
        blockWinner: 'lowest-seat-pips',
        blockWin: 'opponent-minus-own-pips',
        blockTie: 'zero',
        bonuses: NO_BONUSES,
        resolveOncePerHand: true,
      },
      target: { default: 100, allowed: [100, 200] },
    },
    partnership4: {
      mode: 'partnership4',
      name: 'Partnership',
      summary: 'Four players in two teams (partners sit opposite), seven tiles each, no boneyard.',
      seatCount: 4,
      tilesPerSeat: 7,
      stock: { kind: 'none', size: 0 },
      teams: [
        [0, 2],
        [1, 3],
      ],
      turnOrder: [0, 1, 2, 3],
      turnDirection: 'counterclockwise',
      mustPlayWhenAble: true,
      noMove: { kind: 'pass' },
      opening: {
        firstHand: { kind: 'double-six-holder', mustLeadSelectedTile: true },
        afterOut: { kind: 'seat-that-went-out', anyTile: true },
        afterBlockWin: {
          kind: 'lowest-member-of-winning-team',
          tieBreak: 'earliest-in-turn-order-from-previous-opener',
          anyTile: true,
        },
        afterBlockTie: { kind: 'double-six-holder', mustLeadSelectedTile: true },
      },
      scoring: {
        out: 'all-remaining-hand-pips',
        blockWinner: 'lowest-team-pips',
        blockWin: 'all-remaining-hand-pips',
        blockTie: 'zero',
        bonuses: NO_BONUSES,
        resolveOncePerHand: true,
      },
      target: { default: 200, allowed: [100, 200] },
    },
  },
};

export const DEFAULT_RULES_PRESET = COUSINS_HOUSE_RULES_V1;

/** All published presets, keyed `${id}@${version}`. */
export const RULES_PRESETS: Readonly<Record<string, RulesPreset>> = Object.freeze({
  [`${COUSINS_HOUSE_RULES_V1.id}@${COUSINS_HOUSE_RULES_V1.version}`]: COUSINS_HOUSE_RULES_V1,
});

export function getRulesPreset(id: string, version: number): RulesPreset | null {
  return RULES_PRESETS[`${id}@${version}`] ?? null;
}

/**
 * Structural self-check for a preset. Returns a list of problems (empty = OK).
 * Run by the test suite for every published preset.
 */
export function checkPresetConsistency(preset: RulesPreset): string[] {
  const problems: string[] = [];
  for (const rules of Object.values(preset.modes)) {
    const tag = `${preset.id}@${preset.version}/${rules.mode}`;
    const dealt = rules.seatCount * rules.tilesPerSeat;
    if (dealt + rules.stock.size !== preset.shared.tileCount)
      problems.push(`${tag}: ${dealt} dealt + ${rules.stock.size} stock != ${preset.shared.tileCount}`);
    if (rules.stock.kind === 'boneyard' && rules.noMove.kind !== 'draw-until-playable')
      problems.push(`${tag}: boneyard without a draw rule`);
    if (rules.stock.kind !== 'boneyard' && rules.noMove.kind === 'draw-until-playable')
      problems.push(`${tag}: draw rule without a boneyard`);
    const seats = rules.teams.flat();
    const expected = Array.from({ length: rules.seatCount }, (_, i) => i);
    if (seats.length !== rules.seatCount || [...seats].sort().some((s, i) => s !== expected[i]))
      problems.push(`${tag}: teams must cover seats 0..${rules.seatCount - 1} exactly once`);
    if (rules.turnOrder.length !== rules.seatCount || rules.turnOrder.some((s, i) => s !== i))
      problems.push(`${tag}: turn order must be 0..${rules.seatCount - 1}`);
    if (!rules.target.allowed.includes(rules.target.default))
      problems.push(`${tag}: default target not in allowed targets`);
    if (rules.opening.firstHand.kind === 'double-six-holder' && rules.stock.size !== 0)
      problems.push(`${tag}: double-six holder opening needs every tile dealt`);
    if (rules.scoring.blockWinner === 'lowest-team-pips' && rules.teams.every((t) => t.length === 1))
      problems.push(`${tag}: team scoring without teams`);
  }
  return problems;
}
