/**
 * GameSession owns the MatchState and is the ONLY place commands are applied.
 * The UI reads redacted SeatViews and calls intent methods; it never edits
 * rules state. AI turns and hand resolution are scheduled here with an
 * injectable scheduler so tests can run them synchronously.
 */
import { chooseCommand } from '../ai/simple';
import type { Command, CommandError } from '../engine/commands';
import { createMatchConfig, type MatchConfig } from '../engine/config';
import { redactEventsForSeat, type GameEvent } from '../engine/events';
import { applyCommand, createMatch, rulesOf } from '../engine/match';
import type { ModeRules } from '../engine/rules/presets';
import type { MatchState } from '../engine/state';
import type { EndId } from '../engine/line';
import type { ModeId, SeatIndex, TargetScore, TileId } from '../engine/types';
import { seatView, type SeatView } from '../engine/view';

/** 'ai' = solo vs Cousin; 'local' = two humans pass-and-play; 'dev-both' = developer controls both seats, no handoff. */
export type OpponentKind = 'ai' | 'local' | 'dev-both';

export interface SessionOptions {
  readonly mode: ModeId;
  readonly opponent: OpponentKind;
  readonly targetScore?: TargetScore;
  readonly seed: number | string;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Timing {
  readonly aiPlay: number;
  readonly aiDraw: number;
  readonly resolve: number;
}
export const DEFAULT_TIMING: Timing = { aiPlay: 750, aiDraw: 380, resolve: 900 };

export type SessionListener = (events: readonly GameEvent[]) => void;

export class GameSession {
  readonly opponent: OpponentKind;
  readonly config: MatchConfig;
  readonly rules: ModeRules;
  #state: MatchState;
  #listeners = new Set<SessionListener>();
  #timer: unknown = null;
  #viewer: SeatIndex = 0;
  #handoffPending = false;
  #lastError: CommandError | null = null;
  #disposed = false;

  constructor(
    opts: SessionOptions | { readonly state: MatchState; readonly opponent: OpponentKind },
    private readonly scheduler: Scheduler = realScheduler,
    private readonly timing: Timing = DEFAULT_TIMING,
  ) {
    if ('state' in opts) {
      this.#state = opts.state;
      this.opponent = opts.opponent;
      this.config = opts.state.config;
    } else {
      this.opponent = opts.opponent;
      const humanSeats: SeatIndex[] = opts.opponent === 'ai' ? [0] : [0, 1];
      const cfg = createMatchConfig({ mode: opts.mode, humanSeats, ...(opts.targetScore ? { targetScore: opts.targetScore } : {}) });
      if (!cfg.ok) throw new Error(cfg.errors.map((e) => e.message).join('; '));
      const created = createMatch(cfg.config, opts.seed);
      if (!created.ok) throw new Error(created.errors.join('; '));
      this.#state = created.state;
      this.config = cfg.config;
    }
    this.rules = rulesOf(this.config);
    this.#syncViewer(true);
    this.#schedule();
  }

  // ---- reading --------------------------------------------------------------

  get viewer(): SeatIndex {
    return this.#viewer;
  }
  get handoffPending(): boolean {
    return this.#handoffPending;
  }
  get lastError(): CommandError | null {
    return this.#lastError;
  }
  view(): SeatView {
    return seatView(this.#state, this.#viewer);
  }
  isHuman(seat: SeatIndex): boolean {
    return this.config.seats[seat]?.controller.kind === 'human';
  }
  seatName(seat: SeatIndex): string {
    if (this.opponent === 'ai') return seat === 0 ? 'You' : 'Cousin';
    return `Player ${seat + 1}`;
  }
  teamName(team: number): string {
    return this.seatName(this.rules.teams[team]![0]!);
  }
  /** True when the viewer may act right now (their turn, no handoff screen). */
  canAct(): boolean {
    const v = this.view();
    return v.phase === 'playing' && v.turn === this.#viewer && this.isHuman(this.#viewer) && !this.#handoffPending;
  }

  /** Dev/test hook: the full secret state. Never call from production UI. */
  debugState(): MatchState {
    return this.#state;
  }

  subscribe(fn: SessionListener): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  // ---- intents ----------------------------------------------------------------

  play(tile: TileId, end: EndId): boolean {
    return this.#humanCommand({ type: 'play', seq: this.#state.seq, seat: this.#viewer, tile, end });
  }
  draw(): boolean {
    return this.#humanCommand({ type: 'draw', seq: this.#state.seq, seat: this.#viewer });
  }
  pass(): boolean {
    return this.#humanCommand({ type: 'pass', seq: this.#state.seq, seat: this.#viewer });
  }
  nextHand(): boolean {
    if (this.#state.phase !== 'hand-resolved') return false;
    return this.#apply({ type: 'start-next-hand', seq: this.#state.seq });
  }
  confirmHandoff(): void {
    if (!this.#handoffPending) return;
    this.#handoffPending = false;
    this.#emit([]);
  }
  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== null) this.scheduler.clear(this.#timer);
    this.#timer = null;
    this.#listeners.clear();
  }

  // ---- internals --------------------------------------------------------------

  #humanCommand(cmd: Command): boolean {
    if (!this.canAct()) return false;
    return this.#apply(cmd);
  }

  #apply(cmd: Command): boolean {
    if (this.#disposed) return false;
    const r = applyCommand(this.#state, cmd);
    if (!r.ok) {
      this.#lastError = r.error;
      this.#emit([]);
      return false;
    }
    this.#lastError = null;
    this.#state = r.state;
    this.#syncViewer(cmd.type === 'start-next-hand');
    this.#emit(r.events);
    this.#schedule();
    return true;
  }

  /** Pick which seat's private view is shown, raising a handoff screen between two humans. */
  #syncViewer(newHand: boolean): void {
    const s = this.#state;
    if (s.phase !== 'playing') return;
    const turn = s.hand.turn;
    if (!this.isHuman(turn)) return;
    if (this.opponent === 'local') {
      if (turn !== this.#viewer || newHand) {
        this.#viewer = turn;
        this.#handoffPending = true;
      }
    } else {
      this.#viewer = turn;
    }
  }

  #emit(events: readonly GameEvent[]): void {
    const visible = redactEventsForSeat(events, this.#viewer);
    for (const fn of this.#listeners) fn(visible);
  }

  #schedule(): void {
    if (this.#timer !== null) this.scheduler.clear(this.#timer);
    this.#timer = null;
    if (this.#disposed) return;
    const s = this.#state;
    const seq = s.seq;
    if (s.phase === 'hand-ended') {
      this.#timer = this.scheduler.set(() => {
        this.#timer = null;
        if (this.#state.seq === seq) this.#apply({ type: 'resolve-hand', seq });
      }, this.timing.resolve);
      return;
    }
    if (s.phase !== 'playing' || this.isHuman(s.hand.turn)) return;
    const aiSeat = s.hand.turn;
    const view = seatView(s, aiSeat);
    const cmd = chooseCommand(view, this.rules.noMove.kind === 'draw-until-playable');
    if (!cmd) return;
    this.#timer = this.scheduler.set(
      () => {
        this.#timer = null;
        if (this.#state.seq === seq) this.#apply(cmd);
      },
      cmd.type === 'draw' ? this.timing.aiDraw : this.timing.aiPlay,
    );
  }
}

