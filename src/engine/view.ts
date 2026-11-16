/**
 * Per-seat redacted view: everything a seat may legally know. Fair AI and seat
 * UIs read this instead of MatchState. Other seats' tiles and the stock are
 * reduced to counts until the hand ends (when hands are revealed for scoring).
 */
import { requirementFor, type VisibleRequirement } from './events';
import type { LineState, OpenEnds, Placement } from './line';
import { openEnds } from './line';
import { legalMovesForHand, rulesOf } from './match';
import type { OpeningRule } from './rules/presets';
import type { HandEnd, HandResult, MatchState, Phase, PublicAction } from './state';
import type { ModeId, SeatIndex, TileId } from './types';

export interface SeatView {
  readonly viewer: SeatIndex;
  readonly mode: ModeId;
  readonly seq: number;
  readonly phase: Phase;
  readonly handNumber: number;
  readonly turn: SeatIndex;
  readonly opener: SeatIndex;
  /** The opener's required tile is hidden from other seats until it is played. */
  readonly requirement: VisibleRequirement;
  readonly line: LineState;
  readonly openEnds: OpenEnds | null;
  readonly myHand: readonly TileId[];
  readonly handSizes: readonly number[];
  /** Drawable boneyard size; 0 when the mode has no boneyard. Unused stock is never counted. */
  readonly boneyardCount: number;
  readonly consecutivePasses: number;
  readonly scores: readonly number[];
  readonly targetScore: number;
  readonly myTeam: number;
  readonly legalMoves: readonly Placement[];
  readonly end: HandEnd | null;
  readonly result: HandResult | null;
  readonly history: readonly HandResult[];
  readonly winnerTeam: number | null;
  readonly seatCount: 2 | 4;
  /** Sides, as in the preset (partners share a side). */
  readonly teams: readonly (readonly SeatIndex[])[];
  /** Which opening rule chose this hand's opener (public). */
  readonly openingRule: OpeningRule['kind'];
  /** Public action log for the current hand. */
  readonly log: readonly PublicAction[];
}

export function seatView(state: MatchState, viewer: SeatIndex): SeatView {
  const rules = rulesOf(state);
  const h = state.hand;
  const myHand = [...h.hands[viewer]!];
  return {
    viewer,
    mode: state.config.mode,
    seq: state.seq,
    phase: state.phase,
    handNumber: h.number,
    turn: h.turn,
    opener: h.opener,
    requirement: h.line.tiles.length ? h.requirement : requirementFor(h.requirement, h.opener, viewer),
    line: h.line,
    openEnds: openEnds(h.line),
    myHand,
    handSizes: h.hands.map((x) => x.length),
    boneyardCount: h.stockKind === 'boneyard' ? h.stock.length : 0,
    consecutivePasses: h.consecutivePasses,
    scores: state.scores,
    targetScore: state.config.targetScore,
    myTeam: rules.teams.findIndex((t) => t.includes(viewer)),
    legalMoves: state.phase === 'playing' && h.turn === viewer ? legalMovesForHand(myHand, h.line, h.requirement) : [],
    end: h.end,
    result: h.result,
    history: state.history,
    winnerTeam: state.winnerTeam,
    seatCount: rules.seatCount,
    teams: rules.teams,
    openingRule: h.openingRule,
    log: h.log,
  };
}
