/**
 * Table controller state machine for shared-device play. Independent of game
 * legality: it only sees coarse public facts (phase, whose turn, is that seat
 * human, is privacy on) and decides what the screen may show.
 *
 *   covered       privacy cover up: "Pass the device to <name>" → Ready
 *   revealing     second step: "<name>, reveal your hand?" → Reveal hand
 *   human-turn    the revealed human's hand is rendered and they may act
 *   ai-turn       a computer seat is acting; public table only
 *   round-results hand over / results sheet; public information only
 *   paused        dialog open or tab hidden; no hand rendered
 *
 * With privacy on (two humans), every entry into a human turn from any other
 * state goes through covered → revealing → human-turn, and pausing, hiding the
 * tab, an orientation change, a restored game or a resume always lands on the
 * cover again. Privacy here is ordinary shared-device protection, not a
 * defence against someone inspecting storage or devtools.
 */
import type { Phase } from '../engine/state';
import type { SeatIndex } from '../engine/types';

export type CoverReason = 'handoff' | 'new-hand' | 'start' | 'restored' | 'resume' | 'hidden' | 'orientation';
export type PauseReason = 'dialog' | 'hidden';

export type ControllerState =
  | { readonly kind: 'covered'; readonly seat: SeatIndex; readonly reason: CoverReason }
  | { readonly kind: 'revealing'; readonly seat: SeatIndex }
  | { readonly kind: 'human-turn'; readonly seat: SeatIndex }
  | { readonly kind: 'ai-turn'; readonly seat: SeatIndex }
  | { readonly kind: 'round-results' }
  | { readonly kind: 'paused'; readonly reason: PauseReason };

export interface Facts {
  readonly phase: Phase;
  readonly turn: SeatIndex;
  readonly turnIsHuman: boolean;
  /** True when two humans share the device. */
  readonly privacy: boolean;
}

export type ControllerEvent =
  | { readonly type: 'start'; readonly facts: Facts; readonly restored: boolean }
  | { readonly type: 'game-changed'; readonly facts: Facts }
  | { readonly type: 'ready' }
  | { readonly type: 'reveal'; readonly facts: Facts }
  | { readonly type: 'pause'; readonly reason: PauseReason }
  | { readonly type: 'resume'; readonly facts: Facts }
  | { readonly type: 'conceal'; readonly reason: 'hidden' | 'orientation' };

const NOTHING_REVEALED: ControllerState = { kind: 'round-results' };

/** Where the controller should be for these facts, given what it showed before. */
function settle(prev: ControllerState, f: Facts, reason: CoverReason): ControllerState {
  if (f.phase !== 'playing') return { kind: 'round-results' };
  if (!f.turnIsHuman) return { kind: 'ai-turn', seat: f.turn };
  if (!f.privacy) return { kind: 'human-turn', seat: f.turn };
  // The same human keeps the device while still on turn (e.g. after a draw).
  if ((prev.kind === 'human-turn' || prev.kind === 'covered' || prev.kind === 'revealing') && prev.seat === f.turn) return prev;
  return { kind: 'covered', seat: f.turn, reason };
}

export function transition(state: ControllerState, e: ControllerEvent): ControllerState {
  switch (e.type) {
    case 'start':
      return settle(NOTHING_REVEALED, e.facts, e.restored ? 'restored' : 'start');
    case 'game-changed':
      if (state.kind === 'paused') return state;
      return settle(state, e.facts, state.kind === 'round-results' ? 'new-hand' : 'handoff');
    case 'ready':
      return state.kind === 'covered' ? { kind: 'revealing', seat: state.seat } : state;
    case 'reveal':
      if (state.kind !== 'revealing') return state;
      // Only reveal if that human is still the one on turn.
      if (e.facts.phase === 'playing' && e.facts.turnIsHuman && e.facts.turn === state.seat) return { kind: 'human-turn', seat: state.seat };
      return settle(NOTHING_REVEALED, e.facts, 'handoff');
    case 'pause':
      return { kind: 'paused', reason: e.reason };
    case 'resume':
      // Nothing private is remembered across a pause: re-derive from scratch.
      return state.kind === 'paused' ? settle(NOTHING_REVEALED, e.facts, 'resume') : state;
    case 'conceal':
      if (state.kind === 'human-turn' || state.kind === 'revealing') return { kind: 'covered', seat: state.seat, reason: e.reason };
      return state;
  }
}

/** Seat whose hand may be rendered right now, or null for a public-table view. */
export function revealedSeat(state: ControllerState, privacy: boolean, soloHuman: SeatIndex | null): SeatIndex | null {
  if (state.kind === 'human-turn') return state.seat;
  if (!privacy) return soloHuman;
  return null;
}
