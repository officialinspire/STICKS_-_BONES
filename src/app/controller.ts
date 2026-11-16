/**
 * TableController: the only object the table UI talks to.
 *
 * It owns the shared-device state machine (privacy.ts), decides which view
 * the UI may render (one human's private view, or a concealed public table),
 * redacts engine events for whoever is revealed, and only forwards a human's
 * intent when that human is the revealed seat on turn. Game legality stays in
 * the engine; AI scheduling and stale-decision protection stay in GameSession.
 */
import { redactEventsForSeat, type GameEvent } from '../engine/events';
import type { EndId } from '../engine/line';
import type { SeatIndex, TileId } from '../engine/types';
import type { SeatView } from '../engine/view';
import { revealedSeat, transition, type ControllerEvent, type ControllerState, type Facts, type PauseReason } from './privacy';
import type { GameSession } from './session';

export type ControllerListener = (events: readonly GameEvent[], state: ControllerState) => void;

export class TableController {
  readonly session: GameSession;
  /** True when two humans share the device: hands are covered between turns. */
  readonly privacy: boolean;
  #state: ControllerState;
  #perspective: SeatIndex;
  #listeners = new Set<ControllerListener>();
  #unsub: () => void;

  constructor(session: GameSession, opts: { restored?: boolean } = {}) {
    this.session = session;
    this.privacy = session.opponent === 'local' && session.humanSeats.length === 2;
    this.#perspective = session.humanSeats[0] ?? 0;
    this.#state = transition({ kind: 'round-results' }, { type: 'start', facts: this.#facts(), restored: Boolean(opts.restored) });
    this.#followPerspective();
    this.#unsub = session.subscribe((events) => this.#onGame(events));
  }

  get state(): ControllerState {
    return this.#state;
  }

  /** Seat whose hand may be rendered now, or null. */
  revealed(): SeatIndex | null {
    if (this.privacy) return revealedSeat(this.#state, true, null);
    // Solo: the one human always sees their own hand. Dev both-seats: whichever human is on turn (or was last).
    return revealedSeat(this.#state, false, this.#perspective);
  }

  /** Which seat sits at the bottom of the screen. */
  perspective(): SeatIndex {
    return this.#perspective;
  }

  /** The only view the UI may render. Never contains a hand that is not revealed. */
  view(): SeatView {
    const r = this.revealed();
    return r === null ? this.session.concealedView(this.#perspective) : this.session.viewFor(r);
  }

  /** The revealed human is on turn and may act. */
  canAct(): boolean {
    return this.#state.kind === 'human-turn' && this.session.canAct(this.#state.seat);
  }

  subscribe(fn: ControllerListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- shared-device intents -------------------------------------------------

  /** "Pass the device to …" acknowledged. */
  ready(): void {
    this.#dispatch({ type: 'ready' });
  }
  /** Explicit "Reveal hand". */
  reveal(): void {
    this.#dispatch({ type: 'reveal', facts: this.#facts() });
  }
  /** Tab hidden, app switched, orientation changed: cover any revealed hand. */
  conceal(reason: 'hidden' | 'orientation'): void {
    if (!this.privacy) return;
    this.#dispatch({ type: 'conceal', reason });
  }
  pause(reason: PauseReason): void {
    if (this.#state.kind === 'paused') return;
    this.session.pause();
    this.#dispatch({ type: 'pause', reason });
  }
  resume(): void {
    if (this.#state.kind !== 'paused') return;
    this.session.resume();
    this.#dispatch({ type: 'resume', facts: this.#facts() });
  }

  // ---- game intents (only for the revealed human on turn) ---------------------

  play(tile: TileId, end: EndId): boolean {
    return this.canAct() && this.session.play(this.#seat(), tile, end);
  }
  draw(): boolean {
    return this.canAct() && this.session.draw(this.#seat());
  }
  pass(): boolean {
    return this.canAct() && this.session.pass(this.#seat());
  }
  nextHand(): boolean {
    return this.#state.kind === 'round-results' && this.session.nextHand();
  }

  dispose(): void {
    this.#unsub();
    this.#listeners.clear();
    this.session.dispose();
  }

  // ---- internals ----------------------------------------------------------------

  #seat(): SeatIndex {
    return (this.#state as { seat: SeatIndex }).seat;
  }

  #facts(): Facts {
    const s = this.session;
    return { phase: s.phase, turn: s.turn, turnIsHuman: s.isHuman(s.turn), privacy: this.privacy };
  }

  /** The bottom seat follows whichever human is (about to be) on the device; AI turns keep the last one. */
  #followPerspective(): void {
    const st = this.#state;
    if ((st.kind === 'covered' || st.kind === 'revealing' || st.kind === 'human-turn') && this.session.isHuman(st.seat)) this.#perspective = st.seat;
  }

  #dispatch(e: ControllerEvent): void {
    const next = transition(this.#state, e);
    if (next === this.#state) return;
    this.#state = next;
    this.#followPerspective();
    for (const fn of this.#listeners) fn([], next);
  }

  #onGame(events: readonly GameEvent[]): void {
    this.#state = transition(this.#state, { type: 'game-changed', facts: this.#facts() });
    this.#followPerspective();
    // Redact for the seat revealed AFTER the change: a human's own draw stays visible to them;
    // nothing private reaches a covered screen or an AI turn.
    const visible = redactEventsForSeat(events, this.revealed());
    for (const fn of this.#listeners) fn(visible, this.#state);
  }
}
