/**
 * The ONLY input an AI policy receives. Built from a SeatView (which is
 * already redacted by the engine) plus the public preset rules, then deep
 * copied and frozen so a policy can never reach back into match state.
 *
 * Contains: own hand, the public chain and open ends, this hand's public
 * action log (plays, passes, and who drew — never which tile), tile counts,
 * mode/team information, scores. It never contains other hands, undealt or
 * set-aside tiles, boneyard order, the shuffle seed or engine RNG state.
 */
import type { VisibleRequirement } from '../engine/events';
import type { EndId, OpenEnds } from '../engine/line';
import type { ModeRules, OpeningRule } from '../engine/rules/presets';
import type { PublicAction } from '../engine/state';
import type { Pip, SeatIndex, TileId } from '../engine/types';
import type { SeatView } from '../engine/view';

export const OBSERVATION_VERSION = 1;

export interface ObservedMove {
  readonly tile: TileId;
  readonly end: EndId;
  readonly headPip: Pip;
  readonly tailPip: Pip;
}

export interface ObservedTile {
  readonly tile: TileId;
  readonly headPip: Pip;
  readonly tailPip: Pip;
  readonly seat: SeatIndex;
  readonly playIndex: number;
}

export interface AiObservation {
  readonly version: typeof OBSERVATION_VERSION;
  readonly seat: SeatIndex;
  readonly seatCount: 2 | 4;
  readonly teams: readonly (readonly SeatIndex[])[];
  readonly myTeam: number;
  readonly partner: SeatIndex | null;
  /** Public preset rules for this mode (plain data). */
  readonly rules: ModeRules;
  readonly handNumber: number;
  readonly hand: readonly TileId[];
  readonly legal: readonly ObservedMove[];
  /** True only when the rules require a draw now (no legal move, boneyard not empty). */
  readonly mustDraw: boolean;
  readonly line: readonly ObservedTile[];
  readonly openEnds: OpenEnds | null;
  readonly openingRule: OpeningRule['kind'];
  readonly requirement: VisibleRequirement;
  readonly opener: SeatIndex;
  readonly handSizes: readonly number[];
  readonly boneyardCount: number;
  /** Count (only) of tiles set aside unused, e.g. 14 in Block. */
  readonly unusedCount: number;
  readonly history: readonly PublicAction[];
  readonly scores: readonly number[];
  readonly targetScore: number;
}

/** Every key an observation may carry. Tests assert nothing else leaks in. */
export const OBSERVATION_KEYS: readonly (keyof AiObservation)[] = [
  'version',
  'seat',
  'seatCount',
  'teams',
  'myTeam',
  'partner',
  'rules',
  'handNumber',
  'hand',
  'legal',
  'mustDraw',
  'line',
  'openEnds',
  'openingRule',
  'requirement',
  'opener',
  'handSizes',
  'boneyardCount',
  'unusedCount',
  'history',
  'scores',
  'targetScore',
];

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function buildObservation(view: SeatView, rules: ModeRules): AiObservation {
  if (view.phase !== 'playing' || view.turn !== view.viewer) throw new Error('AI observations are only built for the seat on turn');
  const team = view.teams[view.myTeam]!;
  const partner = team.find((s) => s !== view.viewer) ?? null;
  const obs: AiObservation = {
    version: OBSERVATION_VERSION,
    seat: view.viewer,
    seatCount: view.seatCount,
    teams: view.teams,
    myTeam: view.myTeam,
    partner,
    rules,
    handNumber: view.handNumber,
    hand: view.myHand,
    legal: view.legalMoves.map((m) => ({ tile: m.tile, end: m.end, headPip: m.headPip, tailPip: m.tailPip })),
    mustDraw: view.legalMoves.length === 0 && rules.noMove.kind === 'draw-until-playable' && view.boneyardCount > 0,
    line: view.line.tiles.map((t) => ({ tile: t.tile, headPip: t.headPip, tailPip: t.tailPip, seat: t.seat, playIndex: t.playIndex })),
    openEnds: view.openEnds,
    openingRule: view.openingRule,
    requirement: view.requirement,
    opener: view.opener,
    handSizes: view.handSizes,
    boneyardCount: view.boneyardCount,
    unusedCount: rules.stock.kind === 'unused' ? rules.stock.size : 0,
    history: view.log,
    scores: view.scores,
    targetScore: view.targetScore,
  };
  // A structured copy severs every reference into engine state; freezing makes it read-only.
  return deepFreeze(JSON.parse(JSON.stringify(obs)) as AiObservation);
}
